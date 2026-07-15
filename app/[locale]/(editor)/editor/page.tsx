"use client";

import { useState, useRef, useEffect, useCallback, lazy, Suspense, useMemo, startTransition } from "react";
import { toBlob } from 'html-to-image';
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { loadVideoFromIndexedDB, deleteRecordedVideo } from "@/hooks/useScreenRecording";
import { useVideoUpload } from "@/hooks/useVideoUpload";
import { useImageProjects } from "@/hooks/useImageProjects";
import { getUploadedVideo, deleteUploadedVideo } from "@/lib/video-upload-cache";
import { getUploadedImage, deleteUploadedImage } from "@/lib/image-upload-cache";
import { useEditorMode } from "@/hooks/useEditorMode";
import { useActiveTool } from "@/hooks/useActiveTool";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { useVideoExport } from "@/hooks/useVideoExport";
import { useVideoThumbnails, type VideoThumbnail } from "@/hooks/useVideoThumbnails";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { clearAllThumbnailCache } from "@/lib/thumbnail-cache";
import { loadAndRegisterCustomFonts } from "@/lib/custom-fonts";
import { addVideoToSessionLibrary, addVideoToLibraryWithMetadata, getLibraryVideo, findExistingVideo, persistLibraryVideos } from "@/lib/videos-library";
import { calculateTotalDuration, findNextClipPosition, getClipAtTime, getClipPlaybackRate, getClipTimelineDuration, splitClipAtTime, timelineToClipTime as mapTimelineToClipTime, type VideoTrackClip } from "@/types/video-track.types";
import type { ExportQuality, BackgroundTab, VideoCanvasHandle, BackgroundColorConfig, BackgroundVideoItem, AspectRatio, CropArea, ZoomFragment, AudioTrack, ImageExportFormat } from "@/types";
import type { TrimRange } from "@/types/timeline.types";
import type { MockupConfig, MenuPage } from "@/types/mockup.types";
import type { EditorState } from "@/types/editor-state.types";
import { createInitialEditorState } from "@/types/editor-state.types";
import { DEFAULT_MOCKUP_CONFIG, getMockupDefaultConfig } from "@/types/mockup.types";
import type { CanvasElement } from "@/types/canvas-elements.types";
import type { CameraConfig } from "@/types/camera.types";
import type { Preview3DConfig, ImageMaskConfig } from "@/types/photo.types";
import { DEFAULT_MASK_CONFIG, PREVIEW_CONFIGS } from "@/types/photo.types";
import { MOCKUPS } from "@/lib/mockup-data";
import { gradientToCss, createZoomFragment, ASPECT_RATIO_DIMENSIONS } from "@/types";
import { ToolsSidebar } from "@/app/components/ui/editor/ToolsSidebar";
import { MobileToolsMenu } from "@/app/components/ui/editor/MobileToolsMenu";
import { MobileControlPanel } from "@/app/components/ui/editor/MobileControlPanel";
import { EditorTopBar } from "@/app/components/ui/editor/EditorTopBar";
import { LocalProjectsDialog } from "@/app/components/ui/editor/LocalProjectsDialog";
import { VideoCanvas } from "@/app/components/ui/editor/VideoCanvas";
import { PlayerControls } from "@/app/components/ui/editor/PlayerControls";
import { findValidFragmentPosition } from "@/app/components/ui/editor/ZoomFragmentTrackItem";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TimelineSkeleton } from "@/app/components/ui/Skeleton";
import { AudioTrimModal } from "@/app/components/ui/editor/AudioTrimModal";
import { useAuth } from "@/app/contexts/useAuth";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";
import { VIDEO_Z_INDEX } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { bgImagesDelete, bgImagesGetAll, bgImagesSave } from "@/lib/bg-images-idb";
import { hydrateUploadedAudios, persistAudioAssets, stageAudioAsset } from "@/lib/audio-assets";
import { deleteLocalVideoProject, getCurrentLocalVideoProjectId, getLocalVideoProject, listLocalVideoProjects, putLocalVideoProject, setCurrentLocalVideoProjectId } from "@/lib/local-projects";
import type { LocalVideoProjectPreview } from "@/types/local-project.types";
import { bgVideosDelete, bgVideosGetAll, bgVideosSave } from "@/lib/bg-videos-idb";
import { DEFAULT_BACKGROUND_VIDEO_TRANSFORM } from "@/types/background.types";
import { DEFAULT_MOCKUP_ANIMATION } from "@/types/mockup-animation.types";
import type { PreviewQuality, ProxyStatus } from "@/types/player-control.types";
import { createSessionVideoProxy, disposeSessionVideoProxy, type SessionVideoProxy } from "@/lib/session-video-proxies";

const ControlPanel = lazy(() => import("@/app/components/ui/editor/ControlPanel").then(mod => ({ default: mod.ControlPanel })));
const Timeline = lazy(() => import("@/app/components/ui/editor/Timeline").then(mod => ({ default: mod.Timeline })));
const ExportOverlay = lazy(() => import("@/app/components/ui/ExportOverlay").then(mod => ({ default: mod.ExportOverlay })));
const VideoCropperModal = lazy(() => import("@/app/components/ui/editor/VideoCropperModal").then(mod => ({ default: mod.VideoCropperModal })));
const ImageCropperModal = lazy(() => import("@/app/components/ui/editor/ImageCropperModal").then(mod => ({ default: mod.ImageCropperModal })));
const PhotoEditorPlaceholder = lazy(() => import("@/app/components/ui/editor/PhotoEditorPlaceholder").then(mod => ({ default: mod.PhotoEditorPlaceholder })));

function readVideoDuration(file: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        const cleanup = () => {
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(url);
        };

        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            cleanup();
            resolve(duration);
        };
        video.onerror = () => {
            cleanup();
            reject(new Error("The selected background video could not be read."));
        };
        video.src = url;
    });
}

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 15_000): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error("Timed out while changing preview media.")), timeoutMs);
        const finish = (error?: Error) => {
            window.clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onReady);
            video.removeEventListener("error", onError);
            if (error) reject(error);
            else resolve();
        };
        const onReady = () => finish();
        const onError = () => finish(new Error("The preview media could not be loaded."));
        video.addEventListener("loadedmetadata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

export default function Editor() {
    // Editor mode (video/photo) from URL params
    const { mode: editorMode, isVideoMode, isPhotoMode } = useEditorMode();

    // Auth — needed for building production-ready Recipe JSON
    const { user } = useAuth();
    const {
        imagePhoneActive, setImagePhoneActive,
        imagePhoneX, setImagePhoneX,
        imagePhoneY, setImagePhoneY,
        imagePhoneScale, setImagePhoneScale,
        imagePhoneRotX, setImagePhoneRotX,
        imagePhoneRotY, setImagePhoneRotY,
        imagePhoneRotZ, setImagePhoneRotZ,
        imagePhonePerspective, setImagePhonePerspective,
        imagePhoneDevice, setImagePhoneDevice,
        imagePhonePresetId, setImagePhonePresetId,
        imagePhoneOpening, setImagePhoneOpening,
        imagePhoneShadow, setImagePhoneShadow,
        imagePhoneShadowColor, setImagePhoneShadowColor,
        imagePhoneRefWidth, setImagePhoneRefWidth,
        imagePhoneAnimation, setImagePhoneAnimation,
    } = useMockup3dContext();

    // Undo/Redo system - centralized state management
    const {
        state: editorState,
        setState: setEditorState,
        undo,
        redo,
        canUndo,
        canRedo,
        clearHistory,
    } = useUndoRedo<EditorState>(createInitialEditorState());

    const handleUndo = useCallback(() => {
        undo();
        setUndoRedoVersion(v => v + 1);
    }, [undo]);

    const handleRedo = useCallback(() => {
        redo();
        setUndoRedoVersion(v => v + 1);
    }, [redo]);

    const [undoRedoVersion, setUndoRedoVersion] = useState(-1);
    const [wallpaperShowAll, setWallpaperShowAll] = useState(false);

    // Image state for photo mode
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [imageExportProgress, setImageExportProgress] = useState<{
        status: "idle" | "preparing" | "rendering" | "complete" | "error";
        progress: number;
        message: string;
    }>({
        status: "idle",
        progress: 0,
        message: "",
    });

    // Screen capture hook
    const { captureScreen, isCapturing } = useScreenCapture();

    // Image projects system (IndexedDB persistence for photo mode)
    const {
        projects: imageProjects,
        currentProject,
        isLoading: isLoadingProjects,
        isSaving: isSavingProject,
        createProject,
        saveCurrentProject,
        switchToProject,
        removeProject,
    } = useImageProjects();

    // Photo mode 3D preview state
    const [selectedPreviewId, setSelectedPreviewId] = useState<string>("front");
    const [canvasImageUrl, setCanvasImageUrl] = useState<string | null>(null);
    const [imageTransform, setImageTransform] = useState<Preview3DConfig>({
        id: "front",
        label: "Front",
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0,
        translateY: 0,
        scale: 0.9,
        perspective: 600,
    });
    const [apply3DToBackground, setApply3DToBackground] = useState(false);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [imageMaskConfig, setImageMaskConfig] = useState<ImageMaskConfig>(DEFAULT_MASK_CONFIG);
    const [videoMaskConfig, setVideoMaskConfig] = useState<ImageMaskConfig>(DEFAULT_MASK_CONFIG);

    // Active tool: lee `?m=<tool>` de la URL en mount. setActiveTool
    // actualiza la URL con replaceState (preserva mode y otros params).
    const [activeTool, setActiveTool] = useActiveTool();
    const [elementsTextTabTrigger] = useState(0);
    const [backgroundTab, setBackgroundTab] = useState<BackgroundTab>("wallpaper");
    const [selectedWallpaper, setSelectedWallpaper] = useState(0);
    const [backgroundBlur, setBackgroundBlur] = useState(0);
    const [padding, setPadding] = useState(10);
    const [roundedCorners, setRoundedCorners] = useState(10);
    const [shadows, setShadows] = useState(10);
    const [isControlPanelOpen, setIsControlPanelOpen] = useState(true);
    const [isMobileControlPanelOpen, setIsMobileControlPanelOpen] = useState(false);
    // Initial page for the MockupMenu when the user clicks a mockup already
    // applied on the canvas. Updated by handleMockupClick; consumed by the
    // MockupMenu via the `initialPage` prop (resets to "home" on remount when
    // the menu is collapsed/expanded).
    const [initialMockupMenuPage, setInitialMockupMenuPage] = useState<MenuPage>("home");
    // Increments on every handleMockupClick so the MockupMenu re-navigates
    // even when the user clicks the SAME mockup twice in a row (in which
    // case initialMockupMenuPage would not change and the useEffect inside
    // MockupMenu would not fire).
    const [mockupMenuNavigationToken, setMockupMenuNavigationToken] = useState(0);

    // Video/2D mockup transform state (rotation, position and independent scale)
    const [videoTransform, setVideoTransform] = useState<{ rotation: number; translateX: number; translateY: number; scale: number }>({
        rotation: 0,
        translateX: 0,
        translateY: 0,
        scale: 1,
    });

    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const bgImgUrlToIdRef = useRef<Map<string, string>>(new Map());
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
    const [unsplashBgUrl, setUnsplashBgUrl] = useState<string>("");
    const [uploadedBackgroundVideos, setUploadedBackgroundVideos] = useState<BackgroundVideoItem[]>([]);
    const [selectedBackgroundVideoId, setSelectedBackgroundVideoId] = useState<string>("");
    const [backgroundVideoTransform, setBackgroundVideoTransform] = useState(() => ({ ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM }));
    const backgroundVideoUrlsRef = useRef<Map<string, string>>(new Map());
    const selectedBackgroundVideoUrl = useMemo(
        () => uploadedBackgroundVideos.find(video => video.id === selectedBackgroundVideoId)?.url ?? "",
        [uploadedBackgroundVideos, selectedBackgroundVideoId]
    );

    // Background color/gradient state
    const [backgroundColorConfig, setBackgroundColorConfig] = useState<BackgroundColorConfig | null>(null);

    // Aspect ratio, fullscreen, and cropper state
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
    const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
    const [customDimensions, setCustomDimensions] = useState<{ width: number; height: number } | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropArea, setCropArea] = useState<CropArea | undefined>(undefined);

    // Computed: which dimensions to use for the canvas
    const customAspectRatio = useMemo(() => {
        return aspectRatio === "auto"
            ? (isPhotoMode ? imageDimensions : videoDimensions)
            : (aspectRatio === "custom" ? customDimensions : null);
    }, [aspectRatio, isPhotoMode, imageDimensions, videoDimensions, customDimensions]);

    // Refs for fullscreen
    const editorAreaRef = useRef<HTMLDivElement>(null);
    const clipSwitchTimeRef = useRef<number | null>(null);
    const isSeekingToClipRef = useRef<boolean>(false);

    // Video state
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoId, setVideoId] = useState<string | null>(null);
    const [videoDuration, setVideoDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [previewQuality, setPreviewQuality] = useState<PreviewQuality>("auto");
    const [proxyStatus, setProxyStatus] = useState<ProxyStatus>("idle");
    const [proxyProgress, setProxyProgress] = useState(0);
    const [proxyCount, setProxyCount] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<VideoCanvasHandle>(null);
    const isSwitchingClipRef = useRef<boolean>(false);

    // Timeline state
    const [timelineZoom, setTimelineZoom] = useState<number>(1);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);
    const [trimRange, setTrimRange] = useState<TrimRange>({ start: 0, end: 0 });
    const animationFrameRef = useRef<number | null>(null);
    const videoFrameCallbackRef = useRef<{ video: HTMLVideoElement; id: number } | null>(null);
    const schedulePlaybackFrameRef = useRef<() => void>(() => {});
    const cancelPlaybackFrameRef = useRef<() => void>(() => {});
    const justEndedRef = useRef<boolean>(false);
    const wasPlayingBeforeDragRef = useRef<boolean>(false);
    const isExportingRef = useRef(false);
    const [scrubTime, setScrubTime] = useState<number>(0);
    // Ref that is always in sync with scrubTime — avoids stale closure in handlePlayheadDragEnd
    const scrubTimeRef = useRef<number>(0);
    const lastScrubMediaSeekRef = useRef(0);

    useEffect(() => {
        const saved = window.localStorage.getItem("openvid-preview-quality");
        if (saved === "auto" || saved === "full" || saved === "half" || saved === "quarter") {
            setPreviewQuality(saved);
        }
    }, []);

    const handlePreviewQualityChange = useCallback((quality: PreviewQuality) => {
        setPreviewQuality(quality);
        window.localStorage.setItem("openvid-preview-quality", quality);
    }, []);

    // Zoom fragments state
    const [zoomFragments, setZoomFragments] = useState<ZoomFragment[]>([]);
    const [selectedZoomFragmentId, setSelectedZoomFragmentId] = useState<string | null>(null);

    // Ref to always have the latest zoomFragments value (prevents stale closures)
    const zoomFragmentsRef = useRef<ZoomFragment[]>([]);
    useEffect(() => {
        zoomFragmentsRef.current = zoomFragments;
    }, [zoomFragments]);

    // Mockup state
    const [mockupId, setMockupId] = useState<string>("none");
    const [mockupConfig, setMockupConfig] = useState<MockupConfig>(DEFAULT_MOCKUP_CONFIG);

    // Canvas elements state
    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    // Audio state
    const [uploadedAudios, setUploadedAudios] = useState<import("@/types/audio.types").UploadedAudio[]>([]);
    const [audioTracks, setAudioTracks] = useState<import("@/types/audio.types").AudioTrack[]>([]);
    const [muteOriginalAudio, setMuteOriginalAudio] = useState<boolean>(false);
    const [masterVolume, setMasterVolume] = useState<number>(1);
    const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string | null>(null);
    // Whether the currently loaded source video file contains an audio stream
    const [videoHasAudioTrack, setVideoHasAudioTrack] = useState<boolean>(true);

    const [isRecordedVideo, setIsRecordedVideo] = useState<boolean>(false);

    // Camera overlay state (from recorded video's camera track, or post-record adjustments)
    const [cameraConfig, setCameraConfig] = useState<CameraConfig | null>(null);
    const [cameraUrl, setCameraUrl] = useState<string | null>(null);

    const handleCameraConfigChange = useCallback((partial: Partial<CameraConfig>) => {
        setCameraConfig((prev) => (prev ? { ...prev, ...partial } : prev));
    }, []);

    const handleCameraClick = useCallback(() => {
        setActiveTool("camera");
    }, []);

    // Auto-save current image project when configurations change
    const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isRestoringProjectRef = useRef(false);
    const isLoadingFromCacheRef = useRef(false);
    const lastRestoredProjectIdRef = useRef<string | null>(null);

    const autoSaveCurrentProject = useCallback(async () => {
        if (!isPhotoMode || !imageUrl || !currentProject) return;

        // Don't auto-save during project restoration
        if (isRestoringProjectRef.current) return;

        // Debounce saves to avoid excessive writes
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                await saveCurrentProject({
                    backgroundTab,
                    selectedWallpaper,
                    backgroundBlur,
                    selectedImageUrl,
                    selectedBackgroundVideoId,
                    backgroundVideoTransform,
                    backgroundColorConfig,
                    padding,
                    roundedCorners,
                    shadows,
                    aspectRatio,
                    customDimensions,
                    cropArea,
                    mockupId,
                    mockupConfig,
                    canvasElements,
                    imageTransform: {
                        rotation: videoTransform.rotation,
                        translateX: videoTransform.translateX,
                        translateY: videoTransform.translateY,
                        scale: videoTransform.scale,
                    },
                    imagePreview3D: imageTransform,
                    apply3DToBackground,
                    imageMaskConfig,
                    imagePhoneActive,
                    imagePhoneX,
                    imagePhoneY,
                    imagePhoneScale,
                    imagePhoneRotX,
                    imagePhoneRotY,
                    imagePhoneRotZ,
                    imagePhonePerspective,
                    imagePhoneDevice,
                    imagePhonePresetId,
                    imagePhoneOpening,
                    imagePhoneShadow,
                    imagePhoneShadowColor,
                    imagePhoneRefWidth,
                    imagePhoneAnimation,
                });
            } catch (error) {
                console.error("Auto-save failed:", error);
            }
        }, 3000); // 3 second debounce
    }, [
        isPhotoMode,
        imageUrl,
        currentProject,
        saveCurrentProject,
        backgroundTab,
        selectedWallpaper,
        backgroundBlur,
        selectedImageUrl,
        selectedBackgroundVideoId,
        backgroundVideoTransform,
        backgroundColorConfig,
        padding,
        roundedCorners,
        shadows,
        aspectRatio,
        customDimensions,
        cropArea,
        mockupId,
        mockupConfig,
        canvasElements,
        videoTransform,
        imageTransform,
        apply3DToBackground,
        imageMaskConfig,
        imagePhoneActive,
        imagePhoneX,
        imagePhoneY,
        imagePhoneScale,
        imagePhoneRotX,
        imagePhoneRotY,
        imagePhoneRotZ,
        imagePhonePerspective,
        imagePhoneDevice,
        imagePhonePresetId,
        imagePhoneOpening,
        imagePhoneShadow,
        imagePhoneShadowColor,
        imagePhoneRefWidth,
        imagePhoneAnimation
    ]);

    useEffect(() => {
        if (currentProject && isPhotoMode && !isRestoringProjectRef.current) {
            autoSaveCurrentProject();
        }
    }, [
        backgroundTab,
        selectedWallpaper,
        backgroundBlur,
        selectedImageUrl,
        selectedBackgroundVideoId,
        backgroundVideoTransform,
        backgroundColorConfig,
        padding,
        roundedCorners,
        shadows,
        aspectRatio,
        customDimensions,
        cropArea,
        mockupId,
        mockupConfig,
        canvasElements,
        videoTransform,
        imageTransform,
        apply3DToBackground,
        imageMaskConfig,
        imagePhoneActive,
        imagePhoneX,
        imagePhoneY,
        imagePhoneScale,
        imagePhoneRotX,
        imagePhoneRotY,
        imagePhoneRotZ,
        imagePhonePerspective,
        imagePhoneDevice,
        imagePhonePresetId,
        imagePhoneOpening,
        imagePhoneShadow,
        imagePhoneShadowColor,
        currentProject,
        isPhotoMode,
        autoSaveCurrentProject,
    ]);

    // Restore current project when project ID changes (not on every currentProject update)
    useEffect(() => {
        if (!isPhotoMode || !currentProject) return;
        if (lastRestoredProjectIdRef.current === currentProject.id) return;

        isRestoringProjectRef.current = true;
        lastRestoredProjectIdRef.current = currentProject.id;

        const imageDataUrl = currentProject.imageDataUrl;

        if (!imageDataUrl) {
            console.error("Project missing imageDataUrl");
            isRestoringProjectRef.current = false;
            return;
        }

        setImageUrl(imageDataUrl);
        setBackgroundTab(currentProject.backgroundTab);
        setSelectedWallpaper(currentProject.selectedWallpaper);
        setBackgroundBlur(currentProject.backgroundBlur);
        setSelectedImageUrl(currentProject.selectedImageUrl);
        setSelectedBackgroundVideoId(currentProject.selectedBackgroundVideoId ?? "");
        setBackgroundVideoTransform(currentProject.backgroundVideoTransform ?? { ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM });
        setBackgroundColorConfig(currentProject.backgroundColorConfig);
        setPadding(currentProject.padding);
        setRoundedCorners(currentProject.roundedCorners);
        setShadows(currentProject.shadows);
        setAspectRatio(currentProject.aspectRatio);
        setCustomDimensions(currentProject.customDimensions);
        setCropArea(currentProject.cropArea);
        setMockupId(currentProject.mockupId);
        setMockupConfig(currentProject.mockupConfig);
        setCanvasElements(currentProject.canvasElements);
        setVideoTransform({ ...currentProject.imageTransform, scale: currentProject.imageTransform.scale ?? 1 });
        setImageTransform(currentProject.imagePreview3D);
        setApply3DToBackground(currentProject.apply3DToBackground);
        setImageMaskConfig(currentProject.imageMaskConfig);
        setImageDimensions({
            width: currentProject.imageWidth,
            height: currentProject.imageHeight,
        });

        if (currentProject.imagePhoneActive !== undefined) setImagePhoneActive(currentProject.imagePhoneActive);
        if (currentProject.imagePhoneX !== undefined) setImagePhoneX(currentProject.imagePhoneX);
        if (currentProject.imagePhoneY !== undefined) setImagePhoneY(currentProject.imagePhoneY);
        if (currentProject.imagePhoneScale !== undefined) setImagePhoneScale(currentProject.imagePhoneScale);
        if (currentProject.imagePhoneRotX !== undefined) setImagePhoneRotX(currentProject.imagePhoneRotX);
        if (currentProject.imagePhoneRotY !== undefined) setImagePhoneRotY(currentProject.imagePhoneRotY);
        if (currentProject.imagePhoneRotZ !== undefined) setImagePhoneRotZ(currentProject.imagePhoneRotZ);
        if (currentProject.imagePhonePerspective !== undefined) setImagePhonePerspective(currentProject.imagePhonePerspective);
        if (currentProject.imagePhoneDevice !== undefined) setImagePhoneDevice(currentProject.imagePhoneDevice);
        if (currentProject.imagePhonePresetId !== undefined) setImagePhonePresetId(currentProject.imagePhonePresetId);
        if (currentProject.imagePhoneOpening !== undefined) setImagePhoneOpening(currentProject.imagePhoneOpening);
        if (currentProject.imagePhoneShadow !== undefined) setImagePhoneShadow(currentProject.imagePhoneShadow);
        if (currentProject.imagePhoneShadowColor !== undefined) setImagePhoneShadowColor(currentProject.imagePhoneShadowColor);
        setImagePhoneRefWidth(currentProject.imagePhoneRefWidth ?? 0);
        setImagePhoneAnimation(currentProject.imagePhoneAnimation ?? { ...DEFAULT_MOCKUP_ANIMATION });

        setTimeout(() => {
            isRestoringProjectRef.current = false;
        }, 500);
    }, [currentProject, isPhotoMode, setImagePhoneActive, setImagePhoneX, setImagePhoneY, setImagePhoneScale, setImagePhoneRotX, setImagePhoneRotY, setImagePhoneRotZ, setImagePhonePerspective, setImagePhoneDevice, setImagePhonePresetId, setImagePhoneOpening, setImagePhoneShadow, setImagePhoneShadowColor, setImagePhoneRefWidth, setImagePhoneAnimation]);

    // Image project handlers
    const handleSelectImageProject = useCallback(async (projectId: string) => {
        if (!isPhotoMode) return;

        // Save current project before switching
        if (currentProject && imageUrl) {
            await autoSaveCurrentProject();
        }

        // Load the selected project
        await switchToProject(projectId);
    }, [isPhotoMode, currentProject, imageUrl, autoSaveCurrentProject, switchToProject]);

    const handleAddImageToCanvas = useCallback(async (projectId: string) => {
        await handleSelectImageProject(projectId);
    }, [handleSelectImageProject]);

    const handleDeleteImageProject = useCallback(async (projectId: string) => {
        // If deleting the current project, cancel auto-save and clear state immediately
        const isDeletingCurrent = currentProject?.id === projectId;

        if (isDeletingCurrent) {
            // Cancel any pending auto-save to prevent race condition
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
            }
        }

        await removeProject(projectId);

        // Clear canvas if we deleted the current project
        if (isDeletingCurrent) {
            setImageUrl(null);
            setCanvasImageUrl(null);
            setImageDimensions(null);
            // Reset to default state
            setBackgroundTab("wallpaper");
            setSelectedWallpaper(0);
            setBackgroundBlur(0);
            setSelectedBackgroundVideoId("");
            setBackgroundVideoTransform({ ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM });
            setPadding(10);
            setRoundedCorners(10);
            setShadows(10);
            setAspectRatio("auto");
            setCustomDimensions(null);
            setCropArea(undefined);
            setMockupId("none");
            setMockupConfig(DEFAULT_MOCKUP_CONFIG);
            setCanvasElements([]);
            setImageTransform({ id: "front", label: "Front", rotateX: 0, rotateY: 0, rotateZ: 0, translateY: 0, scale: 0.9, perspective: 600 });
            setApply3DToBackground(false);
            setImageMaskConfig(DEFAULT_MASK_CONFIG);
        }
    }, [currentProject, removeProject]);

    const handleUploadImageToHistory = useCallback(async (file: File) => {
        // This will create a new project when user uploads from history menu
        try {
            const img = await createImageBitmap(file);
            const project = await createProject(
                file,
                file.name,
                img.width,
                img.height,
                {
                    backgroundTab,
                    selectedWallpaper,
                    backgroundBlur,
                    selectedImageUrl,
                    selectedBackgroundVideoId,
                    backgroundVideoTransform,
                    backgroundColorConfig,
                    padding,
                    roundedCorners,
                    shadows,
                    aspectRatio,
                    customDimensions,
                    cropArea,
                    mockupId,
                    mockupConfig,
                    canvasElements,
                    imageTransform: {
                        rotation: videoTransform.rotation,
                        translateX: videoTransform.translateX,
                        translateY: videoTransform.translateY,
                        scale: videoTransform.scale,
                    },
                    imagePreview3D: imageTransform,
                    apply3DToBackground,
                    imageMaskConfig,
                    // ── Preserve current phone/device state in the new project ──
                    // Without these, the restore useEffect resets the device to 'phone'
                    imagePhoneActive,
                    imagePhoneX,
                    imagePhoneY,
                    imagePhoneScale,
                    imagePhoneRotX,
                    imagePhoneRotY,
                    imagePhoneRotZ,
                    imagePhonePerspective,
                    imagePhoneDevice,
                    imagePhonePresetId,
                    imagePhoneOpening,
                    imagePhoneShadow,
                    imagePhoneShadowColor,
                    imagePhoneRefWidth,
                    imagePhoneAnimation
                }
            );

            if (project) {
                setImageUrl(project.imageDataUrl);
                setImageDimensions({ width: img.width, height: img.height });
            }
        } catch (error) {
            console.error("Failed to upload image to history:", error);
        }
    }, [
        createProject,
        backgroundTab,
        selectedWallpaper,
        backgroundBlur,
        selectedImageUrl,
        selectedBackgroundVideoId,
        backgroundVideoTransform,
        backgroundColorConfig,
        padding,
        roundedCorners,
        shadows,
        aspectRatio,
        customDimensions,
        cropArea,
        mockupId,
        mockupConfig,
        canvasElements,
        videoTransform,
        imageTransform,
        apply3DToBackground,
        imageMaskConfig,
        imagePhoneActive,
        imagePhoneX,
        imagePhoneY,
        imagePhoneScale,
        imagePhoneRotX,
        imagePhoneRotY,
        imagePhoneRotZ,
        imagePhonePerspective,
        imagePhoneDevice,
        imagePhonePresetId,
        imagePhoneOpening,
        imagePhoneShadow,
        imagePhoneShadowColor,
        imagePhoneRefWidth,
        imagePhoneAnimation
    ]);

    // Screen capture handler - now creates a project
    const handleScreenCapture = useCallback(async () => {
        const blob = await captureScreen();
        if (blob) {
            try {
                const file = new File([blob], `Screenshot ${new Date().toLocaleString()}.png`, { type: "image/png" });
                const img = await createImageBitmap(blob);

                const project = await createProject(
                    file,
                    file.name,
                    img.width,
                    img.height,
                    {
                        backgroundTab,
                        selectedWallpaper,
                        backgroundBlur,
                        selectedImageUrl,
                        selectedBackgroundVideoId,
                        backgroundVideoTransform,
                        backgroundColorConfig,
                        padding,
                        roundedCorners,
                        shadows,
                        aspectRatio,
                        customDimensions,
                        cropArea,
                        mockupId,
                        mockupConfig,
                        canvasElements,
                        imageTransform: {
                            rotation: videoTransform.rotation,
                            translateX: videoTransform.translateX,
                            translateY: videoTransform.translateY,
                            scale: videoTransform.scale,
                        },
                        imagePreview3D: imageTransform,
                        apply3DToBackground,
                        imageMaskConfig,
                        imagePhoneActive,
                        imagePhoneX,
                        imagePhoneY,
                        imagePhoneScale,
                        imagePhoneRotX,
                        imagePhoneRotY,
                        imagePhoneRotZ,
                        imagePhonePerspective,
                        imagePhoneDevice,
                        imagePhonePresetId,
                        imagePhoneOpening,
                        imagePhoneShadow,
                        imagePhoneShadowColor,
                        imagePhoneRefWidth,
                        imagePhoneAnimation
                    }
                );

                if (project) {
                    setImageUrl(project.imageDataUrl);
                    setImageDimensions({ width: img.width, height: img.height });
                }
            } catch (error) {
                console.error("Failed to create project from screenshot:", error);
            }
        }
    }, [
        captureScreen,
        createProject,
        backgroundTab,
        selectedWallpaper,
        backgroundBlur,
        selectedImageUrl,
        selectedBackgroundVideoId,
        backgroundVideoTransform,
        backgroundColorConfig,
        padding,
        roundedCorners,
        shadows,
        aspectRatio,
        customDimensions,
        cropArea,
        mockupId,
        mockupConfig,
        canvasElements,
        videoTransform,
        imageTransform,
        apply3DToBackground,
        imageMaskConfig,
        imagePhoneActive,
        imagePhoneX,
        imagePhoneY,
        imagePhoneScale,
        imagePhoneRotX,
        imagePhoneRotY,
        imagePhoneRotZ,
        imagePhonePerspective,
        imagePhoneDevice,
        imagePhonePresetId,
        imagePhoneOpening,
        imagePhoneShadow,
        imagePhoneShadowColor,
        imagePhoneRefWidth,
        imagePhoneAnimation
    ]);

    // Unified image upload handler - always creates a new history entry to preserve existing projects
    const handleImageUploadToCanvas = useCallback(async (file: File) => {
        try {
            const img = await createImageBitmap(file);
            const project = await createProject(
                file,
                file.name,
                img.width,
                img.height,
                {
                    backgroundTab,
                    selectedWallpaper,
                    backgroundBlur,
                    selectedImageUrl,
                    selectedBackgroundVideoId,
                    backgroundVideoTransform,
                    backgroundColorConfig,
                    padding,
                    roundedCorners,
                    shadows,
                    aspectRatio,
                    customDimensions,
                    cropArea,
                    mockupId,
                    mockupConfig,
                    canvasElements,
                    imageTransform: {
                        rotation: videoTransform.rotation,
                        translateX: videoTransform.translateX,
                        translateY: videoTransform.translateY,
                        scale: videoTransform.scale,
                    },
                    imagePreview3D: imageTransform,
                    apply3DToBackground,
                    imageMaskConfig,
                    // ── Preserve current phone/device state in the new project ──
                    // Without these, the restore useEffect resets the device to 'phone'
                    imagePhoneActive,
                    imagePhoneX,
                    imagePhoneY,
                    imagePhoneScale,
                    imagePhoneRotX,
                    imagePhoneRotY,
                    imagePhoneRotZ,
                    imagePhonePerspective,
                    imagePhoneDevice,
                    imagePhoneOpening,
                    imagePhoneShadow,
                    imagePhoneShadowColor,
                    imagePhoneRefWidth,
                    imagePhoneAnimation
                }
            );

            if (project) {
                setImageUrl(project.imageDataUrl);
                setImageDimensions({ width: img.width, height: img.height });
            }
        } catch (error) {
            console.error("Failed to upload image:", error);
        }
    }, [
        createProject,
        backgroundTab,
        selectedWallpaper,
        backgroundBlur,
        selectedImageUrl,
        selectedBackgroundVideoId,
        backgroundVideoTransform,
        backgroundColorConfig,
        padding,
        roundedCorners,
        shadows,
        aspectRatio,
        customDimensions,
        cropArea,
        mockupId,
        mockupConfig,
        canvasElements,
        videoTransform,
        imageTransform,
        apply3DToBackground,
        imageMaskConfig,
        imagePhoneActive,
        imagePhoneX,
        imagePhoneY,
        imagePhoneScale,
        imagePhoneRotX,
        imagePhoneRotY,
        imagePhoneRotZ,
        imagePhonePerspective,
        imagePhoneDevice,
        imagePhoneOpening,
        imagePhoneShadow,
        imagePhoneShadowColor,
        imagePhoneRefWidth,
        imagePhoneAnimation
    ]);

    // Handler for drag & drop images on canvas (photo mode only)
    const handleImageDrop = useCallback(async (files: FileList | File[]) => {
        if (!isPhotoMode) return;

        const fileArray = Array.from(files);
        const imageFile = fileArray.find(f => f.type.startsWith('image/'));

        if (imageFile) {
            await handleImageUploadToCanvas(imageFile);
        }
    }, [isPhotoMode, handleImageUploadToCanvas]);
    const selectCanvasElement = useCallback((id: string | null) => {
        setSelectedElementId(id);
        if (id) {
            setActiveTool("elements");
        }
    }, []);
    // Image export handler - using html-to-image with fixed dimensions
    const handleImageExport = useCallback(async (
        format: ImageExportFormat,
        quality: number,
        scale: number
    ) => {
        if (!canvasRef.current) return;

        try {
            setImageExportProgress({ status: "preparing", progress: 0, message: "Preparing export..." });

            const previewContainer = canvasRef.current.getPreviewContainer();
            if (!previewContainer || !imageUrl) {
                throw new Error("Preview container or image not available");
            }

            const imageElements = previewContainer.querySelectorAll('img');
            const originalSrcs = new Map<HTMLImageElement, string>();

            await Promise.all(Array.from(imageElements).map(async (img) => {
                const src = img.src;
                if (!src.startsWith('blob:') && !src.startsWith('data:')) return;

                try {
                    const response = await fetch(src);
                    const blob = await response.blob();
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    originalSrcs.set(img, src);
                    img.src = base64;
                    if (!img.complete) {
                        await new Promise<void>((resolve) => { img.onload = () => resolve(); });
                    }
                } catch (e) {
                    console.warn("Could not convert image src to base64:", src, e);
                }
            }));

            setImageExportProgress({ status: "rendering", progress: 50, message: "Rendering image..." });

            let exportWidth = 1920;
            let exportHeight = 1080;

            if ((aspectRatio === "auto" || aspectRatio === "custom") && customDimensions) {
                exportWidth = customDimensions.width;
                exportHeight = customDimensions.height;
            } else if (aspectRatio === "auto") {
                if (imageDimensions) {
                    exportWidth = imageDimensions.width;
                    exportHeight = imageDimensions.height;
                }
            } else {
                const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
                if (dims) { exportWidth = dims.width; exportHeight = dims.height; }
            }

            exportWidth = Math.round(exportWidth * scale);
            exportHeight = Math.round(exportHeight * scale);

            const hasTransparentBackground = backgroundTab === "wallpaper" && selectedWallpaper === -1;

            // Temporarily clear ALL selection indicators (single, multi, and mockup border)
            // so they don't appear in the html-to-image capture
            const prevSingleSelection = selectedElementId;
            selectCanvasElement(null);
            const prevSelectionState = canvasRef.current?.clearAllSelection?.();

            await new Promise(resolve => setTimeout(resolve, 80));

            let blob: Blob | null;

            if (backgroundTab === "video") {
                // html-to-image does not reliably capture the current frame of a
                // <video>. Reuse the frame renderer so static exports match the
                // preview and include all background effects.
                await canvasRef.current.drawFrame(true, currentTime);
                const sourceCanvas = canvasRef.current.getExportCanvas();
                if (!sourceCanvas) throw new Error("Rendered canvas not available");

                const outputCanvas = document.createElement("canvas");
                outputCanvas.width = exportWidth;
                outputCanvas.height = exportHeight;
                const outputContext = outputCanvas.getContext("2d");
                if (!outputContext) throw new Error("Could not create export canvas");

                outputContext.drawImage(sourceCanvas, 0, 0, exportWidth, exportHeight);
                blob = await new Promise<Blob | null>((resolve) => {
                    outputCanvas.toBlob(resolve, `image/${format}`, quality);
                });
            } else {
                blob = await toBlob(previewContainer, {
                    quality,
                    cacheBust: false,
                    ...(hasTransparentBackground ? {} : { backgroundColor: '#09090B' }),
                    type: `image/${format}`,
                    canvasWidth: exportWidth,
                    canvasHeight: exportHeight,
                    pixelRatio: 1,
                });
            }

            // Restore all selection state after capture
            if (prevSingleSelection) selectCanvasElement(prevSingleSelection);
            if (prevSelectionState) canvasRef.current?.restoreSelectionState?.(prevSelectionState);

            originalSrcs.forEach((originalSrc, img) => {
                img.src = originalSrc;
            });

            if (!blob) throw new Error("Failed to generate image blob");

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `openvidshot-${Date.now()}.${format}`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);

            setImageExportProgress({ status: "complete", progress: 100, message: "Export complete!" });
            setTimeout(() => setImageExportProgress({ status: "idle", progress: 0, message: "" }), 2000);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            setImageExportProgress({ status: "error", progress: 0, message: `Export failed: ${errorMessage}` });
            setTimeout(() => setImageExportProgress({ status: "idle", progress: 0, message: "" }), 4000);
        }
    }, [imageUrl, imageDimensions, backgroundTab, selectedWallpaper, aspectRatio, customDimensions, selectedElementId, selectCanvasElement, currentTime]);
    useEffect(() => {
        if (!isPhotoMode || !imageUrl || !canvasRef.current) {
            setCanvasImageUrl(null);
            return;
        }

        const generateSnapshot = async () => {
            try {
                await canvasRef.current?.drawFrame(false);
                const exportCanvas = canvasRef.current?.getExportCanvas();
                if (exportCanvas) {
                    const dataUrl = exportCanvas.toDataURL("image/png", 0.8);
                    setCanvasImageUrl(dataUrl);
                }
            } catch (error) {
                console.error("Error generating canvas snapshot:", error);
            }
        };

        const initialTimeout = setTimeout(generateSnapshot, 300);

        return () => {
            clearTimeout(initialTimeout);
        };
    }, [isPhotoMode, imageUrl, backgroundTab, selectedWallpaper, backgroundBlur, padding, roundedCorners, shadows, selectedImageUrl, selectedBackgroundVideoId, backgroundVideoTransform, backgroundColorConfig]);

    // Handle 3D preview selection
    const handleSelectPreview = useCallback((config: Preview3DConfig) => {
        setSelectedPreviewId(config.id);
        setImageTransform(config);
    }, []);

    // Handle 3D background toggle
    const handleToggle3DBackground = useCallback((value: boolean) => {
        setApply3DToBackground(value);
    }, [setApply3DToBackground]);

    // Reset all photo editor visual settings to defaults
    const handleResetPhotoEditor = useCallback(() => {
        const frontConfig = PREVIEW_CONFIGS[0];
        setSelectedPreviewId(frontConfig.id);
        setImageTransform(frontConfig);
        setApply3DToBackground(false);
        setImageMaskConfig(DEFAULT_MASK_CONFIG);
        setVideoTransform({ rotation: 0, translateX: 0, translateY: 0, scale: 1 });
    }, []);

    // Videos library state
    const [newVideosCount, setNewVideosCount] = useState<number>(0);
    const [videosLibraryRefresh, setVideosLibraryRefresh] = useState<number>(0);

    // Video track clips state (multi-video support)
    const [videoClips, setVideoClips] = useState<VideoTrackClip[]>([]);
    // Computed from videoClips - array of library video IDs currently in track
    const videosInTrackIds = useMemo(() =>
        videoClips.map(clip => clip.libraryVideoId),
        [videoClips]);
    // Ref para acceder al valor actual de videoClips en callbacks (evitar closure stale)
    const videoClipsRef = useRef<VideoTrackClip[]>([]);
    useEffect(() => {
        videoClipsRef.current = videoClips;
    }, [videoClips]);

    const recordVideoClipHistory = useCallback((clips: VideoTrackClip[], range?: TrimRange) => {
        const duration = calculateTotalDuration(clips);
        setEditorState(previous => ({
            ...previous,
            videoClips: clips,
            trimRange: range ?? { start: 0, end: duration },
        }));
    }, [setEditorState]);
    const [selectedVideoClipId, setSelectedVideoClipId] = useState<string | null>(null);
    const [localProjects, setLocalProjects] = useState<LocalVideoProjectPreview[]>([]);
    const [currentLocalProjectId, setCurrentLocalProjectId] = useState<string | null>(null);
    const [currentLocalProjectName, setCurrentLocalProjectName] = useState("");
    const [localProjectsOpen, setLocalProjectsOpen] = useState(false);
    const [localProjectsLoading, setLocalProjectsLoading] = useState(false);
    const [localProjectSaving, setLocalProjectSaving] = useState(false);
    const didAutoRestoreLocalProjectRef = useRef(false);

    // Multi-video playback: store video blobs and URLs indexed by libraryVideoId
    const videoBlobsRef = useRef<Map<string, Blob>>(new Map());
    const videoUrlsRef = useRef<Map<string, string>>(new Map());
    const proxyUrlsRef = useRef<Map<string, SessionVideoProxy>>(new Map());
    const proxyAbortRef = useRef<AbortController | null>(null);
    const activeClipIdRef = useRef<string | null>(null);
    const activeClipDataRef = useRef<VideoTrackClip | null>(null);
    const clipAudioStateRef = useRef<Map<string, boolean>>(new Map());
    const muteOriginalAudioRef = useRef<boolean>(false);

    const lastTimeUpdateRef = useRef(0);
    const REACT_TIME_UPDATE_INTERVAL_MS = 33;

    const getPlaybackVideoUrl = useCallback((libraryVideoId: string): string | undefined => {
        if (!isExportingRef.current) {
            const proxy = proxyUrlsRef.current.get(libraryVideoId);
            if (proxy) return proxy.url;
        }
        return videoUrlsRef.current.get(libraryVideoId);
    }, []);

    const setCurrentTimeThrottled = useCallback((time: number) => {
        const now = performance.now();
        if (now - lastTimeUpdateRef.current >= REACT_TIME_UPDATE_INTERVAL_MS) {
            lastTimeUpdateRef.current = now;
            startTransition(() => setCurrentTime(time));
        }
    }, []);

    useEffect(() => {
        const disposeTemporaryProxies = () => {
            proxyAbortRef.current?.abort();
            proxyAbortRef.current = null;
            for (const proxy of proxyUrlsRef.current.values()) disposeSessionVideoProxy(proxy);
            proxyUrlsRef.current.clear();
        };
        window.addEventListener("pagehide", disposeTemporaryProxies, { capture: true });
        return () => {
            window.removeEventListener("pagehide", disposeTemporaryProxies, { capture: true });
            disposeTemporaryProxies();
        };
    }, []);
    useEffect(() => {
        muteOriginalAudioRef.current = muteOriginalAudio;
    }, [muteOriginalAudio]);
    // Audio trim modal state
    const [autoTrimModalOpen, setAutoTrimModalOpen] = useState(false);
    const [pendingAudioUpload, setPendingAudioUpload] = useState<{
        audio: import("@/types/audio.types").UploadedAudio;
        trackId: string;
    } | null>(null);

    // Audio playback refs - store HTML Audio elements for each track
    const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

    // Initialize audio elements when tracks change
    useEffect(() => {
        const currentElements = audioElementsRef.current;
        const currentTrackIds = new Set(audioTracks.map(t => t.id));

        // Remove audio elements for deleted tracks
        for (const [trackId, audioEl] of currentElements.entries()) {
            if (!currentTrackIds.has(trackId)) {
                audioEl.pause();
                audioEl.src = '';
                currentElements.delete(trackId);
            }
        }

        // Create audio elements for new tracks
        for (const track of audioTracks) {
            if (!currentElements.has(track.id)) {
                const audio = uploadedAudios.find(a => a.id === track.audioId);
                if (audio) {
                    const audioEl = new Audio(audio.url);
                    audioEl.preload = 'auto';
                    audioEl.volume = track.volume * masterVolume;
                    currentElements.set(track.id, audioEl);
                }
            }
        }
    }, [audioTracks, uploadedAudios, masterVolume]);

    // Update audio volumes when master volume or track volumes change
    useEffect(() => {
        const currentElements = audioElementsRef.current;
        for (const track of audioTracks) {
            const audioEl = currentElements.get(track.id);
            if (audioEl) {
                audioEl.volume = track.volume * masterVolume;
            }
        }
    }, [audioTracks, masterVolume]);
    const selectedCanvasElement = useMemo(
        () => canvasElements.find(el => el.id === selectedElementId) ?? null,
        [canvasElements, selectedElementId]
    );
    const lastAudioSyncRef = useRef({ wallTime: 0, timelineTime: -1, playing: false });
    // Sync audio playback with video current time. Audio elements advance on
    // their own clock, so resynchronizing them every animation frame only adds
    // main-thread work and audible micro-seeks. Correct drift at a measured
    // cadence while still applying play/pause and large seeks immediately.
    const syncAudioPlayback = useCallback((videoTime: number, playing: boolean) => {
        if (isExportingRef.current) return;
        const now = performance.now();
        const previous = lastAudioSyncRef.current;
        const isSmallContinuousStep = Math.abs(videoTime - previous.timelineTime) < 0.25;
        if (playing === previous.playing && isSmallContinuousStep && now - previous.wallTime < 100) {
            return;
        }
        lastAudioSyncRef.current = { wallTime: now, timelineTime: videoTime, playing };
        const currentElements = audioElementsRef.current;

        for (const track of audioTracks) {
            const audioEl = currentElements.get(track.id);
            if (!audioEl) continue;

            const trackStart = track.startTime;
            const trackEnd = track.startTime + track.duration;
            const trimStart = track.trimStart ?? 0;

            if (videoTime >= trackStart && videoTime < trackEnd) {
                const audioTime = trimStart + (videoTime - trackStart);

                if (Math.abs(audioEl.currentTime - audioTime) > 0.1) {
                    audioEl.currentTime = audioTime;
                }

                if (playing && audioEl.paused) {
                    audioEl.play().catch(() => { });
                } else if (!playing && !audioEl.paused) {
                    audioEl.pause();
                }
            } else {
                if (!audioEl.paused) {
                    audioEl.pause();
                }
            }
        }
    }, [audioTracks]);

    useEffect(() => {
        const elementsRef = audioElementsRef.current;
        return () => {
            for (const audioEl of elementsRef.values()) {
                audioEl.pause();
                audioEl.src = '';
            }
            elementsRef.clear();
        };
    }, []);

    const buildCurrentEditorState = useCallback((): EditorState => ({
        backgroundTab, selectedWallpaper, backgroundBlur, padding, roundedCorners, shadows,
        selectedImageUrl, selectedBackgroundVideoId, backgroundVideoTransform, backgroundColorConfig,
        aspectRatio, customDimensions, cropArea, trimRange, videoClips, zoomFragments,
        mockupId, mockupConfig, canvasElements, audioTracks, muteOriginalAudio, masterVolume,
        cameraConfig, videoTransform, imageTransform, apply3DToBackground, imageMaskConfig, videoMaskConfig,
        imagePhoneActive, imagePhoneX, imagePhoneY, imagePhoneScale, imagePhoneRotX, imagePhoneRotY,
        imagePhoneRotZ, imagePhonePerspective, imagePhoneDevice, imagePhonePresetId, imagePhoneOpening,
        imagePhoneShadow, imagePhoneShadowColor, imagePhoneRefWidth, imagePhoneAnimation,
    }), [
        backgroundTab, selectedWallpaper, backgroundBlur, padding, roundedCorners, shadows,
        selectedImageUrl, selectedBackgroundVideoId, backgroundVideoTransform, backgroundColorConfig,
        aspectRatio, customDimensions, cropArea, trimRange, videoClips, zoomFragments,
        mockupId, mockupConfig, canvasElements, audioTracks, muteOriginalAudio, masterVolume,
        cameraConfig, videoTransform, imageTransform, apply3DToBackground, imageMaskConfig, videoMaskConfig,
        imagePhoneActive, imagePhoneX, imagePhoneY, imagePhoneScale, imagePhoneRotX, imagePhoneRotY,
        imagePhoneRotZ, imagePhonePerspective, imagePhoneDevice, imagePhonePresetId, imagePhoneOpening,
        imagePhoneShadow, imagePhoneShadowColor, imagePhoneRefWidth, imagePhoneAnimation,
    ]);

    const updateEditorStateDebounced = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (updateEditorStateDebounced.current) {
            clearTimeout(updateEditorStateDebounced.current);
        }
        updateEditorStateDebounced.current = setTimeout(() => {
            setEditorState(buildCurrentEditorState());
        }, 300);
        return () => {
            if (updateEditorStateDebounced.current) {
                clearTimeout(updateEditorStateDebounced.current);
            }
        };
    }, [buildCurrentEditorState, setEditorState]);

    const prevUndoRedoVersionRef = useRef(undoRedoVersion);
    useEffect(() => {
        if (prevUndoRedoVersionRef.current === undoRedoVersion) return;
        prevUndoRedoVersionRef.current = undoRedoVersion;

        isRestoringProjectRef.current = true;

        setBackgroundTab(editorState.backgroundTab);
        setSelectedWallpaper(editorState.selectedWallpaper);
        setBackgroundBlur(editorState.backgroundBlur);
        setPadding(editorState.padding);
        setRoundedCorners(editorState.roundedCorners);
        setShadows(editorState.shadows);
        setSelectedImageUrl(editorState.selectedImageUrl);
        setSelectedBackgroundVideoId(editorState.selectedBackgroundVideoId ?? "");
        setBackgroundVideoTransform(editorState.backgroundVideoTransform ?? { ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM });
        setBackgroundColorConfig(editorState.backgroundColorConfig);
        setAspectRatio(editorState.aspectRatio);
        setCustomDimensions(editorState.customDimensions);
        setCropArea(editorState.cropArea);
        setTrimRange(editorState.trimRange);
        const restoredClips = editorState.videoClips ?? [];
        setVideoClips(restoredClips);
        videoClipsRef.current = restoredClips;
        setVideoDuration(calculateTotalDuration(restoredClips));
        const restoredClip = getClipAtTime(restoredClips, currentTime) ?? [...restoredClips].sort((a, b) => a.startTime - b.startTime)[0];
        if (restoredClip) {
            activeClipIdRef.current = restoredClip.id;
            activeClipDataRef.current = restoredClip;
            const restoredUrl = getPlaybackVideoUrl(restoredClip.libraryVideoId);
            if (restoredUrl && videoRef.current) {
                setVideoUrl(restoredUrl);
                setVideoId(restoredClip.libraryVideoId);
                videoRef.current.src = restoredUrl;
                videoRef.current.playbackRate = getClipPlaybackRate(restoredClip);
                videoRef.current.currentTime = mapTimelineToClipTime(restoredClip, Math.max(restoredClip.startTime, currentTime));
            }
        } else {
            activeClipIdRef.current = null;
            activeClipDataRef.current = null;
            setVideoUrl(null);
            setVideoId(null);
        }
        setZoomFragments(editorState.zoomFragments);
        setMockupId(editorState.mockupId);
        setMockupConfig(editorState.mockupConfig);
        setCanvasElements(editorState.canvasElements);
        setAudioTracks(editorState.audioTracks);
        setMuteOriginalAudio(editorState.muteOriginalAudio);
        setMasterVolume(editorState.masterVolume);
        setCameraConfig(editorState.cameraConfig);
        setVideoTransform({ ...editorState.videoTransform, scale: editorState.videoTransform.scale ?? 1 });
        setImageTransform(editorState.imageTransform);
        setApply3DToBackground(editorState.apply3DToBackground);
        setImageMaskConfig(editorState.imageMaskConfig);
        setVideoMaskConfig(editorState.videoMaskConfig);
        setImagePhoneActive(editorState.imagePhoneActive);
        setImagePhoneX(editorState.imagePhoneX);
        setImagePhoneY(editorState.imagePhoneY);
        setImagePhoneScale(editorState.imagePhoneScale);
        setImagePhoneRotX(editorState.imagePhoneRotX);
        setImagePhoneRotY(editorState.imagePhoneRotY);
        setImagePhoneRotZ(editorState.imagePhoneRotZ);
        setImagePhonePerspective(editorState.imagePhonePerspective);
        setImagePhoneDevice(editorState.imagePhoneDevice);
        setImagePhonePresetId(editorState.imagePhonePresetId);
        setImagePhoneOpening(editorState.imagePhoneOpening);
        setImagePhoneShadow(editorState.imagePhoneShadow);
        setImagePhoneShadowColor(editorState.imagePhoneShadowColor);
        setImagePhoneRefWidth(editorState.imagePhoneRefWidth ?? 0);
        setImagePhoneAnimation(editorState.imagePhoneAnimation ?? { ...DEFAULT_MOCKUP_ANIMATION });

        setTimeout(() => {
            isRestoringProjectRef.current = false;
        }, 500);
    }, [undoRedoVersion]);

    const refreshLocalProjects = useCallback(async () => {
        setLocalProjectsLoading(true);
        try {
            setLocalProjects(await listLocalVideoProjects());
        } finally {
            setLocalProjectsLoading(false);
        }
    }, []);

    const loadLocalProject = useCallback(async (projectId: string) => {
        const project = await getLocalVideoProject(projectId);
        if (!project) {
            alert("This local project could not be found.");
            return;
        }

        setLocalProjectsLoading(true);
        try {
            const uniqueVideoIds = [...new Set((project.editorState.videoClips ?? []).map(clip => clip.libraryVideoId))];
            const videos = await Promise.all(uniqueVideoIds.map(getLibraryVideo));
            videos.forEach(video => {
                if (!video) return;
                videoBlobsRef.current.set(video.id, video.blob);
                if (!videoUrlsRef.current.has(video.id)) videoUrlsRef.current.set(video.id, URL.createObjectURL(video.blob));
                clipAudioStateRef.current.set(video.id, video.hasAudio !== false);
            });

            const restoredAudios = await hydrateUploadedAudios(project.audioAssetIds ?? []);
            setUploadedAudios(previous => {
                previous.forEach(audio => URL.revokeObjectURL(audio.url));
                return restoredAudios;
            });

            const initialSnapshot = createInitialEditorState();
            const snapshot = {
                ...initialSnapshot,
                ...project.editorState,
                videoClips: project.editorState.videoClips ?? [],
                videoTransform: { ...initialSnapshot.videoTransform, ...project.editorState.videoTransform, scale: project.editorState.videoTransform?.scale ?? 1 },
            };
            setCurrentTime(project.currentTime ?? 0);
            setEditorState(snapshot, true);
            clearHistory();
            setUndoRedoVersion(version => version + 1);

            const restoredClip = getClipAtTime(snapshot.videoClips, project.currentTime ?? 0) ?? snapshot.videoClips[0];
            if (restoredClip) {
                const libraryVideo = videos.find(video => video?.id === restoredClip.libraryVideoId);
                const url = getPlaybackVideoUrl(restoredClip.libraryVideoId);
                if (url) {
                    setVideoUrl(url);
                    setVideoId(restoredClip.libraryVideoId);
                    if (libraryVideo) setVideoDimensions({ width: libraryVideo.width, height: libraryVideo.height });
                }
            }

            setCurrentLocalVideoProjectId(project.id);
            setCurrentLocalProjectId(project.id);
            setCurrentLocalProjectName(project.name);
            setLocalProjectsOpen(false);
        } catch (error) {
            console.error("Failed to load local project:", error);
            alert("The project could not be loaded. One of its local media files may be missing.");
        } finally {
            setLocalProjectsLoading(false);
        }
    }, [clearHistory, setEditorState]);

    const createLocalProjectThumbnail = useCallback(async (): Promise<string | undefined> => {
        try {
            await canvasRef.current?.drawFrame(true, currentTime);
            const source = canvasRef.current?.getExportCanvas();
            if (!source || source.width === 0 || source.height === 0) return undefined;
            const width = 320;
            const height = Math.max(1, Math.round(width * source.height / source.width));
            const preview = document.createElement("canvas");
            preview.width = width;
            preview.height = height;
            preview.getContext("2d")?.drawImage(source, 0, 0, width, height);
            return preview.toDataURL("image/jpeg", 0.72);
        } catch {
            return undefined;
        }
    }, [currentTime]);

    const saveLocalProject = useCallback(async () => {
        if (!isVideoMode) return;
        let name = currentLocalProjectName;
        if (!currentLocalProjectId) {
            const suggested = videoClips[0]?.name?.replace(/\.[^.]+$/, "") || "Untitled video";
            name = window.prompt("Project name", suggested)?.trim() ?? "";
            if (!name) return;
        }

        setLocalProjectSaving(true);
        try {
            const snapshot = buildCurrentEditorState();
            const videoIds = [...new Set(snapshot.videoClips.map(clip => clip.libraryVideoId))];
            const audioAssetIds = [...new Set(audioTracks.map(track => track.audioId))];
            await Promise.all([persistLibraryVideos(videoIds), persistAudioAssets(audioAssetIds)]);

            const existing = currentLocalProjectId ? await getLocalVideoProject(currentLocalProjectId) : null;
            const now = Date.now();
            const id = currentLocalProjectId ?? crypto.randomUUID();
            const thumbnailDataUrl = await createLocalProjectThumbnail();
            await putLocalVideoProject({
                id,
                name,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                thumbnailDataUrl: thumbnailDataUrl ?? existing?.thumbnailDataUrl,
                currentTime,
                editorState: snapshot,
                audioAssetIds,
            });

            setCurrentLocalVideoProjectId(id);
            setCurrentLocalProjectId(id);
            setCurrentLocalProjectName(name);
            await refreshLocalProjects();
        } catch (error) {
            console.error("Failed to save local project:", error);
            alert("The project could not be saved. Check that this browser has enough local storage space for the source media.");
        } finally {
            setLocalProjectSaving(false);
        }
    }, [isVideoMode, currentLocalProjectName, currentLocalProjectId, videoClips, buildCurrentEditorState, audioTracks, createLocalProjectThumbnail, currentTime, refreshLocalProjects]);

    const handleDeleteLocalProject = useCallback(async (projectId: string) => {
        const project = localProjects.find(item => item.id === projectId);
        if (!window.confirm(`Delete “${project?.name ?? "this project"}”? The shared source media will stay in your local library.`)) return;
        await deleteLocalVideoProject(projectId);
        if (currentLocalProjectId === projectId) {
            setCurrentLocalProjectId(null);
            setCurrentLocalProjectName("");
        }
        await refreshLocalProjects();
    }, [localProjects, currentLocalProjectId, refreshLocalProjects]);

    const handleNewLocalProject = useCallback(() => {
        setCurrentLocalVideoProjectId(null);
        window.location.reload();
    }, []);

    useEffect(() => {
        if (!isVideoMode || !currentLocalProjectId || !currentLocalProjectName || isRestoringProjectRef.current) return;
        const timer = window.setTimeout(() => {
            const autosave = async () => {
                const existing = await getLocalVideoProject(currentLocalProjectId);
                if (!existing) return;
                const snapshot = buildCurrentEditorState();
                const videoIds = [...new Set(snapshot.videoClips.map(clip => clip.libraryVideoId))];
                const audioAssetIds = [...new Set(snapshot.audioTracks.map(track => track.audioId))];
                await Promise.all([persistLibraryVideos(videoIds), persistAudioAssets(audioAssetIds)]);
                await putLocalVideoProject({
                    ...existing,
                    name: currentLocalProjectName,
                    updatedAt: Date.now(),
                    currentTime,
                    editorState: snapshot,
                    audioAssetIds,
                });
            };
            void autosave().catch(error => console.error("Local project autosave failed:", error));
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [isVideoMode, currentLocalProjectId, currentLocalProjectName, buildCurrentEditorState, currentTime]);

    useEffect(() => {
        if (!isVideoMode || didAutoRestoreLocalProjectRef.current) return;
        didAutoRestoreLocalProjectRef.current = true;
        void refreshLocalProjects();
        const projectId = getCurrentLocalVideoProjectId();
        if (projectId) void loadLocalProject(projectId);
    }, [isVideoMode, loadLocalProject, refreshLocalProjects]);

    // Handler para cambiar el mockup
    const handleMockupChange = useCallback((newMockupId: string) => {
        setMockupId(newMockupId);
        const newMockup = MOCKUPS.find(m => m.id === newMockupId);
        setMockupConfig(getMockupDefaultConfig(newMockup));
    }, []);

    // Handler to update mockup configuration
    const handleMockupConfigChange = useCallback((updates: Partial<MockupConfig>) => {
        setMockupConfig(prev => ({ ...prev, ...updates }));
    }, []);

    // Click on a mockup that's already applied on the canvas: open the mockup
    // menu directly on the config page of that frame. Called by VideoCanvas
    // (see onMockupClick in VideoCanvasProps).
    const handleMockupClick = useCallback((kind: "2d" | "3d") => {
        setInitialMockupMenuPage(kind === "2d" ? "detail-2d" : "detail-3d");
        setMockupMenuNavigationToken((t) => t + 1);
        setActiveTool("mockup");
        setIsControlPanelOpen(true);
    }, [setActiveTool]);

    const handleRoundedCornersChange = useCallback((value: number) => {
        setRoundedCorners(value);
        setMockupConfig(prev => ({ ...prev, cornerRadius: value }));
    }, []);

    // Text tool (Figma-style T key) — activates crosshair + canvas click to place text
    const [textToolActive, setTextToolActive] = useState(false);

    // Canvas elements handlers
    const addCanvasElement = useCallback((element: CanvasElement) => {
        setCanvasElements(prev => [...prev, element]);
        setSelectedElementId(element.id);
    }, []);

    const updateCanvasElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
        setCanvasElements(prev => prev.map(el =>
            el.id === id ? { ...el, ...updates } as CanvasElement : el
        ));
    }, []);

    const deleteCanvasElement = useCallback((idOrIds: string | string[]) => {
        const idsToDelete = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        const idsSet = new Set(idsToDelete);
        setCanvasElements(prev => prev.filter(el => !idsSet.has(el.id)));
        setSelectedElementId(prev => prev && idsSet.has(prev) ? null : prev);
    }, []);

    const [copiedElement, setCopiedElement] = useState<CanvasElement | null>(null);

    const copySelectedElement = useCallback(() => {
        if (!selectedElementId) return;
        const element = canvasElements.find(el => el.id === selectedElementId);
        if (element) {
            setCopiedElement(element);
        }
    }, [selectedElementId, canvasElements]);

    const pasteElement = useCallback(() => {
        if (!copiedElement) return;

        const newElement = {
            ...copiedElement,
            id: `${copiedElement.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            x: copiedElement.x + 5,
            y: copiedElement.y + 5,
            zIndex: VIDEO_Z_INDEX + 1,
        } as CanvasElement;

        setCanvasElements(prev => [...prev, newElement]);
        setSelectedElementId(newElement.id);
        setActiveTool("elements");
    }, [copiedElement]);

    const bringToFront = useCallback((id: string) => {
        // Get elements that are above the video (zIndex >= VIDEO_Z_INDEX)
        const aboveVideoElements = canvasElements.filter(el => el.zIndex >= VIDEO_Z_INDEX);
        const maxAboveVideo = aboveVideoElements.length > 0
            ? Math.max(...aboveVideoElements.map(el => el.zIndex))
            : VIDEO_Z_INDEX - 1;
        // Ensure the element goes above video and all other above-video elements
        updateCanvasElement(id, { zIndex: Math.max(maxAboveVideo + 1, VIDEO_Z_INDEX) });
    }, [canvasElements, updateCanvasElement]);

    const sendToBack = useCallback((id: string) => {
        const element = canvasElements.find(el => el.id === id);
        if (!element) return;

        // If element is above video (zIndex >= VIDEO_Z_INDEX), send it just behind video
        if (element.zIndex >= VIDEO_Z_INDEX) {
            const behindVideoElements = canvasElements.filter(el => el.zIndex < VIDEO_Z_INDEX);
            const minBehindVideo = behindVideoElements.length > 0
                ? Math.min(...behindVideoElements.map(el => el.zIndex))
                : VIDEO_Z_INDEX - 100;
            updateCanvasElement(id, { zIndex: Math.min(minBehindVideo - 1, VIDEO_Z_INDEX - 1) });
        } else {
            const behindVideoElements = canvasElements.filter(el => el.zIndex < VIDEO_Z_INDEX && el.id !== id);
            const minBehindVideo = behindVideoElements.length > 0
                ? Math.min(...behindVideoElements.map(el => el.zIndex))
                : element.zIndex;
            updateCanvasElement(id, { zIndex: minBehindVideo - 1 });
        }
    }, [canvasElements, updateCanvasElement]);

    // Audio handlers
    const handleAudioUpload = useCallback(async (file: File) => {
        try {
            const MAX_AUDIO_TRACKS = 5;
            if (audioTracks.length >= MAX_AUDIO_TRACKS) {
                alert(`Máximo ${MAX_AUDIO_TRACKS} pistas de audio permitidas.`);
                return;
            }

            const url = URL.createObjectURL(file);

            const audio = new Audio(url);
            await new Promise<void>((resolve, reject) => {
                audio.addEventListener('loadedmetadata', () => resolve());
                audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
            });

            const newAudio: import("@/types/audio.types").UploadedAudio = {
                id: `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: file.name,
                url,
                duration: audio.duration,
                fileSize: file.size,
                mimeType: file.type,
            };

            stageAudioAsset(file, {
                id: newAudio.id,
                name: newAudio.name,
                duration: newAudio.duration,
                fileSize: newAudio.fileSize,
                mimeType: newAudio.mimeType,
            });

            setUploadedAudios(prev => [...prev, newAudio]);

            const lastTrackEnd = audioTracks.reduce((max, track) =>
                Math.max(max, track.startTime + track.duration), 0);

            const trackId = `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            if (audio.duration > videoDuration) {
                setPendingAudioUpload({ audio: newAudio, trackId });
                setAutoTrimModalOpen(true);
            } else {
                const newTrack: import("@/types/audio.types").AudioTrack = {
                    id: trackId,
                    audioId: newAudio.id,
                    name: newAudio.name,
                    startTime: lastTrackEnd,
                    duration: newAudio.duration,
                    volume: 1,
                    loop: false,
                };

                setAudioTracks(prev => [...prev, newTrack]);

                if (audioTracks.length === 0) {
                    setMuteOriginalAudio(true);
                }
            }
        } catch (error) {
            console.error('Error uploading audio:', error);
            alert('Error al subir el audio. Por favor intenta de nuevo.');
        }
    }, [audioTracks, videoDuration]);

    const handleAudioDelete = useCallback((audioId: string) => {
        setUploadedAudios(prev => {
            const audio = prev.find(a => a.id === audioId);
            if (audio) {
                URL.revokeObjectURL(audio.url);
            }
            return prev.filter(a => a.id !== audioId);
        });

        setAudioTracks(prev => prev.filter(track => track.audioId !== audioId));
    }, []);

    const handleAddAudioTrack = useCallback((audioId: string) => {
        const audio = uploadedAudios.find(a => a.id === audioId);
        if (!audio) return;

        const MAX_AUDIO_TRACKS = 5;
        if (audioTracks.length >= MAX_AUDIO_TRACKS) {
            alert(`Máximo ${MAX_AUDIO_TRACKS} pistas de audio permitidas.`);
            return;
        }

        if (audioTracks.some(track => track.audioId === audioId)) {
            return;
        }

        // Calculate startTime as end of last track to prevent overlapping
        const lastTrackEnd = audioTracks.reduce((max, track) =>
            Math.max(max, track.startTime + track.duration), 0);

        const newTrack: import("@/types/audio.types").AudioTrack = {
            id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            audioId,
            name: audio.name,
            startTime: lastTrackEnd,
            duration: audio.duration,
            volume: 1,
            loop: false,
        };

        setAudioTracks(prev => [...prev, newTrack]);
        if (audioTracks.length === 0) {
            setMuteOriginalAudio(true);
        }
    }, [uploadedAudios, audioTracks]);

    const handleUpdateAudioTrack = useCallback((trackId: string, updates: Partial<import("@/types/audio.types").AudioTrack>) => {
        setAudioTracks(prev => prev.map(track =>
            track.id === trackId ? { ...track, ...updates } : track
        ));
    }, []);

    const handleDeleteAudioTrack = useCallback((trackId: string) => {
        setAudioTracks(prev => {
            const remaining = prev.filter(track => track.id !== trackId);
            if (remaining.length === 0) {
                setMuteOriginalAudio(false);
            }
            return remaining;
        });
    }, []);

    const handleToggleMuteOriginalAudio = useCallback(() => {
        setMuteOriginalAudio(prev => !prev);
    }, []);

    const handleMasterVolumeChange = useCallback((volume: number) => {
        setMasterVolume(volume);
    }, []);

    const handleSelectAudioTrack = useCallback((trackId: string | null) => {
        setSelectedAudioTrackId(trackId);
        if (trackId) {
            setSelectedZoomFragmentId(null);
            setSelectedVideoClipId(null);
            setSelectedElementId(null);
            setActiveTool("audio");
        }
    }, []);

    const [thumbnailClipId, setThumbnailClipId] = useState<string | null>(null);

    const thumbnailsCacheRef = useRef<Map<string, VideoThumbnail[]>>(new Map());

    const currentDisplayTime = isDraggingPlayhead ? scrubTime : currentTime;
    useEffect(() => {
        if (videoClips.length <= 1) {
            setThumbnailClipId(null);
            return;
        }
        const clipAtTime = getClipAtTime(videoClips, currentDisplayTime);
        if (clipAtTime) {
            setThumbnailClipId(prev => {
                if (prev !== clipAtTime.libraryVideoId) {
                    return clipAtTime.libraryVideoId;
                }
                return prev;
            });
        }
    }, [currentDisplayTime, videoClips]);

    const thumbnailUrl = useMemo(() => {
        if (videoClips.length <= 1 || !thumbnailClipId) return videoUrl;
        return getPlaybackVideoUrl(thumbnailClipId) || videoUrl;
    }, [videoUrl, videoClips.length, thumbnailClipId]);

    const thumbnailVideoId = useMemo(() => {
        if (videoClips.length <= 1 || !thumbnailClipId) return videoId;
        return thumbnailClipId;
    }, [videoId, videoClips.length, thumbnailClipId]);

    const thumbnailDuration = useMemo(() => {
        if (videoClips.length <= 1 || !thumbnailClipId) return videoDuration;
        const clip = videoClips.find(c => c.libraryVideoId === thumbnailClipId);
        return clip?.duration || videoDuration;
    }, [videoDuration, videoClips, thumbnailClipId]);
    const thumbnailInterval = useMemo(
        () => Math.max(0.25, thumbnailDuration / 240),
        [thumbnailDuration],
    );

    const {
        getThumbnailForTime: getRawThumbnailForTime,
        thumbnails: currentThumbnails,
        isGenerating: isPreviewCaching,
        progress: previewCacheProgress,
    } = useVideoThumbnails(
        thumbnailUrl,
        thumbnailDuration,
        {
            interval: thumbnailInterval,
            quality: "medium",
            progressive: false,
            videoId: thumbnailVideoId || undefined,
            suspend: isPlaying,
        }
    );

    useEffect(() => {
        if (thumbnailVideoId && currentThumbnails.length > 0) {
            thumbnailsCacheRef.current.set(thumbnailVideoId, currentThumbnails);
        }
    }, [thumbnailVideoId, currentThumbnails]);

    const findNearestThumbnail = useCallback((thumbs: VideoThumbnail[], time: number): VideoThumbnail | null => {
        if (thumbs.length === 0) return null;
        let left = 0;
        let right = thumbs.length - 1;
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (thumbs[mid].time < time) left = mid + 1;
            else right = mid;
        }
        if (left > 0) {
            const prevDiff = Math.abs(thumbs[left - 1].time - time);
            const currDiff = Math.abs(thumbs[left].time - time);
            if (prevDiff < currDiff) return thumbs[left - 1];
        }
        return thumbs[left];
    }, []);

    // Clip-aware getThumbnailForTime: looks up any clip's thumbnails from cache
    const getThumbnailForTime = useCallback((timelineTime: number) => {
        const clips = videoClipsRef.current;
        if (clips.length <= 1) {
            return getRawThumbnailForTime(timelineTime);
        }

        const clipAtTime = getClipAtTime(clips, timelineTime);
        if (!clipAtTime) return null;

        const localTime = mapTimelineToClipTime(clipAtTime, timelineTime);

        // If this is the currently generating clip, use the hook directly (most up-to-date)
        if (clipAtTime.libraryVideoId === thumbnailVideoId) {
            return getRawThumbnailForTime(localTime);
        }

        // Otherwise, check the persistent cache
        const cached = thumbnailsCacheRef.current.get(clipAtTime.libraryVideoId);
        if (cached && cached.length > 0) {
            return findNearestThumbnail(cached, localTime);
        }

        return null;
    }, [getRawThumbnailForTime, thumbnailVideoId, findNearestThumbnail]);

    // Find which clip is active at a given timeline time - using standardized function
    const findActiveClipAtTime = useCallback((timelineTime: number): VideoTrackClip | null => {
        const clips = videoClipsRef.current;
        return getClipAtTime(clips, timelineTime);
    }, []);

    // Convert timeline time to clip-local time
    const timelineToClipTime = useCallback((timelineTime: number, clip: VideoTrackClip): number => {
        return mapTimelineToClipTime(clip, timelineTime);
    }, []);

    // Pre-load video blobs when clips change
    useEffect(() => {
        const loadClipBlobs = async () => {
            const currentBlobs = videoBlobsRef.current;
            const currentUrls = videoUrlsRef.current;
            // Keep sources referenced by undo history warm. Revoking them here made
            // Ctrl+Z restore a clip whose media URL had already been destroyed.

            for (const clip of videoClips) {
                if (!currentBlobs.has(clip.libraryVideoId)) {
                    try {
                        const libraryVideo = await getLibraryVideo(clip.libraryVideoId);
                        if (libraryVideo) {
                            currentBlobs.set(clip.libraryVideoId, libraryVideo.blob);
                            const url = URL.createObjectURL(libraryVideo.blob);
                            currentUrls.set(clip.libraryVideoId, url);
                        }
                    } catch (e) {
                        console.warn("Failed to load video blob for clip:", clip.id, e);
                    }
                }
            }
        };

        if (videoClips.length > 0) {
            loadClipBlobs();
        }
    }, [videoClips]);

    const { exportVideo, cancelExport, exportProgress } = useVideoExport(videoRef, canvasRef);
    const { uploadVideo, loadUploadedVideo, isUploading } = useVideoUpload();
    useEffect(() => {
        void loadAndRegisterCustomFonts().catch(error => console.warn("Could not restore custom fonts:", error));
    }, []);
    const batchImportRef = useRef(false);
    const [isBatchImporting, setIsBatchImporting] = useState(false);
    const isVideoImporting = isUploading || isBatchImporting;
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null);

    const switchActiveVideoSource = useCallback(async (
        url: string,
        sourceTime: number,
        resumePlayback: boolean,
    ) => {
        const video = videoRef.current;
        if (!video) return;
        const playbackRate = video.playbackRate;
        const muted = video.muted;
        video.pause();
        setVideoUrl(url);
        if (video.src !== url) {
            video.src = url;
            video.load();
            await waitForVideoReady(video);
        }
        const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : sourceTime;
        video.currentTime = Math.max(0, Math.min(sourceTime, maxTime));
        video.playbackRate = playbackRate;
        video.muted = muted;
        if (resumePlayback) await video.play().catch(() => { });
    }, []);

    const handleCreateProxies = useCallback(async () => {
        const uniqueVideoIds = [...new Set(videoClipsRef.current.map(clip => clip.libraryVideoId))];
        if (uniqueVideoIds.length === 0) return;

        proxyAbortRef.current?.abort();
        const controller = new AbortController();
        proxyAbortRef.current = controller;
        setProxyStatus("generating");
        setProxyProgress(0);

        try {
            for (let index = 0; index < uniqueVideoIds.length; index += 1) {
                const libraryVideoId = uniqueVideoIds[index];
                if (proxyUrlsRef.current.has(libraryVideoId)) {
                    setProxyProgress(((index + 1) / uniqueVideoIds.length) * 100);
                    continue;
                }
                let source = videoBlobsRef.current.get(libraryVideoId);
                if (!source) {
                    const libraryVideo = await getLibraryVideo(libraryVideoId);
                    source = libraryVideo?.blob;
                    if (source) videoBlobsRef.current.set(libraryVideoId, source);
                }
                if (!source) throw new Error(`The source media for ${libraryVideoId} is unavailable.`);

                const proxy = await createSessionVideoProxy({
                    libraryVideoId,
                    source,
                    signal: controller.signal,
                    onProgress: progress => {
                        setProxyProgress(((index + progress) / uniqueVideoIds.length) * 100);
                    },
                });
                proxyUrlsRef.current.set(libraryVideoId, proxy);
                setProxyCount(proxyUrlsRef.current.size);
            }

            const activeClip = activeClipDataRef.current ?? getClipAtTime(videoClipsRef.current, currentTime);
            const proxy = activeClip ? proxyUrlsRef.current.get(activeClip.libraryVideoId) : undefined;
            if (proxy && videoRef.current) {
                await switchActiveVideoSource(proxy.url, videoRef.current.currentTime, isPlaying);
            }
            setProxyProgress(100);
            setProxyCount(proxyUrlsRef.current.size);
            setProxyStatus("ready");
        } catch (error) {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
                setProxyStatus(proxyUrlsRef.current.size > 0 ? "ready" : "idle");
            } else {
                console.error("Proxy creation failed:", error);
                setProxyStatus("error");
            }
        } finally {
            if (proxyAbortRef.current === controller) proxyAbortRef.current = null;
        }
    }, [currentTime, isPlaying, switchActiveVideoSource]);

    const handleRemoveProxies = useCallback(async () => {
        proxyAbortRef.current?.abort();
        proxyAbortRef.current = null;
        const proxies = [...proxyUrlsRef.current.values()];
        const activeClip = activeClipDataRef.current ?? getClipAtTime(videoClipsRef.current, currentTime);
        const originalUrl = activeClip ? videoUrlsRef.current.get(activeClip.libraryVideoId) : undefined;
        const sourceTime = videoRef.current?.currentTime ?? 0;
        if (originalUrl) {
            await switchActiveVideoSource(originalUrl, sourceTime, isPlaying).catch(error => {
                console.warn("Could not restore the original preview source:", error);
            });
        }
        proxyUrlsRef.current.clear();
        proxies.forEach(disposeSessionVideoProxy);
        setProxyCount(0);
        setProxyProgress(0);
        setProxyStatus("idle");
    }, [currentTime, isPlaying, switchActiveVideoSource]);

    const handleCancelProxyCreation = useCallback(() => {
        proxyAbortRef.current?.abort();
        proxyAbortRef.current = null;
        const partialProxies = [...proxyUrlsRef.current.values()];
        proxyUrlsRef.current.clear();
        partialProxies.forEach(disposeSessionVideoProxy);
        setProxyCount(0);
        setProxyProgress(0);
        setProxyStatus("idle");
    }, []);

    const handleExport = async (quality: ExportQuality) => {
        /* console.log("=== RECIPE JSON PARA BACKEND (PRUEBAS) ===");
         const userId = user?.id ?? "USER-ID-NO-DISPONIBLE";
         const appOrigin = window.location.origin;
          console.log(JSON.stringify({
              quality,
              trim: trimRange.end > trimRange.start
                  ? { start: trimRange.start, end: trimRange.end }
                  : null,
              clips: videoClips.map(clip => ({
                  id: clip.id,
                  libraryVideoId: clip.libraryVideoId,
                  storageKey: `source-videos/${userId}/${clip.libraryVideoId}.mp4`,
                  name: clip.name,
                  startTime: clip.startTime,
                  trimStart: clip.trimStart,
                  trimEnd: clip.trimEnd,
                  duration: clip.trimEnd - clip.trimStart,
                  hasAudio: clipAudioStateRef.current.get(clip.libraryVideoId) !== false,
                  hasCamera: clip.hasCamera ?? false,
              })),
              muteOriginalAudio,
              masterVolume,
              videoHasAudioTrack,
              audioTracks: audioTracks.map(track => {
                  const audio = uploadedAudios.find(a => a.id === track.audioId);
                  return {
                      audioId: track.audioId,
                      audioStorageKey: `source-audios/${userId}/${track.audioId}`,
                      name: audio?.name ?? track.name,
                      startTime: track.startTime,
                      duration: track.duration,
                      trimStart: track.trimStart ?? 0,
                      volume: track.volume,
                      loop: track.loop,
                  };
              }),
              backgroundTab,
              selectedWallpaper,
              // URL completa del wallpaper seleccionado (vacío si no se usa wallpaper)
              wallpaperUrl: backgroundTab === "wallpaper" && selectedWallpaper >= 0
                  ? `${appOrigin}${getWallpaperUrl(selectedWallpaper)}`
                  : null,
              backgroundBlur,
              // dataUrl si el usuario subió imagen propia | URL https si es Unsplash/Pexels | "" si no hay
              selectedImageUrl,
              selectedBackgroundVideoId,
              backgroundVideoTransform,
              backgroundColorConfig,
              aspectRatio,
              customDimensions,
              // Native video dimensions — used by the backend to compute output size when aspectRatio is 'auto'
              sourceDimensions: videoDimensions ?? null,
              cropArea,
              padding,
              roundedCorners,
              shadows,
              videoTransform,
              mockupId,
              mockupConfig,
              zoomFragments,
              canvasElements: canvasElements.map(el => {
                  // Resolver imagePath de elementos built-in a URLs completas
                  if (el.type === "image") {
                      const imgEl = el as import("@/types/canvas-elements.types").ImageElement;
                      if (imgEl.imagePath?.startsWith("/")) {
                          return { ...el, imagePath: `${appOrigin}${imgEl.imagePath}` };
                      }
                  }
                  return el;
              }),
              cameraConfig,
              cameraStorageKey: null,
              videoMaskConfig,
          }, null, 2));
         console.log("==========================================");
         // ── FIN BACKEND TESTING ──*/

        const exportClip = activeClipDataRef.current ?? getClipAtTime(videoClipsRef.current, currentTime);
        const proxyToRestore = exportClip ? proxyUrlsRef.current.get(exportClip.libraryVideoId) : undefined;
        const originalExportUrl = exportClip ? videoUrlsRef.current.get(exportClip.libraryVideoId) : undefined;
        const sourceTimeBeforeExport = videoRef.current?.currentTime ?? 0;
        const resumeAfterExport = isPlaying;

        isExportingRef.current = true;
        for (const audioEl of audioElementsRef.current.values()) {
            audioEl.pause();
        }

        try {
            if (proxyToRestore && originalExportUrl) {
                await switchActiveVideoSource(originalExportUrl, sourceTimeBeforeExport, false);
            }
            await exportVideo({
                quality,
                aspectRatio,
                customDimensions,
                sourceDimensions: videoDimensions,
                videoBlob: videoBlob ?? undefined,
                transparentBackground: backgroundTab === "wallpaper" && selectedWallpaper === -1,
                trim: trimRange.end > trimRange.start ? { start: trimRange.start, end: trimRange.end } : undefined,
                muteOriginalAudio,
                videoHasAudioTrack: videoHasAudioTrack,
                audioTracks: audioTracks.map(track => {
                    const audio = uploadedAudios.find(a => a.id === track.audioId);
                    return {
                        audioUrl: audio?.url || '',
                        startTime: track.startTime,
                        duration: track.duration,
                        trimStart: track.trimStart ?? 0,
                        volume: track.volume,
                        loop: track.loop,
                    };
                }),
                masterVolume,
                videoClips: videoClips.length > 0 ? videoClips : undefined,
                videoClipBlobs: videoClips.length > 1 ? videoBlobsRef.current : undefined,
                clipAudioStates: Object.fromEntries(clipAudioStateRef.current),
            });
        } finally {
            isExportingRef.current = false;
            if (proxyToRestore) {
                await switchActiveVideoSource(proxyToRestore.url, sourceTimeBeforeExport, resumeAfterExport).catch(error => {
                    console.warn("Could not restore the proxy preview after export:", error);
                });
                if (resumeAfterExport) syncAudioPlayback(currentTime, true);
            }
        }
    };

    const handleVideoUpload = useCallback(async (selectedFiles: File[]) => {
        const files = selectedFiles.filter(file => file.type.startsWith("video/"));
        if (files.length === 0 || batchImportRef.current) return;

        const previousClips = videoClipsRef.current;
        const isFirstImport = previousClips.length === 0;
        const importedVideos: Array<{
            file: File;
            uploadedData: NonNullable<Awaited<ReturnType<typeof uploadVideo>>>;
            libraryVideo: Awaited<ReturnType<typeof addVideoToSessionLibrary>>;
        }> = [];

        batchImportRef.current = true;
        setIsBatchImporting(true);
        try {
            // Process sequentially so the timeline order always matches the
            // order selected in the native file picker or drag operation.
            for (const file of files) {
                const uploadedData = await uploadVideo(file);
                if (!uploadedData) continue;

                try {
                    const libraryVideo = await addVideoToSessionLibrary(file, {
                        duration: uploadedData.duration,
                        width: uploadedData.width,
                        height: uploadedData.height,
                        aspectRatio: uploadedData.aspectRatio,
                    });
                    importedVideos.push({ file, uploadedData, libraryVideo });
                } catch (error) {
                    URL.revokeObjectURL(uploadedData.url);
                    console.warn(`Failed to import ${file.name}:`, error);
                }
            }

            if (importedVideos.length === 0) return;

            if (isFirstImport) {
                proxyAbortRef.current?.abort();
                proxyAbortRef.current = null;
                for (const proxy of proxyUrlsRef.current.values()) disposeSessionVideoProxy(proxy);
                proxyUrlsRef.current.clear();
                setProxyCount(0);
                setProxyProgress(0);
                setProxyStatus("idle");
                for (const url of videoUrlsRef.current.values()) URL.revokeObjectURL(url);
                videoBlobsRef.current.clear();
                videoUrlsRef.current.clear();
                clipAudioStateRef.current.clear();
                await clearAllThumbnailCache().catch(error => {
                    console.warn("Failed to clear thumbnails:", error);
                });
            }

            let nextStartTime = findNextClipPosition(previousClips);
            const newClips = importedVideos.map(({ file, uploadedData, libraryVideo }) => {
                videoBlobsRef.current.set(libraryVideo.id, file);
                videoUrlsRef.current.set(libraryVideo.id, uploadedData.url);
                clipAudioStateRef.current.set(libraryVideo.id, libraryVideo.hasAudio !== false);

                const clip: VideoTrackClip = {
                    id: crypto.randomUUID(),
                    libraryVideoId: libraryVideo.id,
                    name: file.name,
                    startTime: nextStartTime,
                    duration: uploadedData.duration,
                    trimStart: 0,
                    trimEnd: uploadedData.duration,
                    thumbnailUrl: libraryVideo.thumbnailUrl,
                };
                nextStartTime += getClipTimelineDuration(clip);
                return clip;
            });

            const updatedClips = [...previousClips, ...newClips].sort((a, b) => a.startTime - b.startTime);
            const totalDuration = calculateTotalDuration(updatedClips);
            const nextRange = { start: 0, end: totalDuration };
            videoClipsRef.current = updatedClips;
            setVideoClips(updatedClips);
            setVideoDuration(totalDuration);
            setTrimRange(nextRange);
            setSelectedVideoClipId(newClips[0].id);
            recordVideoClipHistory(updatedClips, nextRange);

            if (isFirstImport) {
                const firstImport = importedVideos[0];
                const firstClip = newClips[0];
                const originalHasAudio = firstImport.libraryVideo.originalHasAudio !== false;
                activeClipIdRef.current = firstClip.id;
                activeClipDataRef.current = firstClip;
                lastLoadedVideoIdRef.current = firstImport.libraryVideo.id;
                setVideoBlob(firstImport.file);
                setVideoUrl(firstImport.uploadedData.url);
                setVideoId(firstImport.libraryVideo.id);
                setVideoHasAudioTrack(originalHasAudio);
                if (!originalHasAudio) setMuteOriginalAudio(true);
                setAspectRatio(firstImport.uploadedData.aspectRatio);
                setVideoDimensions({
                    width: firstImport.uploadedData.width,
                    height: firstImport.uploadedData.height,
                });
                setZoomFragments([]);
                setCurrentTime(0);
                setIsPlaying(false);
            } else if (!newClips.some(clip => proxyUrlsRef.current.has(clip.libraryVideoId))) {
                setProxyStatus("idle");
            }

            setNewVideosCount(0);
            setVideosLibraryRefresh(previous => previous + 1);
            setActiveTool("video");
        } finally {
            batchImportRef.current = false;
            setIsBatchImporting(false);
        }
    }, [recordVideoClipHistory, setActiveTool, uploadVideo]);

    // Handler to add video from library to the track (concatenate)
    const handleAddVideoToTrack = useCallback(async (videoId: string, blob: Blob, duration: number) => {
        // Get video info from library
        const libraryVideo = await import("@/lib/videos-library").then(m => m.getLibraryVideo(videoId));
        if (!libraryVideo) return;

        // Cache the per-clip audio state (hasAudio defaults to true if undefined)
        clipAudioStateRef.current.set(videoId, libraryVideo.hasAudio !== false);

        // Store blob in ref for multi-video playback
        if (!videoBlobsRef.current.has(videoId)) {
            videoBlobsRef.current.set(videoId, blob);
            const blobUrl = URL.createObjectURL(blob);
            videoUrlsRef.current.set(videoId, blobUrl);
        }
        if (!proxyUrlsRef.current.has(videoId)) setProxyStatus("idle");

        // Use functional update to always have the latest state
        setVideoClips(prevClips => {
            const startTime = findNextClipPosition(prevClips);

            const newClip: VideoTrackClip = {
                id: crypto.randomUUID(),
                libraryVideoId: videoId,
                name: libraryVideo.fileName,
                startTime,
                duration,
                trimStart: 0,
                trimEnd: duration,
                thumbnailUrl: libraryVideo.thumbnailUrl,
            };

            const updatedClips = [...prevClips, newClip];

            setTimeout(() => {
                const newTotalDuration = calculateTotalDuration(updatedClips);
                setVideoDuration(newTotalDuration);
                setTrimRange({ start: 0, end: newTotalDuration });

                if (prevClips.length === 0) {
                    activeClipIdRef.current = newClip.id;
                    activeClipDataRef.current = newClip;
                    const url = getPlaybackVideoUrl(videoId) || URL.createObjectURL(blob);
                    setVideoBlob(blob);
                    setVideoUrl(url);
                    setVideoId(videoId);

                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    const metadataUrl = URL.createObjectURL(blob);
                    video.onloadedmetadata = () => {
                        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
                        setAspectRatio("auto");
                        URL.revokeObjectURL(metadataUrl);
                    };
                    video.src = metadataUrl;

                    setCurrentTime(0);
                    setIsPlaying(false);
                }

                setNewVideosCount(0);
                clearHistory();
            }, 0);

            return updatedClips;
        });
    }, [clearHistory]);

    // Handlers for video clip management
    const handleSelectVideoClip = useCallback((clipId: string | null) => {
        setSelectedVideoClipId(clipId);
        // Clear other selections when selecting video clip (mutual exclusivity)
        if (clipId) {
            setSelectedZoomFragmentId(null);
            setSelectedAudioTrackId(null);
            setSelectedElementId(null);
            setActiveTool("video");
        }
    }, []);

    const handleUpdateVideoClip = useCallback((clipId: string, updates: Partial<VideoTrackClip>) => {
        const previousClips = videoClipsRef.current;
        const previousClip = previousClips.find(clip => clip.id === clipId);
        if (!previousClip) return;

        let newClips = previousClips.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip);
        if (updates.playbackRate !== undefined) {
            const oldEnd = previousClip.startTime + getClipTimelineDuration(previousClip);
            const updatedClip = newClips.find(clip => clip.id === clipId)!;
            const newEnd = updatedClip.startTime + getClipTimelineDuration(updatedClip);
            const rippleDelta = newEnd - oldEnd;
            newClips = newClips.map(clip => clip.id !== clipId && clip.startTime >= oldEnd - 0.0001
                ? { ...clip, startTime: Math.max(0, clip.startTime + rippleDelta) }
                : clip);
        }
        newClips = [...newClips].sort((a, b) => a.startTime - b.startTime);
        const newDuration = calculateTotalDuration(newClips);
        const nextRange = { start: 0, end: newDuration };
        videoClipsRef.current = newClips;
        setVideoClips(newClips);
        setVideoDuration(newDuration);
        setTrimRange(nextRange);
        recordVideoClipHistory(newClips, nextRange);
    }, [recordVideoClipHistory]);

    const handleDeleteVideoClip = useCallback((clipId: string) => {
        const previousClips = videoClipsRef.current;
        const newClips = previousClips.filter(clip => clip.id !== clipId);
        videoClipsRef.current = newClips;
        setVideoClips(newClips);
            if (newClips.length > 0) {
                const newDuration = calculateTotalDuration(newClips);
                setVideoDuration(newDuration);
                setTrimRange({ start: 0, end: newDuration });

                if (activeClipIdRef.current === clipId) {
                    const firstClip = [...newClips].sort((a, b) => a.startTime - b.startTime)[0];
                    activeClipIdRef.current = firstClip.id;
                    activeClipDataRef.current = firstClip;
                    const url = getPlaybackVideoUrl(firstClip.libraryVideoId);
                    if (url && videoRef.current) {
                        videoRef.current.src = url;
                        videoRef.current.currentTime = firstClip.trimStart;
                    }
                    if (url) {
                        setVideoUrl(url);
                        setVideoId(firstClip.libraryVideoId);
                    }
                    setCurrentTime(firstClip.startTime);
                }
            } else {
                setVideoUrl(null);
                setVideoId(null);
                setVideoDuration(0);
                setTrimRange({ start: 0, end: 0 });
                activeClipIdRef.current = null;
                activeClipDataRef.current = null;
                if (videoRef.current) {
                    videoRef.current.removeAttribute('src');
                }
            }
        recordVideoClipHistory(newClips, { start: 0, end: calculateTotalDuration(newClips) });
        if (selectedVideoClipId === clipId) {
            setSelectedVideoClipId(null);
        }
    }, [selectedVideoClipId, recordVideoClipHistory]);

    const handleSplitVideoClip = useCallback(() => {
        const clips = videoClipsRef.current;
        const clipAtPlayhead = getClipAtTime(clips, currentTime);
        if (!clipAtPlayhead) return;

        const result = splitClipAtTime(clipAtPlayhead, currentTime);
        if (!result) return;

        const { updatedClip, newClip } = result;

        const next = clips.map(c => (c.id === updatedClip.id ? updatedClip : c));
        next.push(newClip);
        next.sort((a, b) => a.startTime - b.startTime);
        videoClipsRef.current = next;
        setVideoClips(next);
        recordVideoClipHistory(next, { start: 0, end: calculateTotalDuration(next) });

        if (activeClipIdRef.current === updatedClip.id) {
            activeClipIdRef.current = newClip.id;
            activeClipDataRef.current = newClip;
        }

        setSelectedVideoClipId(newClip.id);
        setSelectedZoomFragmentId(null);
        setSelectedAudioTrackId(null);
        setSelectedElementId(null);
        setActiveTool("video");
    }, [currentTime, recordVideoClipHistory]);

    const activeClipForSplit = getClipAtTime(videoClipsRef.current, currentTime);
    const canSplitClip = !!activeClipForSplit && splitClipAtTime(activeClipForSplit, currentTime) !== null;

    // Handler to remove video from track when deleted from library (cascade delete)
    const handleDeleteVideoFromLibrary = useCallback((libraryVideoId: string) => {
        setVideoClips(prev => {
            const newClips = prev.filter(clip => clip.libraryVideoId !== libraryVideoId);
            if (newClips.length > 0) {
                const newDuration = calculateTotalDuration(newClips);
                setVideoDuration(newDuration);
                setTrimRange({ start: 0, end: newDuration });

                const activeClip = prev.find(c => c.id === activeClipIdRef.current);
                if (activeClip && activeClip.libraryVideoId === libraryVideoId) {
                    const firstClip = [...newClips].sort((a, b) => a.startTime - b.startTime)[0];
                    activeClipIdRef.current = firstClip.id;
                    activeClipDataRef.current = firstClip;
                    const url = getPlaybackVideoUrl(firstClip.libraryVideoId);
                    if (url && videoRef.current) {
                        videoRef.current.src = url;
                        videoRef.current.currentTime = firstClip.trimStart;
                    }
                    if (url) {
                        setVideoUrl(url);
                        setVideoId(firstClip.libraryVideoId);
                    }
                    setCurrentTime(firstClip.startTime);
                }
            } else {
                setVideoUrl(null);
                setVideoId(null);
                setVideoDuration(0);
                setTrimRange({ start: 0, end: 0 });
                activeClipIdRef.current = null;
                activeClipDataRef.current = null;
                if (videoRef.current) {
                    videoRef.current.removeAttribute('src');
                    videoRef.current.load();
                }
                lastLoadedVideoIdRef.current = null;
                deleteRecordedVideo().catch(() => { });
                deleteUploadedVideo().catch(() => { });
            }
            return newClips;
        });
        // Clean up blob/URL refs
        if (videoBlobsRef.current.has(libraryVideoId)) {
            videoBlobsRef.current.delete(libraryVideoId);
        }
        if (videoUrlsRef.current.has(libraryVideoId)) {
            const url = videoUrlsRef.current.get(libraryVideoId);
            if (url) URL.revokeObjectURL(url);
            videoUrlsRef.current.delete(libraryVideoId);
        }
        const proxy = proxyUrlsRef.current.get(libraryVideoId);
        if (proxy) {
            disposeSessionVideoProxy(proxy);
            proxyUrlsRef.current.delete(libraryVideoId);
            const remaining = proxyUrlsRef.current.size;
            setProxyCount(remaining);
            setProxyStatus(remaining > 0 ? "ready" : "idle");
        }
    }, []);

    // Handler for per-clip audio toggle from VideosMenu
    const handleVideoAudioToggle = useCallback((videoId: string, hasAudio: boolean) => {
        clipAudioStateRef.current.set(videoId, hasAudio);

        const activeClip = activeClipDataRef.current;
        if (activeClip && activeClip.libraryVideoId === videoId && videoRef.current) {
            videoRef.current.muted = muteOriginalAudioRef.current || !hasAudio;
        }
    }, []);

    // Handler to remove video from track (toggle) - removes clip only, not from library
    const handleRemoveVideoFromTrack = useCallback((libraryVideoId: string) => {
        setVideoClips(prev => {
            const newClips = prev.filter(clip => clip.libraryVideoId !== libraryVideoId);
            if (newClips.length > 0) {
                const newDuration = calculateTotalDuration(newClips);
                setVideoDuration(newDuration);
                setTrimRange({ start: 0, end: newDuration });
                const currentActiveId = activeClipIdRef.current;
                if (currentActiveId && !newClips.find(c => c.id === currentActiveId)) {
                    activeClipIdRef.current = newClips[0].id;
                }
            } else {
                setVideoUrl(null);
                setVideoId(null);
                setVideoDuration(0);
                setTrimRange({ start: 0, end: 0 });
                activeClipIdRef.current = null;
                activeClipDataRef.current = null;
            }
            return newClips;
        });
    }, []);

    useEffect(() => {
        if (activeTool === "video") {
            setNewVideosCount(0);
        }
    }, [activeTool]);

    const lastLoadedVideoIdRef = useRef<string | null>(null);

    // Load image from cache when in photo mode and create project if not exists
    useEffect(() => {
        if (!isPhotoMode) return;
        if (currentProject) return;
        if (isLoadingFromCacheRef.current) return;
        isLoadingFromCacheRef.current = true;

        const loadImage = async () => {
            try {
                const cachedImage = await getUploadedImage();
                if (cachedImage) {
                    await deleteUploadedImage();

                    const blob = cachedImage.blob;
                    const img = await createImageBitmap(blob);

                    const project = await createProject(
                        blob,
                        cachedImage.fileName || "Uploaded Image",
                        img.width,
                        img.height
                    );

                    if (project) {
                        setImageUrl(project.imageDataUrl);
                        setImageDimensions({ width: img.width, height: img.height });
                    }
                }
            } catch (error) {
                console.error("Error loading image from cache:", error);
            } finally {
                isLoadingFromCacheRef.current = false;
            }
        };

        loadImage();
    }, [isPhotoMode, currentProject, createProject]);

    useEffect(() => {
        const loadVideo = async () => {
            try {
                const [uploadedData, recordedData, cachedUpload] = await Promise.all([
                    loadUploadedVideo(),
                    loadVideoFromIndexedDB(),
                    getUploadedVideo(),
                ]);

                let videoToLoad: typeof uploadedData | typeof recordedData = null;
                let videoBlob: Blob | null = null;

                if (uploadedData && recordedData) {
                    videoToLoad = uploadedData.timestamp > recordedData.timestamp ? uploadedData : recordedData;
                    if (uploadedData.timestamp > recordedData.timestamp && cachedUpload) {
                        videoBlob = cachedUpload.blob;
                    } else if ('blob' in recordedData && recordedData.blob) {
                        videoBlob = recordedData.blob;
                    }
                } else if (uploadedData) {
                    videoToLoad = uploadedData;
                    if (cachedUpload) {
                        videoBlob = cachedUpload.blob;
                    }
                } else if (recordedData) {
                    videoToLoad = recordedData;
                    if ('blob' in recordedData && recordedData.blob) {
                        videoBlob = recordedData.blob;
                    }
                }

                if (videoToLoad) {
                    if (lastLoadedVideoIdRef.current !== videoToLoad.videoId && videoClipsRef.current.length === 0) {
                        lastLoadedVideoIdRef.current = videoToLoad.videoId;

                        setVideoUrl(videoToLoad.url);
                        setVideoId(videoToLoad.videoId);
                        if (videoRef.current) {
                            videoRef.current.src = videoToLoad.url;
                        }
                        setVideoDuration(videoToLoad.duration);
                        setTrimRange({ start: 0, end: videoToLoad.duration });
                        if ('aspectRatio' in videoToLoad) {
                            setAspectRatio(videoToLoad.aspectRatio || "auto");
                            if (videoToLoad.width && videoToLoad.height) {
                                setVideoDimensions({ width: videoToLoad.width, height: videoToLoad.height });
                            }
                        }

                        if (videoBlob && videoBlob.size > 0) {
                            setVideoBlob(videoBlob);

                            const fileName = 'fileName' in videoToLoad
                                ? (videoToLoad.fileName as string)
                                : `Recording-${videoToLoad.videoId}.webm`;
                            const width = 'width' in videoToLoad ? (videoToLoad.width as number) : 1920;
                            const height = 'height' in videoToLoad ? (videoToLoad.height as number) : 1080;

                            try {
                                let libraryVideo = await findExistingVideo(fileName, videoBlob.size);

                                if (!libraryVideo && videoBlob instanceof File) {
                                    libraryVideo = await addVideoToSessionLibrary(videoBlob, {
                                        duration: videoToLoad.duration,
                                        width,
                                        height,
                                        aspectRatio: 'aspectRatio' in videoToLoad
                                            ? (videoToLoad.aspectRatio as string)
                                            : "auto",
                                    });
                                } else if (!libraryVideo) {
                                    libraryVideo = await addVideoToLibraryWithMetadata({
                                        blob: videoBlob,
                                        fileName,
                                        duration: videoToLoad.duration,
                                        width,
                                        height,
                                    });
                                }

                                videoBlobsRef.current.set(libraryVideo.id, videoBlob);
                                videoUrlsRef.current.set(libraryVideo.id, videoToLoad.url);
                                const originalHasAudio = libraryVideo.originalHasAudio !== false;
                                clipAudioStateRef.current.set(libraryVideo.id, libraryVideo.hasAudio !== false);
                                setVideoHasAudioTrack(originalHasAudio);
                                if (!originalHasAudio) setMuteOriginalAudio(true);

                                const newClip: VideoTrackClip = {
                                    id: crypto.randomUUID(),
                                    libraryVideoId: libraryVideo.id,
                                    name: libraryVideo.fileName,
                                    startTime: 0,
                                    duration: libraryVideo.duration,
                                    trimStart: 0,
                                    trimEnd: libraryVideo.duration,
                                    thumbnailUrl: libraryVideo.thumbnailUrl,
                                    hasCamera: 'cameraUrl' in videoToLoad && !!videoToLoad.cameraUrl,
                                };

                                activeClipIdRef.current = newClip.id;
                                activeClipDataRef.current = newClip;

                                setVideoClips([newClip]);
                                setVideosLibraryRefresh(prev => prev + 1);
                            } catch (e) {
                                console.warn("Failed to add video to library:", e);
                            }
                        }

                        if ('isRecordedVideo' in videoToLoad && videoToLoad.isRecordedVideo) {
                            setIsRecordedVideo(true);
                        } else {
                            setIsRecordedVideo(false);
                        }

                        if ('cameraUrl' in videoToLoad && videoToLoad.cameraUrl) {
                            setCameraUrl(videoToLoad.cameraUrl);
                        } else {
                            setCameraUrl(null);
                        }
                        if ('cameraConfig' in videoToLoad && videoToLoad.cameraConfig) {
                            setCameraConfig(videoToLoad.cameraConfig);
                        } else {
                            setCameraConfig(null);
                        }

                        setTimeout(() => {
                            clearHistory();
                        }, 200);
                    }
                }

            } catch (error) {
                console.error("Error loading video:", error);
            }
        };

        loadVideo();

        // Re-check when page becomes visible (user navigates back or uploads new video)
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                loadVideo();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [loadUploadedVideo, clearHistory]);

    useEffect(() => {
        bgImagesGetAll()
            .then(entries => {
                setUploadedImages(entries.map(e => e.dataUrl));
                entries.forEach(e => bgImgUrlToIdRef.current.set(e.dataUrl, e.id));
            })
            .catch(err => console.error("Error loading bg images:", err));
    }, []);

    useEffect(() => {
        let cancelled = false;
        const objectUrls = backgroundVideoUrlsRef.current;

        bgVideosGetAll()
            .then(entries => {
                if (cancelled) return;
                const videos = entries.map(entry => {
                    const url = URL.createObjectURL(entry.blob);
                    objectUrls.set(entry.id, url);
                    return {
                        id: entry.id,
                        url,
                        name: entry.name,
                        duration: entry.duration,
                        type: entry.type,
                    };
                });
                setUploadedBackgroundVideos(videos);
            })
            .catch(err => console.error("Error loading background videos:", err));

        return () => {
            cancelled = true;
            objectUrls.forEach(url => URL.revokeObjectURL(url));
            objectUrls.clear();
        };
    }, []);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = muteOriginalAudio;
        }
    }, [muteOriginalAudio]);

    // Keyboard shortcuts for undo/redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const key = e.key.toLowerCase();
            const isInputFocused = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            if (isInputFocused) return;

            if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (canUndo) {
                    handleUndo();
                }
            }

            if (((e.ctrlKey || e.metaKey) && key === 'y') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'z')) {
                e.preventDefault();
                if (canRedo) {
                    handleRedo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo, canUndo, canRedo]);

    // Keyboard listener for Ctrl+V image paste (photo mode only)
    useEffect(() => {
        if (!isPhotoMode) return;

        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        handleImageUploadToCanvas(file);
                    }
                    break;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isPhotoMode, handleImageUploadToCanvas]);

    const togglePlayPause = useCallback(() => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
                const clips = videoClipsRef.current;
                if (clips.length > 0 && activeClipDataRef.current) {
                    const activeClip = activeClipDataRef.current;
                    const offsetInClip = (videoRef.current.currentTime - activeClip.trimStart) / getClipPlaybackRate(activeClip);
                    const timelineTime = activeClip.startTime + offsetInClip;
                    setCurrentTime(timelineTime);
                    syncAudioPlayback(timelineTime, false);
                } else {
                    syncAudioPlayback(currentTime, false);
                }
            } else {
                const clips = videoClipsRef.current;
                let startTime = currentTime;

                if (trimRange.end > 0) {
                    if (startTime < trimRange.start || startTime >= trimRange.end) {
                        startTime = trimRange.start;
                        setCurrentTime(startTime);
                    }
                }

                if (clips.length > 0) {
                    const clipAtTime = findActiveClipAtTime(startTime);
                    if (clipAtTime) {
                        if (clipAtTime.id !== activeClipIdRef.current) {
                            const url = getPlaybackVideoUrl(clipAtTime.libraryVideoId);
                            if (url && videoRef.current) {
                                activeClipIdRef.current = clipAtTime.id;
                                activeClipDataRef.current = clipAtTime;
                                videoRef.current.src = url;

                                const clipTime = timelineToClipTime(startTime, clipAtTime);
                                const onCanPlay = () => {
                                    if (videoRef.current) {
                                        videoRef.current.playbackRate = getClipPlaybackRate(clipAtTime);
                                        videoRef.current.currentTime = clipTime;
                                        const clipHasAudio = clipAudioStateRef.current.get(clipAtTime.libraryVideoId);
                                        videoRef.current.muted = muteOriginalAudioRef.current || clipHasAudio === false;
                                        videoRef.current.play().catch(() => { });
                                        syncAudioPlayback(startTime, true);
                                    }
                                    videoRef.current?.removeEventListener('canplay', onCanPlay);
                                };
                                videoRef.current.addEventListener('canplay', onCanPlay);
                                setIsPlaying(true);
                                return;
                            }
                        } else {
                            activeClipIdRef.current = clipAtTime.id;
                            activeClipDataRef.current = clipAtTime;
                            const clipTime = timelineToClipTime(startTime, clipAtTime);
                            videoRef.current.playbackRate = getClipPlaybackRate(clipAtTime);
                            videoRef.current.currentTime = clipTime;
                        }
                    } else if (clips.length === 1) {
                        const clip = clips[0];
                        activeClipIdRef.current = clip.id;
                        activeClipDataRef.current = clip;
                        videoRef.current.currentTime = clip.trimStart;
                        setCurrentTime(clip.startTime);
                    }
                } else {
                    videoRef.current.currentTime = startTime;
                }

                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            console.warn('Play interrupted:', error);
                        }
                    });
                }
                syncAudioPlayback(startTime, true);
            }
            setIsPlaying(!isPlaying);
        }
    }, [isPlaying, currentTime, trimRange.start, trimRange.end, syncAudioPlayback, findActiveClipAtTime, timelineToClipTime]);

    const updateTimeSmoothRef = useRef<() => void>(() => { });

    cancelPlaybackFrameRef.current = () => {
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        const pendingVideoFrame = videoFrameCallbackRef.current;
        if (pendingVideoFrame) {
            pendingVideoFrame.video.cancelVideoFrameCallback(pendingVideoFrame.id);
            videoFrameCallbackRef.current = null;
        }
    };

    schedulePlaybackFrameRef.current = () => {
        if (animationFrameRef.current !== null || videoFrameCallbackRef.current !== null) return;
        const video = videoRef.current;
        if (video && !video.paused && "requestVideoFrameCallback" in video) {
            const id = video.requestVideoFrameCallback(() => {
                videoFrameCallbackRef.current = null;
                updateTimeSmoothRef.current();
            });
            videoFrameCallbackRef.current = { video, id };
            return;
        }
        animationFrameRef.current = requestAnimationFrame(() => {
            animationFrameRef.current = null;
            updateTimeSmoothRef.current();
        });
    };

    useEffect(() => {
        updateTimeSmoothRef.current = () => {
            if (justEndedRef.current) return;
            if (isSwitchingClipRef.current) {
                if (isPlaying && !isDraggingPlayhead) {
                    schedulePlaybackFrameRef.current();
                }
                return;
            }

            if (videoRef.current && !isDraggingPlayhead) {
                const clips = videoClipsRef.current;

                if (clips.length > 0) {
                    const currentVideoTime = videoRef.current.currentTime;

                    let activeClip: VideoTrackClip | null = null;

                    if (activeClipDataRef.current && activeClipDataRef.current.id === activeClipIdRef.current) {
                        activeClip = activeClipDataRef.current;
                    } else {
                        const foundByIdActiveClip = clips.find(c => c.id === activeClipIdRef.current);

                        if (foundByIdActiveClip) {
                            activeClip = foundByIdActiveClip;
                        } else if (clips.length === 1) {
                            activeClip = clips[0];
                        } else {
                            activeClip = clips[0];
                        }
                    }

                    if (!activeClip) {
                        if (isPlaying && !isDraggingPlayhead) {
                            schedulePlaybackFrameRef.current();
                        }
                        return;
                    }

                    if (!isSwitchingClipRef.current && activeClipIdRef.current !== activeClip.id) {
                        activeClipIdRef.current = activeClip.id;
                        activeClipDataRef.current = activeClip;
                    }

                    if (clipSwitchTimeRef.current !== null) {
                        setCurrentTime(clipSwitchTimeRef.current);
                        if (isPlaying && !isDraggingPlayhead) {
                            schedulePlaybackFrameRef.current();
                        }
                        return;
                    }

                    if (activeClip) {
                        const offsetInClip = (currentVideoTime - activeClip.trimStart) / getClipPlaybackRate(activeClip);
                        const timelineTime = activeClip.startTime + offsetInClip;
                        const clipDuration = getClipTimelineDuration(activeClip);
                        const clipEndOnTimeline = activeClip.startTime + clipDuration;

                        const reachedEndByTime = currentVideoTime >= activeClip.trimEnd;
                        const reachedEndByTimeline = timelineTime >= clipEndOnTimeline;

                        if (reachedEndByTime || reachedEndByTimeline) {
                            const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);
                            const currentIndex = sortedClips.findIndex(c => c.id === activeClip!.id);
                            const nextClip = sortedClips[currentIndex + 1];

                            if (nextClip) {
                                const nextUrl = getPlaybackVideoUrl(nextClip.libraryVideoId);
                                const nextBlob = videoBlobsRef.current.get(nextClip.libraryVideoId);

                                if (nextUrl && videoRef.current) {
                                    const nextClipSnapshot = { ...nextClip };

                                    activeClipIdRef.current = nextClipSnapshot.id;
                                    activeClipDataRef.current = nextClipSnapshot;
                                    clipSwitchTimeRef.current = nextClipSnapshot.startTime;
                                    isSwitchingClipRef.current = true;

                                    const currentVideo = videoRef.current;
                                    currentVideo.pause();
                                    currentVideo.src = nextUrl;

                                    const startPlayback = () => {
                                        clipSwitchTimeRef.current = null;
                                        isSwitchingClipRef.current = false;
                                        justEndedRef.current = false;
                                        currentVideo.playbackRate = getClipPlaybackRate(nextClipSnapshot);
                                        const nextClipHasAudio = clipAudioStateRef.current.get(nextClipSnapshot.libraryVideoId);
                                        currentVideo.muted = muteOriginalAudioRef.current || nextClipHasAudio === false;
                                        currentVideo.play().catch(e => {
                                            if (e.name !== 'AbortError') console.warn('Play interrupted:', e);
                                        });
                                        setIsPlaying(true);
                                        schedulePlaybackFrameRef.current();
                                    };

                                    const onCanPlay = () => {
                                        if (currentVideo) {
                                            const targetTime = nextClipSnapshot.trimStart;
                                            if (targetTime < 0.01) {
                                                currentVideo.currentTime = 0;
                                                startPlayback();
                                            } else {
                                                const onSeeked = () => {
                                                    startPlayback();
                                                    currentVideo.removeEventListener('seeked', onSeeked);
                                                };
                                                currentVideo.addEventListener('seeked', onSeeked);
                                                currentVideo.currentTime = targetTime;
                                            }
                                        }
                                        currentVideo?.removeEventListener('canplay', onCanPlay);
                                    };
                                    currentVideo.addEventListener('canplay', onCanPlay);

                                    setCurrentTime(nextClipSnapshot.startTime);
                                    schedulePlaybackFrameRef.current();
                                    return;
                                }
                            } else {
                                videoRef.current.pause();
                                syncAudioPlayback(clipEndOnTimeline, false);
                                setIsPlaying(false);
                                justEndedRef.current = true;
                                setCurrentTime(clipEndOnTimeline);
                                setTimeout(() => { justEndedRef.current = false; }, 300);
                                return;
                            }
                        }

                        if (trimRange.end > 0 && timelineTime >= trimRange.end) {
                            videoRef.current.pause();
                            syncAudioPlayback(timelineTime, false);
                            setIsPlaying(false);
                            justEndedRef.current = true;
                            setCurrentTime(trimRange.end);
                            setTimeout(() => { justEndedRef.current = false; }, 300);
                            return;
                        }

                        setCurrentTimeThrottled(timelineTime);
                        syncAudioPlayback(timelineTime, true);
                    }
                } else {
                    const currentVideoTime = videoRef.current.currentTime;

                    if (trimRange.end > 0 && currentVideoTime >= trimRange.end) {
                        videoRef.current.pause();
                        syncAudioPlayback(currentVideoTime, false);
                        setIsPlaying(false);
                        justEndedRef.current = true;
                        setCurrentTime(trimRange.end);
                        setTimeout(() => { justEndedRef.current = false; }, 300);
                        return;
                    }

                    setCurrentTimeThrottled(currentVideoTime);
                    syncAudioPlayback(currentVideoTime, true);
                }
            }
            if (isPlaying && !isDraggingPlayhead) {
                schedulePlaybackFrameRef.current();
            }
        };
    }, [isPlaying, isDraggingPlayhead, trimRange.end, syncAudioPlayback]);

    // Start/stop animation frame loop based on playing state
    useEffect(() => {
        if (isPlaying && !isDraggingPlayhead) {
            schedulePlaybackFrameRef.current();
        } else {
            cancelPlaybackFrameRef.current();
        }

        return () => {
            cancelPlaybackFrameRef.current();
        };
    }, [isPlaying, isDraggingPlayhead]);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current && !isPlaying && !justEndedRef.current && !isSeekingToClipRef.current) {
            const clips = videoClipsRef.current;
            if (clips.length > 0 && activeClipDataRef.current) {
                const activeClip = activeClipDataRef.current;
                const offsetInClip = videoRef.current.currentTime - activeClip.trimStart;
                const timelineTime = activeClip.startTime + offsetInClip;
                setCurrentTime(timelineTime);
            } else {
                setCurrentTime(videoRef.current.currentTime);
            }
        }
    }, [isPlaying]);

    const handlePlayheadDragStart = useCallback(() => {
        setIsDraggingPlayhead(true);
        // Pause video during scrubbing for smoother experience
        if (videoRef.current && !videoRef.current.paused) {
            wasPlayingBeforeDragRef.current = true;
            videoRef.current.pause();
        } else {
            wasPlayingBeforeDragRef.current = false;
        }
    }, []);

    const handlePlayheadDragEnd = useCallback(() => {
        setIsDraggingPlayhead(false);

        // Always read from ref — scrubTime state may still be stale at this point
        const finalTime = scrubTimeRef.current;

        // Set playhead position immediately (prevents visual jump)
        setCurrentTime(finalTime);

        if (videoRef.current) {
            const clips = videoClipsRef.current;

            if (clips.length > 0) {
                const clipAtTime = findActiveClipAtTime(finalTime);

                if (clipAtTime) {
                    const clipTime = timelineToClipTime(finalTime, clipAtTime);

                    if (clipAtTime.id !== activeClipIdRef.current) {
                        const url = getPlaybackVideoUrl(clipAtTime.libraryVideoId);
                        const isSameSource = !!url && videoRef.current.src === url;
                        activeClipIdRef.current = clipAtTime.id;
                        activeClipDataRef.current = clipAtTime;

                        if (url && !isSameSource) {
                            activeClipIdRef.current = clipAtTime.id;
                            activeClipDataRef.current = clipAtTime;
                            isSeekingToClipRef.current = true;
                            const currentVideo = videoRef.current;
                            currentVideo.src = url;

                            const shouldPlay = wasPlayingBeforeDragRef.current;
                            const onCanPlay = () => {
                                if (currentVideo) {
                                    currentVideo.playbackRate = getClipPlaybackRate(clipAtTime);
                                    currentVideo.currentTime = clipTime;
                                    const clipHasAudio = clipAudioStateRef.current.get(clipAtTime.libraryVideoId);
                                    currentVideo.muted = muteOriginalAudioRef.current || clipHasAudio === false;
                                    isSeekingToClipRef.current = false;
                                    if (shouldPlay) {
                                        currentVideo.play().catch(e => {
                                            if (e.name !== 'AbortError') console.warn('Play interrupted:', e);
                                        });
                                        setIsPlaying(true);
                                        syncAudioPlayback(finalTime, true);
                                    } else {
                                        syncAudioPlayback(finalTime, false);
                                    }
                                }
                                currentVideo?.removeEventListener('canplay', onCanPlay);
                            };
                            currentVideo.addEventListener('canplay', onCanPlay);
                            return;
                        }
                    } else {
                        videoRef.current.playbackRate = getClipPlaybackRate(clipAtTime);
                        videoRef.current.currentTime = clipTime;
                    }
                }
            } else {
                videoRef.current.currentTime = finalTime;
            }
        }

        if (wasPlayingBeforeDragRef.current && videoRef.current) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.warn('Play interrupted:', error);
                    }
                });
            }
            setIsPlaying(true);
            syncAudioPlayback(finalTime, true);
        } else {
            syncAudioPlayback(finalTime, false);
        }
    }, [syncAudioPlayback, findActiveClipAtTime, timelineToClipTime]);

    const handleZoomChange = useCallback((zoom: number) => {
        setTimelineZoom(zoom);
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = getClipPlaybackRate(activeClipDataRef.current ?? { playbackRate: 1 });

            if (isExportingRef.current) return;

            const duration = videoRef.current.duration;
            const currentClips = videoClipsRef.current;
            const isMultiClip = currentClips.length > 1;

            if (currentClips.length > 0) {
                const timelineDuration = calculateTotalDuration(currentClips);
                setVideoDuration(timelineDuration);
                setTrimRange(prev => prev.end === 0 ? { start: 0, end: timelineDuration } : prev);
            } else if (isFinite(duration) && duration > 0 && !isMultiClip) {
                setVideoDuration(duration);
                setTrimRange(prev => prev.end === 0 ? { start: 0, end: duration } : prev);
            }

            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;
            if (vw > 0 && vh > 0 && !isMultiClip) {
                setVideoDimensions({ width: vw, height: vh });
            }
        }
    }, []);

    const skipBackward = useCallback(() => {
        if (videoRef.current) {
            const newTime = Math.max(trimRange.start, videoRef.current.currentTime - 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            syncAudioPlayback(newTime, isPlaying);
        }
    }, [trimRange.start, isPlaying, syncAudioPlayback]);

    const skipForward = useCallback(() => {
        if (videoRef.current) {
            const newTime = Math.min(trimRange.end, videoRef.current.currentTime + 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            syncAudioPlayback(newTime, isPlaying);

            if (newTime >= trimRange.end) {
                videoRef.current.pause();
                setIsPlaying(false);
                syncAudioPlayback(newTime, false);
            }
        }
    }, [trimRange.end, isPlaying, syncAudioPlayback]);

    const handleSeek = useCallback((time: number) => {
        scrubTimeRef.current = time;
        setScrubTime(time);
        setCurrentTime(time);

        const now = performance.now();
        const shouldUpdateMedia = !isDraggingPlayhead || now - lastScrubMediaSeekRef.current >= 66;
        if (videoRef.current && shouldUpdateMedia) {
            if (isDraggingPlayhead) lastScrubMediaSeekRef.current = now;
            const clips = videoClipsRef.current;

            if (clips.length > 0) {
                const clipAtTime = findActiveClipAtTime(time);

                if (clipAtTime) {
                    const clipTime = timelineToClipTime(time, clipAtTime);
                    const currentUrl = videoRef.current.src;
                    const targetUrl = getPlaybackVideoUrl(clipAtTime.libraryVideoId);
                    const isDifferentSource = !!targetUrl && currentUrl !== targetUrl;

                    if (clipAtTime.id !== activeClipIdRef.current) {
                        activeClipIdRef.current = clipAtTime.id;
                        activeClipDataRef.current = clipAtTime;
                    }

                    if (isDifferentSource && targetUrl) {
                        const wasPlaying = isPlaying && !isDraggingPlayhead;

                        if (videoRef.current && !videoRef.current.paused) {
                            videoRef.current.pause();
                        }
                        cancelPlaybackFrameRef.current();

                        activeClipIdRef.current = clipAtTime.id;
                        activeClipDataRef.current = clipAtTime;
                        isSeekingToClipRef.current = true;
                        isSwitchingClipRef.current = true;

                        const currentVideo = videoRef.current;
                        currentVideo.src = targetUrl;

                        const onCanPlay = () => {
                            if (currentVideo) {
                                currentVideo.playbackRate = getClipPlaybackRate(clipAtTime);
                                currentVideo.currentTime = clipTime;
                                const clipHasAudio = clipAudioStateRef.current.get(clipAtTime.libraryVideoId);
                                currentVideo.muted = muteOriginalAudioRef.current || clipHasAudio === false;
                                isSeekingToClipRef.current = false;
                                isSwitchingClipRef.current = false;
                                clipSwitchTimeRef.current = null;

                                if (wasPlaying) {
                                    currentVideo.play().catch(e => {
                                        if (e.name !== 'AbortError') console.warn('Play interrupted:', e);
                                    });
                                    schedulePlaybackFrameRef.current();
                                }
                            }
                            currentVideo?.removeEventListener('canplay', onCanPlay);
                        };
                        currentVideo.addEventListener('canplay', onCanPlay);
                        syncAudioPlayback(time, false);
                        return;
                    } else {
                        videoRef.current.playbackRate = getClipPlaybackRate(clipAtTime);
                        if ('fastSeek' in videoRef.current && typeof videoRef.current.fastSeek === 'function') {
                            videoRef.current.fastSeek(clipTime);
                        } else {
                            videoRef.current.currentTime = clipTime;
                        }
                    }
                }
            } else {
                if ('fastSeek' in videoRef.current && typeof videoRef.current.fastSeek === 'function') {
                    videoRef.current.fastSeek(time);
                } else {
                    videoRef.current.currentTime = time;
                }
            }
            syncAudioPlayback(time, isPlaying && !isDraggingPlayhead);
        }
    }, [isDraggingPlayhead, isPlaying, syncAudioPlayback, findActiveClipAtTime, timelineToClipTime]);

    // Handler for background image upload (for ControlPanel)
    const handleImageUpload = useCallback(async (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (dataUrl) {
                const id = crypto.randomUUID();
                bgImgUrlToIdRef.current.set(dataUrl, id);
                bgImagesSave({ id, dataUrl, uploadedAt: Date.now() })
                    .catch(err => console.error("Error saving bg image:", err));
                setUploadedImages(prev => [dataUrl, ...prev]);
                setSelectedImageUrl(dataUrl);
            }
        };
        reader.readAsDataURL(file);
    }, []);

    const handleImageSelect = (url: string) => {
        if (backgroundTab === "wallpaper") {
            setUnsplashBgUrl(url);
        } else {
            setSelectedImageUrl(url);
        }
    };

    const handleWallpaperSelect = (index: number) => {
        setSelectedWallpaper(index);
        setUnsplashBgUrl("");
    };

    const handleImageRemove = (url: string) => {
        const id = bgImgUrlToIdRef.current.get(url);
        if (id) {
            bgImagesDelete(id).catch(err => console.error("Error deleting bg image:", err));
            bgImgUrlToIdRef.current.delete(url);
        }
        setUploadedImages(prev => prev.filter(img => img !== url));
        if (selectedImageUrl === url) setSelectedImageUrl("");
    };

    const handleBackgroundVideoUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith("video/")) return;

        try {
            const duration = await readVideoDuration(file);
            const id = crypto.randomUUID();
            await bgVideosSave({
                id,
                blob: file,
                name: file.name,
                type: file.type,
                duration,
                uploadedAt: Date.now(),
            });

            const url = URL.createObjectURL(file);
            backgroundVideoUrlsRef.current.set(id, url);
            setUploadedBackgroundVideos(previous => [{ id, url, name: file.name, duration, type: file.type }, ...previous]);
            setSelectedBackgroundVideoId(id);
            setBackgroundTab("video");
        } catch (error) {
            console.error("Error saving background video:", error);
        }
    }, []);

    const handleBackgroundVideoSelect = useCallback((id: string) => {
        setSelectedBackgroundVideoId(id);
        setBackgroundTab("video");
    }, []);

    const handleBackgroundVideoRemove = useCallback((id: string) => {
        bgVideosDelete(id).catch(err => console.error("Error deleting background video:", err));
        const url = backgroundVideoUrlsRef.current.get(id);
        if (url) URL.revokeObjectURL(url);
        backgroundVideoUrlsRef.current.delete(id);
        setUploadedBackgroundVideos(previous => previous.filter(video => video.id !== id));
        setSelectedBackgroundVideoId(current => current === id ? "" : current);
    }, []);

    // Background tab change handler
    const handleBackgroundTabChange = (tab: BackgroundTab) => {
        setBackgroundTab(tab);
    };

    // Handler para cambio de color/gradiente
    const handleBackgroundColorChange = (config: BackgroundColorConfig) => {
        setBackgroundColorConfig(config);
    };

    // Zoom fragment handlers
    const handleSelectZoomFragment = useCallback((fragmentId: string | null) => {
        setSelectedZoomFragmentId(fragmentId);
        if (fragmentId) {
            setSelectedAudioTrackId(null);
            setSelectedVideoClipId(null);
            setSelectedElementId(null);
        }
    }, []);

    const handleActivateZoomTool = useCallback(() => {
        setActiveTool("zoom");
    }, []);

    // Default duration for new zoom fragments
    const DEFAULT_ZOOM_FRAGMENT_DURATION = 2;

    const handleAddZoomFragment = useCallback((startTime: number) => {
        // Find valid position avoiding overlaps - use ref to get latest fragments
        const validPosition = findValidFragmentPosition(
            startTime,
            DEFAULT_ZOOM_FRAGMENT_DURATION,
            zoomFragmentsRef.current,
            videoDuration
        );

        if (!validPosition) {
            return;
        }

        const newFragment = createZoomFragment(validPosition.startTime, validPosition.endTime);
        setZoomFragments(prev => [...prev, newFragment].sort((a, b) => a.startTime - b.startTime));
        setSelectedZoomFragmentId(newFragment.id);
        setActiveTool("zoom");
    }, [videoDuration]);

    const handleUpdateZoomFragment = useCallback((fragmentId: string, updates: Partial<ZoomFragment>) => {
        setZoomFragments(prev => prev.map(f =>
            f.id === fragmentId ? { ...f, ...updates } : f
        ).sort((a, b) => a.startTime - b.startTime));
    }, []);

    const handleDeleteZoomFragment = useCallback((fragmentId: string) => {
        setZoomFragments(prev => prev.filter(f => f.id !== fragmentId));
        if (selectedZoomFragmentId === fragmentId) {
            setSelectedZoomFragmentId(null);
        }
    }, [selectedZoomFragmentId]);

    // Get currently selected zoom fragment - memoized
    const selectedZoomFragment = useMemo(() =>
        zoomFragments.find(f => f.id === selectedZoomFragmentId) || null,
        [zoomFragments, selectedZoomFragmentId]
    );

    // Calcular el CSS del background actual - memoized
    const backgroundColorCss = useMemo((): string | undefined => {
        if (backgroundTab === "color" && backgroundColorConfig) {
            if (backgroundColorConfig.type === "solid") {
                return backgroundColorConfig.config.color;
            } else {
                return gradientToCss(backgroundColorConfig.config);
            }
        }
        return undefined;
    }, [backgroundTab, backgroundColorConfig]);

    // Fullscreen toggle handler
    const toggleFullscreen = useCallback(async () => {
        if (!editorAreaRef.current) return;

        try {
            if (!document.fullscreenElement) {
                await editorAreaRef.current.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error("Error toggling fullscreen:", error);
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            // Also skip if inside a contenteditable element
            if ((e.target as HTMLElement)?.isContentEditable) return;

            // T key — Figma-style text tool: activate crosshair cursor to place text on canvas
            if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                setTextToolActive(true);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedElementId) {
                e.preventDefault();
                copySelectedElement();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                if (isPhotoMode && !copiedElement) {
                    return;
                }
                e.preventDefault();
                pasteElement();
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && selectedElementId) {
                e.preventDefault();
                deleteCanvasElement(selectedElementId);
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && selectedVideoClipId) {
                e.preventDefault();
                handleDeleteVideoClip(selectedVideoClipId);
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && selectedAudioTrackId) {
                e.preventDefault();
                handleDeleteAudioTrack(selectedAudioTrackId);
                setSelectedAudioTrackId(null);
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && selectedZoomFragmentId) {
                e.preventDefault();
                handleDeleteZoomFragment(selectedZoomFragmentId);
            }

            if (e.key === "Escape") {
                e.preventDefault();
                if (textToolActive) {
                    setTextToolActive(false);
                    return;
                }
                if (selectedElementId) {
                    setSelectedElementId(null);
                } else if (selectedVideoClipId) {
                    setSelectedVideoClipId(null);
                } else if (selectedAudioTrackId) {
                    setSelectedAudioTrackId(null);
                } else if (selectedZoomFragmentId) {
                    setSelectedZoomFragmentId(null);
                }
            }

        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [selectedElementId, selectedZoomFragmentId, selectedAudioTrackId, selectedVideoClipId, deleteCanvasElement, handleDeleteZoomFragment, handleDeleteAudioTrack, handleDeleteVideoClip, copySelectedElement, pasteElement, isPhotoMode, copiedElement, textToolActive]);

    useEffect(() => {
        const checkMobile = () => {
            if (window.innerWidth < 768) {
                setIsControlPanelOpen(false);
            }
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const handleAspectRatioChange = useCallback((ratio: AspectRatio) => {
        setAspectRatio(ratio);
    }, []);

    const handleCustomDimensionsChange = useCallback((dimensions: { width: number; height: number }) => {
        setCustomDimensions(dimensions);
    }, []);

    const handleOpenCropper = useCallback(() => {
        setIsCropperOpen(true);
    }, []);

    const handleCloseCropper = useCallback(() => {
        setIsCropperOpen(false);
    }, []);

    const handleCropApply = useCallback((crop: CropArea) => {
        setCropArea(crop);
    }, []);

    const handleVideoEnded = useCallback(() => {
        const clips = videoClipsRef.current;
        if (clips.length > 1) {
            const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);
            const currentIndex = sortedClips.findIndex(c => c.id === activeClipIdRef.current);
            if (currentIndex >= 0 && currentIndex < sortedClips.length - 1) {
                return;
            }
        }
        setIsPlaying(false);
        justEndedRef.current = true;
        const endTime = trimRange.end > 0 ? trimRange.end : videoDuration;
        setCurrentTime(endTime);
        setTimeout(() => { justEndedRef.current = false; }, 300);
    }, [trimRange.end, videoDuration]);

    const layersPanelToolbar = useMemo(() => (
        <EditorTopBar
            onExport={handleExport}
            exportProgress={exportProgress}
            hasTransparentBackground={backgroundTab === "wallpaper" && selectedWallpaper === -1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            editorMode={editorMode}
            onImageExport={handleImageExport}
            imageExportProgress={imageExportProgress}
            canvasWidth={customAspectRatio?.width || 1920}
            canvasHeight={customAspectRatio?.height || 1080}
            aspectRatio={aspectRatio}
            customDimensions={customDimensions}
            sourceDimensions={videoDimensions}
            onAspectRatioChange={setAspectRatio}
            onCustomDimensionsChange={setCustomDimensions}
            onSaveProject={saveLocalProject}
            onOpenProjects={() => { setLocalProjectsOpen(true); void refreshLocalProjects(); }}
            projectName={currentLocalProjectName}
            isSavingProject={localProjectSaving}
        />
    ), [
        handleExport, exportProgress, backgroundTab, selectedWallpaper, handleUndo, handleRedo,
        canUndo, canRedo, editorMode, handleImageExport, imageExportProgress,
        customAspectRatio?.width, customAspectRatio?.height, aspectRatio, customDimensions, videoDimensions,
        saveLocalProject, refreshLocalProjects,
        currentLocalProjectName, localProjectSaving,
    ]);

    // Only show camera if the active clip has camera support
    const activeClip = findActiveClipAtTime(currentTime);
    const shouldShowCamera = activeClip?.hasCamera === true;
    const effectiveCameraUrl = shouldShowCamera ? cameraUrl : null;

    return (
        <div className="flex flex-col h-screen w-full bg-[#0E0E12] text-white/60 font-sans overflow-hidden select-none">
            <div className="flex flex-1 overflow-hidden">
                <div className="hidden lg:flex">
                    <ToolsSidebar
                        activeTool={activeTool}
                        onToolChange={setActiveTool}
                        onVideoUpload={handleVideoUpload}
                        isUploading={isVideoImporting}
                        selectedZoomFragmentId={selectedZoomFragmentId}
                        selectedAudioTrackId={selectedAudioTrackId}
                        selectedVideoClipId={selectedVideoClipId}
                        selectedElementId={selectedElementId}
                        newVideosCount={newVideosCount}
                        editorMode={editorMode}
                        onImageUpload={handleImageUploadToCanvas}
                        onScreenCapture={handleScreenCapture}
                        isCapturing={isCapturing}
                    />
                </div>

                <div className="hidden lg:block">
                    <AnimatePresence mode="wait">
                        {isControlPanelOpen && (
                            <motion.div
                                key="control-panel"
                                initial={{ x: -320, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: -320, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                                <Suspense fallback={
                                    <div className="w-[320px] h-screen bg-[#141417] border-r border-white/10 flex items-center justify-center">
                                        <LoadingSpinner message="Cargando panel..." />
                                    </div>
                                }>
                                    <ControlPanel
                                        activeTool={activeTool}
                                        backgroundTab={backgroundTab}
                                        onVideoAudioToggle={handleVideoAudioToggle}
                                        onBackgroundTabChange={handleBackgroundTabChange}
                                        selectedWallpaper={selectedWallpaper}
                                        onWallpaperSelect={handleWallpaperSelect}
                                        backgroundBlur={backgroundBlur}
                                        onBackgroundBlurChange={setBackgroundBlur}
                                        padding={padding}
                                        onPaddingChange={setPadding}
                                        roundedCorners={roundedCorners}
                                        onRoundedCornersChange={handleRoundedCornersChange}
                                        shadows={shadows}
                                        aspectRatio={aspectRatio}
                                        onAspectRatioChange={handleAspectRatioChange}
                                        onShadowsChange={setShadows}
                                        uploadedImages={uploadedImages}
                                        selectedImageUrl={selectedImageUrl}
                                        uploadedBackgroundVideos={uploadedBackgroundVideos}
                                        selectedBackgroundVideoId={selectedBackgroundVideoId}
                                        backgroundVideoTransform={backgroundVideoTransform}
                                        onImageUpload={handleImageUpload}
                                        onImageSelect={handleImageSelect}
                                        onImageRemove={handleImageRemove}
                                        onBackgroundVideoUpload={handleBackgroundVideoUpload}
                                        onBackgroundVideoSelect={handleBackgroundVideoSelect}
                                        onBackgroundVideoRemove={handleBackgroundVideoRemove}
                                        onBackgroundVideoTransformReset={() => setBackgroundVideoTransform({ ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM })}
                                        backgroundColorConfig={backgroundColorConfig}
                                        backgroundColorCss={backgroundColorCss}
                                        onBackgroundColorChange={handleBackgroundColorChange}
                                        onTogglePanel={() => setIsControlPanelOpen(!isControlPanelOpen)}
                                        isOpen={isControlPanelOpen}
                                        zoomFragments={zoomFragments}
                                        selectedZoomFragment={selectedZoomFragment}
                                        onSelectZoomFragment={handleSelectZoomFragment}
                                        onAddZoomFragment={() => handleAddZoomFragment(currentTime)}
                                        onUpdateZoomFragment={handleUpdateZoomFragment}
                                        onDeleteZoomFragment={handleDeleteZoomFragment}
                                        videoUrl={videoUrl}
                                        videoThumbnail={selectedZoomFragment ? getThumbnailForTime(selectedZoomFragment.startTime)?.dataUrl ?? null : null}
                                        currentTime={currentTime}
                                        getThumbnailForTime={getThumbnailForTime}
                                        videoDimensions={videoDimensions}
                                        mockupId={mockupId}
                                        mockupConfig={mockupConfig}
                                        onMockupChange={handleMockupChange}
                                        onMockupConfigChange={handleMockupConfigChange}
                                        initialMockupMenuPage={initialMockupMenuPage}
                                        mockupMenuNavigationToken={mockupMenuNavigationToken}
                                        onAddCanvasElement={addCanvasElement}
                                        selectedCanvasElement={selectedCanvasElement}
                                        onUpdateCanvasElement={updateCanvasElement}
                                        onDeleteCanvasElement={deleteCanvasElement}
                                        onBringToFront={bringToFront}
                                        onSendToBack={sendToBack}
                                        uploadedAudios={uploadedAudios}
                                        audioTracks={audioTracks}
                                        muteOriginalAudio={muteOriginalAudio}
                                        masterVolume={masterVolume}
                                        onAudioUpload={handleAudioUpload}
                                        onAudioDelete={handleAudioDelete}
                                        onAddAudioTrack={handleAddAudioTrack}
                                        onUpdateAudioTrack={handleUpdateAudioTrack}
                                        onDeleteAudioTrack={handleDeleteAudioTrack}
                                        onToggleMuteOriginalAudio={handleToggleMuteOriginalAudio}
                                        onMasterVolumeChange={handleMasterVolumeChange}
                                        videoDuration={videoDuration}
                                        onAddVideoToTrack={handleAddVideoToTrack}
                                        onRemoveVideoFromTrack={handleRemoveVideoFromTrack}
                                        onVideoUploadToLibrary={handleVideoUpload}
                                        onVideoDeleteFromTrack={handleDeleteVideoFromLibrary}
                                        videosInTrackIds={videosInTrackIds}
                                        videosLibraryRefresh={videosLibraryRefresh}
                                        isVideoUploading={isVideoImporting}
                                        cameraUrl={cameraUrl}
                                        cameraConfig={cameraConfig}
                                        onCameraConfigChange={handleCameraConfigChange}
                                        imageProjects={imageProjects}
                                        currentImageProjectId={currentProject?.id || null}
                                        isLoadingProjects={isLoadingProjects}
                                        onSelectImageProject={handleSelectImageProject}
                                        onAddImageToCanvas={handleAddImageToCanvas}
                                        onDeleteImageProject={handleDeleteImageProject}
                                        onUploadImageToHistory={handleUploadImageToHistory}
                                        elementsTextTabTrigger={elementsTextTabTrigger}
                                        mediaType={isPhotoMode ? "image" : "video"}
                                        wallpaperShowAll={wallpaperShowAll}
                                        onWallpaperShowAllChange={setWallpaperShowAll}
                                    />
                                </Suspense>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div
                    ref={editorAreaRef}
                    className="flex-1 bg-[#09090B] flex flex-col relative overflow-hidden min-w-0"
                >
                    <AnimatePresence>
                        {!isControlPanelOpen && (
                            <TooltipAction label="Abrir panel de control" side="right">
                                <motion.button
                                    initial={{ x: -100, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -100, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut", delay: 0.15 }}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setIsControlPanelOpen(true)}
                                    className="absolute top-2 left-4 z-50 p-2 flex items-center gap-2 squircle-element bg-[#18181b] border border-white/10 text-white hover:bg-[#252529] transition-all duration-200 shadow-lg"
                                >
                                    <Link href="/" className="block sm:hidden"><Image src="/svg/logo-openvid.svg" alt="Logo" width={24} height={24} className="hover:opacity-80 transition-opacity" /></Link>
                                    <Icon icon="lucide:sidebar-open" width="20" className="hidden sm:block"
                                    />
                                </motion.button>
                            </TooltipAction>
                        )}
                    </AnimatePresence>

                    <VideoCanvas
                        activeTool={activeTool}
                        isPlaying={isPlaying}
                        previewQuality={previewQuality}
                        onMockupClick={handleMockupClick}
                        isRestoringProjectRef={isRestoringProjectRef}
                        layersPanelToolbar={layersPanelToolbar}
                        ref={canvasRef}
                        videoUrl={videoUrl}
                        videoRef={videoRef}
                        mediaType={isPhotoMode ? "image" : "video"}
                        imageUrl={imageUrl}
                        imageRef={imageRef}
                        imageTransform={imageTransform}
                        apply3DToBackground={apply3DToBackground}
                        imageMaskConfig={imageMaskConfig}
                        videoMaskConfig={videoMaskConfig}
                        onVideoMaskConfigChange={setVideoMaskConfig}
                        padding={padding}
                        roundedCorners={roundedCorners}
                        shadows={shadows}
                        aspectRatio={aspectRatio}
                        customAspectRatio={customAspectRatio}
                        cropArea={cropArea}
                        backgroundTab={backgroundTab}
                        selectedWallpaper={selectedWallpaper}
                        backgroundBlur={backgroundBlur}
                        selectedImageUrl={selectedImageUrl}
                        selectedBackgroundVideoUrl={selectedBackgroundVideoUrl}
                        backgroundVideoTransform={backgroundVideoTransform}
                        onBackgroundVideoTransformChange={setBackgroundVideoTransform}
                        unsplashOverrideUrl={unsplashBgUrl}
                        backgroundColorCss={backgroundColorCss}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        isScrubbing={isDraggingPlayhead}
                        scrubTime={scrubTime}
                        getThumbnailForTime={getThumbnailForTime}
                        zoomFragments={zoomFragments}
                        currentTime={currentTime}
                        mockupId={mockupId}
                        mockupConfig={mockupConfig ?? DEFAULT_MOCKUP_CONFIG}
                        onVideoUpload={handleVideoUpload}
                        onImageUpload={handleImageUploadToCanvas}
                        onImageDrop={handleImageDrop}
                        isUploading={isVideoImporting}
                        videoTransform={videoTransform}
                        onVideoTransformChange={setVideoTransform}
                        canvasElements={canvasElements}
                        selectedElementId={selectedElementId}
                        onElementUpdate={updateCanvasElement}
                        onElementSelect={selectCanvasElement}
                        onElementDelete={deleteCanvasElement}
                        onAddElement={addCanvasElement}
                        textToolActive={textToolActive}
                        onTextToolDeactivate={() => setTextToolActive(false)}
                        cameraUrl={effectiveCameraUrl}
                        cameraConfig={cameraConfig}
                        onCameraConfigChange={handleCameraConfigChange}
                        onCameraClick={handleCameraClick}
                        onEnded={handleVideoEnded}
                    />

                    {/* Video mode: Show player controls and timeline */}
                    {isVideoMode && (
                        <>
                            <PlayerControls
                                isPlaying={isPlaying}
                                currentTime={currentTime}
                                videoDuration={videoDuration}
                                aspectRatio={aspectRatio}
                                customAspectRatio={aspectRatio === "custom" ? customDimensions : videoDimensions}
                                isFullscreen={isFullscreen}
                                zoomLevel={timelineZoom}
                                onTogglePlayPause={togglePlayPause}
                                onSkipBackward={skipBackward}
                                onSkipForward={skipForward}
                                onToggleFullscreen={toggleFullscreen}
                                onAspectRatioChange={handleAspectRatioChange}
                                onCustomAspectRatioChange={handleCustomDimensionsChange}
                                onOpenCropper={handleOpenCropper}
                                onZoomChange={handleZoomChange}
                                videoMaskConfig={videoMaskConfig}
                                onVideoMaskConfigChange={setVideoMaskConfig}
                                videoPreviewImageUrl={getThumbnailForTime(currentDisplayTime)?.dataUrl ?? null}
                                onSplitClip={handleSplitVideoClip}
                                canSplitClip={canSplitClip}
                                previewQuality={previewQuality}
                                onPreviewQualityChange={handlePreviewQualityChange}
                                isPreviewCaching={isPreviewCaching}
                                previewCacheProgress={previewCacheProgress}
                                proxyStatus={proxyStatus}
                                proxyProgress={proxyProgress}
                                proxyCount={proxyCount}
                                canCreateProxies={videoClips.length > 0}
                                onCreateProxies={handleCreateProxies}
                                onRemoveProxies={handleRemoveProxies}
                                onCancelProxyCreation={handleCancelProxyCreation}
                            />

                            <Suspense fallback={<TimelineSkeleton />}>
                                <Timeline
                                    videoDuration={videoDuration}
                                    currentTime={currentTime}
                                    onSeek={handleSeek}
                                    videoUrl={videoUrl}
                                    zoomLevel={timelineZoom}
                                    isDraggingPlayhead={isDraggingPlayhead}
                                    onDragStart={handlePlayheadDragStart}
                                    onDragEnd={handlePlayheadDragEnd}
                                    trimRange={trimRange}
                                    onTrimChange={setTrimRange}
                                    videoClips={videoClips}
                                    selectedVideoClipId={selectedVideoClipId}
                                    onSelectVideoClip={handleSelectVideoClip}
                                    onUpdateVideoClip={handleUpdateVideoClip}
                                    onDeleteVideoClip={handleDeleteVideoClip}
                                    zoomFragments={zoomFragments}
                                    selectedZoomFragmentId={selectedZoomFragmentId}
                                    onSelectZoomFragment={handleSelectZoomFragment}
                                    onAddZoomFragment={handleAddZoomFragment}
                                    onUpdateZoomFragment={handleUpdateZoomFragment}
                                    onActivateZoomTool={handleActivateZoomTool}
                                    audioTracks={audioTracks}
                                    uploadedAudios={uploadedAudios}
                                    selectedAudioTrackId={selectedAudioTrackId}
                                    onSelectAudioTrack={handleSelectAudioTrack}
                                    onUpdateAudioTrack={handleUpdateAudioTrack}
                                    mockupActive={imagePhoneActive}
                                    mockupAnimation={imagePhoneAnimation}
                                    onUpdateMockupAnimation={(updates) => setImagePhoneAnimation(previous => ({ ...previous, ...updates }))}
                                    onActivateMockupTool={() => handleMockupClick("3d")}
                                    canvasElements={canvasElements}
                                    selectedCanvasElementId={selectedElementId}
                                    onSelectCanvasElement={(elementId) => selectCanvasElement(elementId)}
                                    onUpdateCanvasElement={updateCanvasElement}
                                />
                            </Suspense>
                        </>
                    )}

                    {/* Photo mode: Show placeholder instead of timeline */}
                    {isPhotoMode && (
                        <Suspense fallback={<TimelineSkeleton />}>
                            <PhotoEditorPlaceholder
                                canvasImageUrl={canvasImageUrl}
                                staticImageUrl={imageUrl}
                                onSelectPreview={handleSelectPreview}
                                selectedPreviewId={selectedPreviewId}
                                aspectRatio={aspectRatio}
                                onAspectRatioChange={handleAspectRatioChange}
                                customAspectRatio={customAspectRatio}
                                onCustomAspectRatioChange={handleCustomDimensionsChange}
                                onOpenCropper={handleOpenCropper}
                                apply3DToBackground={apply3DToBackground}
                                onToggle3DBackground={handleToggle3DBackground}
                                imageMaskConfig={imageMaskConfig}
                                onImageMaskConfigChange={setImageMaskConfig}
                                imageTransform={imageTransform}
                                onReset={handleResetPhotoEditor}
                            />
                        </Suspense>
                    )}

                </div>

            </div>

            <MobileToolsMenu
                activeTool={activeTool}
                onToolChange={setActiveTool}
                onVideoUpload={handleVideoUpload}
                isUploading={isVideoImporting}
                onOpenToolPanel={() => setIsMobileControlPanelOpen(true)}
            />

            <MobileControlPanel
                isOpen={isMobileControlPanelOpen}
                onClose={() => setIsMobileControlPanelOpen(false)}
                activeTool={activeTool}
                backgroundTab={backgroundTab}
                onBackgroundTabChange={handleBackgroundTabChange}
                selectedWallpaper={selectedWallpaper}
                onWallpaperSelect={handleWallpaperSelect}
                backgroundBlur={backgroundBlur}
                onBackgroundBlurChange={setBackgroundBlur}
                padding={padding}
                onPaddingChange={setPadding}
                roundedCorners={roundedCorners}
                onRoundedCornersChange={handleRoundedCornersChange}
                shadows={shadows}
                onShadowsChange={setShadows}
                uploadedImages={uploadedImages}
                selectedImageUrl={selectedImageUrl}
                uploadedBackgroundVideos={uploadedBackgroundVideos}
                selectedBackgroundVideoId={selectedBackgroundVideoId}
                backgroundVideoTransform={backgroundVideoTransform}
                onImageUpload={handleImageUpload}
                onImageSelect={handleImageSelect}
                onImageRemove={handleImageRemove}
                onBackgroundVideoUpload={handleBackgroundVideoUpload}
                onBackgroundVideoSelect={handleBackgroundVideoSelect}
                onBackgroundVideoRemove={handleBackgroundVideoRemove}
                onBackgroundVideoTransformReset={() => setBackgroundVideoTransform({ ...DEFAULT_BACKGROUND_VIDEO_TRANSFORM })}
                backgroundColorConfig={backgroundColorConfig}
                onBackgroundColorChange={handleBackgroundColorChange}
                zoomFragments={zoomFragments}
                selectedZoomFragment={selectedZoomFragment}
                onSelectZoomFragment={handleSelectZoomFragment}
                onAddZoomFragment={() => handleAddZoomFragment(currentTime)}
                onUpdateZoomFragment={handleUpdateZoomFragment}
                onDeleteZoomFragment={handleDeleteZoomFragment}
                videoUrl={videoUrl}
                videoThumbnail={selectedZoomFragment ? getThumbnailForTime(selectedZoomFragment.startTime)?.dataUrl ?? null : null}
                currentTime={currentTime}
                getThumbnailForTime={getThumbnailForTime}
                videoDimensions={videoDimensions}
                mockupId={mockupId}
                mockupConfig={mockupConfig}
                onMockupChange={handleMockupChange}
                onMockupConfigChange={handleMockupConfigChange}
                onAddCanvasElement={addCanvasElement}
                selectedCanvasElement={selectedCanvasElement}
                onUpdateCanvasElement={updateCanvasElement}
                onDeleteCanvasElement={deleteCanvasElement}
                onBringToFront={bringToFront}
                onSendToBack={sendToBack}
                uploadedAudios={uploadedAudios}
                audioTracks={audioTracks}
                muteOriginalAudio={muteOriginalAudio}
                masterVolume={masterVolume}
                onAudioUpload={handleAudioUpload}
                onAudioDelete={handleAudioDelete}
                onAddAudioTrack={handleAddAudioTrack}
                onUpdateAudioTrack={handleUpdateAudioTrack}
                onDeleteAudioTrack={handleDeleteAudioTrack}
                onToggleMuteOriginalAudio={handleToggleMuteOriginalAudio}
                onMasterVolumeChange={handleMasterVolumeChange}
                videoDuration={videoDuration}
                wallpaperShowAll={wallpaperShowAll}
                onWallpaperShowAllChange={setWallpaperShowAll}
            />

            <Suspense fallback={null}>
                <ExportOverlay
                    exportProgress={exportProgress}
                    onCancel={cancelExport}
                    isTransparentExport={backgroundTab === "wallpaper" && selectedWallpaper === -1}
                />
            </Suspense>
            <Suspense fallback={null}>
                {isVideoMode ? (
                    <VideoCropperModal
                        isOpen={isCropperOpen}
                        onClose={handleCloseCropper}
                        videoUrl={videoUrl}
                        onCropApply={handleCropApply}
                        initialCrop={cropArea}
                    />
                ) : (
                    <ImageCropperModal
                        isOpen={isCropperOpen}
                        onClose={handleCloseCropper}
                        imageUrl={imageUrl}
                        onCropApply={handleCropApply}
                        initialCrop={cropArea}
                    />
                )}
            </Suspense>

            {autoTrimModalOpen && pendingAudioUpload && (
                <AudioTrimModal
                    key={pendingAudioUpload.audio.id}
                    isOpen={autoTrimModalOpen}
                    audioName={pendingAudioUpload.audio.name}
                    audioUrl={pendingAudioUpload.audio.url}
                    audioDuration={pendingAudioUpload.audio.duration}
                    initialTrimStart={0}
                    initialTrimEnd={Math.min(pendingAudioUpload.audio.duration, videoDuration)}
                    onConfirm={(trimStart, trimEnd) => {
                        if (pendingAudioUpload) {
                            const lastTrackEnd = audioTracks.reduce((max, track) =>
                                Math.max(max, track.startTime + track.duration), 0);

                            const newTrack: AudioTrack = {
                                id: pendingAudioUpload.trackId,
                                audioId: pendingAudioUpload.audio.id,
                                name: pendingAudioUpload.audio.name,
                                startTime: lastTrackEnd,
                                duration: trimEnd - trimStart,
                                trimStart: trimStart,
                                volume: 1,
                                loop: false,
                            };

                            setAudioTracks(prev => [...prev, newTrack]);

                            if (audioTracks.length === 0) {
                                setMuteOriginalAudio(true);
                            }
                        }
                        setAutoTrimModalOpen(false);
                        setPendingAudioUpload(null);
                    }}
                    onCancel={() => {
                        if (pendingAudioUpload) {
                            setUploadedAudios(prev => prev.filter(a => a.id !== pendingAudioUpload.audio.id));
                            URL.revokeObjectURL(pendingAudioUpload.audio.url);
                        }
                        setAutoTrimModalOpen(false);
                        setPendingAudioUpload(null);
                    }}
                />
            )}
            <LocalProjectsDialog
                open={localProjectsOpen}
                projects={localProjects}
                activeProjectId={currentLocalProjectId}
                loading={localProjectsLoading}
                onClose={() => setLocalProjectsOpen(false)}
                onLoad={projectId => { void loadLocalProject(projectId); }}
                onDelete={projectId => { void handleDeleteLocalProject(projectId); }}
                onNew={handleNewLocalProject}
            />
        </div>
    );
}
