import { TIMELINE_ZOOM_SCALE } from './constants';

const VIDEO_FRAME_TIMEOUT_MS = 3000;
const SEEK_EPSILON_SECONDS = 0.0005;

/**
 * Wait until the browser has actually presented a decoded video frame.
 *
 * A `currentTime` assignment alone is not sufficient for frame-accurate
 * export: requestVideoFrameCallback can still report the frame that was
 * presented immediately before the seek. When an expected time is supplied,
 * reject that stale frame instead of silently drawing it into the export.
 */
export function waitForVideoFrame(
    video: HTMLVideoElement,
    expectedTime?: number,
    toleranceSeconds = 0.025,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let callbackId: number | null = null;

        const cleanup = () => {
            clearTimeout(timeoutId);
            if (callbackId !== null && 'cancelVideoFrameCallback' in video) {
                video.cancelVideoFrameCallback(callbackId);
            }
        };

        const succeed = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };

        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };

        const timeoutId = window.setTimeout(() => {
            fail(new Error(`Timed out waiting for video frame at ${expectedTime ?? video.currentTime}s`));
        }, VIDEO_FRAME_TIMEOUT_MS);

        if ('requestVideoFrameCallback' in video) {
            callbackId = video.requestVideoFrameCallback((_now, metadata) => {
                callbackId = null;
                if (
                    expectedTime !== undefined &&
                    Math.abs(metadata.mediaTime - expectedTime) > toleranceSeconds
                ) {
                    fail(new Error(
                        `Video presented a stale frame at ${metadata.mediaTime}s while ${expectedTime}s was requested`,
                    ));
                    return;
                }
                succeed();
            });
            return;
        }

        // Browsers without requestVideoFrameCallback only expose seek/paint
        // completion indirectly. Two animation frames ensure the newly-seeked
        // frame has reached the canvas compositor.
        requestAnimationFrame(() => requestAnimationFrame(succeed));
    });
}

function waitForSeek(video: HTMLVideoElement, targetTime: number): Promise<void> {
    if (!video.seeking && Math.abs(video.currentTime - targetTime) <= SEEK_EPSILON_SECONDS) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
        };

        const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };

        const onSeeked = () => finish();
        const onError = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`Video seek failed at ${targetTime}s`));
        };

        const timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`Timed out seeking video to ${targetTime}s`));
        }, VIDEO_FRAME_TIMEOUT_MS);

        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });

        if (Math.abs(video.currentTime - targetTime) > SEEK_EPSILON_SECONDS) {
            video.currentTime = targetTime;
        } else if (!video.seeking) {
            finish();
        }
    });
}

/** Seek and wait for the exact presented frame used by canvas export. */
export async function seekVideoToTime(
    video: HTMLVideoElement,
    requestedTime: number,
    toleranceSeconds = 0.025,
): Promise<void> {
    const lastDecodableTime = Number.isFinite(video.duration)
        ? Math.max(0, video.duration - 0.001)
        : requestedTime;
    const targetTime = Math.max(0, Math.min(requestedTime, lastDecodableTime));

    video.pause();
    await waitForSeek(video, targetTime);
    await waitForVideoFrame(video, targetTime, toleranceSeconds);
}

/**
 * Ensures the video is ready for export
 */
export async function ensureVideoReady(video: HTMLVideoElement): Promise<void> {
    // Wait if video is not loaded yet
    if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
            const onReady = () => {
                video.removeEventListener('canplay', onReady);
                resolve();
            };
            video.addEventListener('canplay', onReady, { once: true });
            setTimeout(resolve, 3000);
        });
    }
    
    // Pausar y mover al inicio
    video.pause();
    video.currentTime = 0;
    
    // Brief wait for the frame to be ready
    await new Promise<void>(resolve => setTimeout(resolve, 100));
}

export function formatTime(time: number): string {
    if (isNaN(time) || !isFinite(time) || time < 0) {
        return '00:00';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function getZoomMultiplier(zoom: number): number {
    const rounded = Math.round(Math.max(1, Math.min(10, zoom)));
    return TIMELINE_ZOOM_SCALE[rounded] ?? 1;
}
