import { VideoCanvasProps, VideoThumbnail } from "@/types";
import { memo, useEffect, useRef } from "react";

export const MediaContent = memo(function MediaContent({
    mediaType, videoUrl, videoRef, imageUrl, imageRef,
    cropArea, hasMask, hasMockup, maskStyles,
    currentThumbnail, isVideoHovered,
    onTimeUpdate, onLoadedMetadata, onEnded,
    previewScale = 1,
    isPlaying = false,
}: {
    mediaType: "video" | "image";
    videoUrl: string | null;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    imageUrl: string | null;
    imageRef?: React.RefObject<HTMLImageElement | null>;
    cropArea?: VideoCanvasProps["cropArea"];
    hasMask: boolean;
    hasMockup: boolean;
    maskStyles: React.CSSProperties;
    currentThumbnail: VideoThumbnail | null;
    isVideoHovered: boolean;
    onTimeUpdate?: () => void;
    onLoadedMetadata?: () => void;
    onEnded?: () => void;
    previewScale?: number;
    isPlaying?: boolean;
}) {
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const useReducedPreview = mediaType === "video" && previewScale < 0.999;

    useEffect(() => {
        if (!useReducedPreview) return;
        const video = videoRef.current;
        const canvas = previewCanvasRef.current;
        if (!video || !canvas) return;

        let videoFrameId: number | null = null;
        let animationFrameId: number | null = null;
        let disposed = false;

        const draw = () => {
            if (disposed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
            const width = Math.max(2, Math.round((video.videoWidth * previewScale) / 2) * 2);
            const height = Math.max(2, Math.round((video.videoHeight * previewScale) / 2) * 2);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
            if (!context) return;
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "medium";
            context.drawImage(video, 0, 0, width, height);
        };

        const schedule = () => {
            if (disposed || !isPlaying || video.paused) return;
            if ("requestVideoFrameCallback" in video) {
                videoFrameId = video.requestVideoFrameCallback(() => {
                    videoFrameId = null;
                    draw();
                    schedule();
                });
            } else {
                animationFrameId = requestAnimationFrame(() => {
                    animationFrameId = null;
                    draw();
                    schedule();
                });
            }
        };

        const refresh = () => draw();
        video.addEventListener("loadeddata", refresh);
        video.addEventListener("seeked", refresh);
        video.addEventListener("play", schedule);
        draw();
        schedule();

        return () => {
            disposed = true;
            if (videoFrameId !== null) video.cancelVideoFrameCallback(videoFrameId);
            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
            video.removeEventListener("loadeddata", refresh);
            video.removeEventListener("seeked", refresh);
            video.removeEventListener("play", schedule);
        };
    }, [isPlaying, previewScale, useReducedPreview, videoRef, videoUrl]);

    if (mediaType === "video" && videoUrl) {
        const mediaStyles: React.CSSProperties = {
            ...(cropArea && (cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0)
                ? { objectViewBox: `inset(${cropArea.y}% ${100 - cropArea.x - cropArea.width}% ${100 - cropArea.y - cropArea.height}% ${cropArea.x}%)` }
                : {}),
            ...(hasMask && !hasMockup ? maskStyles : {}),
        };
        return (
            <>
                <video
                    key={videoUrl}
                    ref={videoRef}
                    preload="auto"
                    playsInline
                    className="w-full h-full object-contain"
                    style={{
                        ...mediaStyles,
                        opacity: currentThumbnail || useReducedPreview ? 0 : 1,
                    }}
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onEnded={onEnded}
                />
                <canvas
                    ref={previewCanvasRef}
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{
                        ...mediaStyles,
                        display: useReducedPreview ? "block" : "none",
                        opacity: currentThumbnail ? 0 : 1,
                    }}
                />
                {currentThumbnail && (
                    <img
                        src={currentThumbnail.dataUrl}
                        alt="Preview"
                        crossOrigin="anonymous"
                        className="absolute inset-0 w-full h-full object-contain"
                        style={hasMask && !hasMockup ? maskStyles : {}}
                    />
                )}
            </>
        );
    }

    if (mediaType === "image" && imageUrl) {
        return (
            <>
                <img
                    ref={imageRef as React.RefObject<HTMLImageElement>}
                    src={imageUrl}
                    alt="Editing image"
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                    style={{
                        ...(cropArea && (cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0) ? {
                            objectViewBox: `inset(${cropArea.y}% ${100 - cropArea.x - cropArea.width}% ${100 - cropArea.y - cropArea.height}% ${cropArea.x}%)`
                        } : {}),
                        ...(hasMask && !hasMockup ? maskStyles : {}),
                    }}
                    onLoad={onLoadedMetadata}
                />
                <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                    style={{
                        background: "radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.75) 100%)",
                        opacity: isVideoHovered ? 1 : 0,
                        zIndex: 10,
                    }}
                />
            </>
        );
    }

    return null;
});
