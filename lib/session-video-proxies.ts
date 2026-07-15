import {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    WebMOutputFormat,
    canEncodeAudio,
    canEncodeVideo,
} from "mediabunny";

export interface SessionVideoProxy {
    libraryVideoId: string;
    blob: Blob;
    url: string;
    width: number;
    height: number;
    createdAt: number;
}

export interface CreateSessionVideoProxyOptions {
    libraryVideoId: string;
    source: Blob;
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
}

const PROXY_LONG_EDGE = 960;
const PROXY_FRAME_RATE = 30;
const PROXY_VIDEO_BITRATE = 1_500_000;
const PROXY_AUDIO_BITRATE = 96_000;

function even(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
}

function fitProxySize(width: number, height: number): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (!longest || longest <= PROXY_LONG_EDGE) return { width: even(width), height: even(height) };
    const scale = PROXY_LONG_EDGE / longest;
    return { width: even(width * scale), height: even(height * scale) };
}

/**
 * Creates a low-bandwidth editing proxy using the browser's WebCodecs path.
 * The result is intentionally returned as an in-memory Blob URL and is never
 * written to IndexedDB or the project file.
 */
export async function createSessionVideoProxy({
    libraryVideoId,
    source,
    signal,
    onProgress,
}: CreateSessionVideoProxyOptions): Promise<SessionVideoProxy> {
    if (signal?.aborted) throw new DOMException("Proxy creation cancelled", "AbortError");

    const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("This file does not contain a video track.");

    const dimensions = fitProxySize(videoTrack.displayWidth, videoTrack.displayHeight);
    const supportsAvc = await canEncodeVideo("avc", {
        ...dimensions,
        bitrate: PROXY_VIDEO_BITRATE,
        hardwareAcceleration: "prefer-hardware",
    });
    const supportsAac = await canEncodeAudio("aac", { bitrate: PROXY_AUDIO_BITRATE });
    const supportsVp9 = !supportsAvc && await canEncodeVideo("vp9", {
        ...dimensions,
        bitrate: PROXY_VIDEO_BITRATE,
        hardwareAcceleration: "prefer-hardware",
    });
    const supportsOpus = !supportsAvc && await canEncodeAudio("opus", { bitrate: PROXY_AUDIO_BITRATE });

    if (!supportsAvc && !supportsVp9) {
        throw new Error("This browser cannot create a hardware-accelerated editing proxy for this video.");
    }

    const target = new BufferTarget();
    const output = new Output({
        format: supportsAvc ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
        target,
    });
    const conversion = await Conversion.init({
        input,
        output,
        video: {
            ...dimensions,
            fit: "contain",
            frameRate: PROXY_FRAME_RATE,
            codec: supportsAvc ? "avc" : "vp9",
            bitrate: PROXY_VIDEO_BITRATE,
            keyFrameInterval: 1,
            hardwareAcceleration: "prefer-hardware",
            forceTranscode: true,
        },
        audio: supportsAvc
            ? (supportsAac ? { codec: "aac", bitrate: PROXY_AUDIO_BITRATE, forceTranscode: true } : { discard: true })
            : (supportsOpus ? { codec: "opus", bitrate: PROXY_AUDIO_BITRATE, forceTranscode: true } : { discard: true }),
        showWarnings: false,
    });

    if (!conversion.isValid) {
        throw new Error("The browser could not decode this video's codec for proxy creation.");
    }

    const abort = () => { void conversion.cancel(); };
    signal?.addEventListener("abort", abort, { once: true });
    conversion.onProgress = progress => onProgress?.(Math.max(0, Math.min(1, progress)));

    try {
        await conversion.execute();
    } finally {
        signal?.removeEventListener("abort", abort);
        input.dispose();
    }

    if (!target.buffer) throw new Error("Proxy encoding completed without producing media.");
    const type = supportsAvc ? "video/mp4" : "video/webm";
    const blob = new Blob([target.buffer], { type });
    return {
        libraryVideoId,
        blob,
        url: URL.createObjectURL(blob),
        width: dimensions.width,
        height: dimensions.height,
        createdAt: Date.now(),
    };
}

export function disposeSessionVideoProxy(proxy: SessionVideoProxy): void {
    URL.revokeObjectURL(proxy.url);
}
