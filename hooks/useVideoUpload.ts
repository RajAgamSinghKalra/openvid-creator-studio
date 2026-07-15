import { useCallback, useState } from "react";
import { saveUploadedVideo, getUploadedVideo, deleteUploadedVideo, getVideoMetadata } from "@/lib/video-upload-cache";
import type { AspectRatio } from "@/types";

interface UploadedVideoData {
    url: string;
    videoId: string;
    duration: number;
    aspectRatio: AspectRatio;
    fileName: string;
    width: number;
    height: number;
    timestamp: number;
}

interface UseVideoUploadReturn {
    uploadVideo: (file: File) => Promise<UploadedVideoData | null>;
    loadUploadedVideo: () => Promise<UploadedVideoData | null>;
    clearUploadedVideo: () => Promise<void>;
    isUploading: boolean;
    uploadError: string | null;
}

// Browser persistence copies the Blob. Keep it optional so opening a large
// local file remains fast and does not double its storage footprint.
const BACKGROUND_CACHE_LIMIT = 200 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

function mapAspectRatio(ratio: string): AspectRatio {
    switch (ratio) {
        case "16:9": return "16:9";
        case "9:16": return "9:16";
        case "1:1": return "1:1";
        case "4:3": return "4:3";
        case "3:4": return "3:4";
        default: return "auto";
    }
}

export function useVideoUpload(): UseVideoUploadReturn {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const uploadVideo = useCallback(async (file: File): Promise<UploadedVideoData | null> => {
        setIsUploading(true);
        setUploadError(null);

        try {
            if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
                throw new Error("Formato de video no soportado. Use MP4, WebM o MOV.");
            }

            const metadata = await getVideoMetadata(file);
            const timestamp = Date.now();
            const url = URL.createObjectURL(file);
            const videoId = `session-${timestamp}-${crypto.randomUUID()}`;

            // Do not block the editor on an IndexedDB copy. Smaller files get
            // best-effort reload persistence; larger files stay session-only.
            if (file.size <= BACKGROUND_CACHE_LIMIT) {
                void saveUploadedVideo(file, metadata).catch((error) => {
                    console.warn("Video opened, but browser reload persistence was unavailable:", error);
                });
            }

            return {
                url,
                videoId,
                duration: metadata.duration,
                aspectRatio: mapAspectRatio(metadata.aspectRatio),
                fileName: file.name,
                width: metadata.width,
                height: metadata.height,
                timestamp,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error al subir el video";
            setUploadError(errorMessage);
            console.error("Video upload error:", error);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, []);

    const loadUploadedVideo = useCallback(async (): Promise<UploadedVideoData | null> => {
        try {
            const cachedVideo = await getUploadedVideo();
            
            if (!cachedVideo) {
                return null;
            }

            const url = URL.createObjectURL(cachedVideo.blob);
            const videoId = `uploaded-${cachedVideo.uploadedAt}`;

            return {
                url,
                videoId,
                duration: cachedVideo.duration,
                aspectRatio: mapAspectRatio(cachedVideo.aspectRatio),
                fileName: cachedVideo.fileName,
                width: cachedVideo.width,
                height: cachedVideo.height,
                timestamp: cachedVideo.uploadedAt,
            };
        } catch (error) {
            console.error("Error loading uploaded video:", error);
            return null;
        }
    }, []);

    const clearUploadedVideo = useCallback(async (): Promise<void> => {
        try {
            await deleteUploadedVideo();
        } catch (error) {
            console.error("Error clearing uploaded video:", error);
        }
    }, []);

    return {
        uploadVideo,
        loadUploadedVideo,
        clearUploadedVideo,
        isUploading,
        uploadError,
    };
}
