export interface VideoTrackClip {
    id: string;
    libraryVideoId: string;
    name: string;
    startTime: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
    /** Source seconds played per timeline second. */
    playbackRate?: number;
    thumbnailUrl?: string;
    hasCamera?: boolean;
}

export const MIN_CLIP_DURATION = 0.1;
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 4;

export function getClipPlaybackRate(clip: Pick<VideoTrackClip, "playbackRate">): number {
    const rate = clip.playbackRate ?? 1;
    return Number.isFinite(rate) ? Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate)) : 1;
}

export function getClipTimelineDuration(clip: VideoTrackClip): number {
    return Math.max(0, clip.trimEnd - clip.trimStart) / getClipPlaybackRate(clip);
}

export function timelineToClipTime(clip: VideoTrackClip, timelineTime: number): number {
    return clip.trimStart + Math.max(0, timelineTime - clip.startTime) * getClipPlaybackRate(clip);
}

export interface SplitClipResult {
    updatedClip: VideoTrackClip;
    newClip: VideoTrackClip;
}

export function calculateTotalDuration(clips: VideoTrackClip[]): number {
    if (clips.length === 0) return 0;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    const lastClip = sorted[sorted.length - 1];
    return lastClip.startTime + getClipTimelineDuration(lastClip);
}

export function findNextClipPosition(clips: VideoTrackClip[]): number {
    if (clips.length === 0) return 0;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    const lastClip = sorted[sorted.length - 1];
    return lastClip.startTime + getClipTimelineDuration(lastClip);
}

export function doClipsOverlap(clip1: VideoTrackClip, clip2: VideoTrackClip): boolean {
    const clip1End = clip1.startTime + getClipTimelineDuration(clip1);
    const clip2End = clip2.startTime + getClipTimelineDuration(clip2);
    return clip1.startTime < clip2End && clip2.startTime < clip1End;
}

export function getClipAtTime(clips: VideoTrackClip[], time: number): VideoTrackClip | null {
    return clips.find(clip => {
        const clipEnd = clip.startTime + getClipTimelineDuration(clip);
        return time >= clip.startTime && time < clipEnd;
    }) || null;
}

export function getActiveClipAtTime(
    clips: VideoTrackClip[], 
    time: number
): { clip: VideoTrackClip; localTime: number } | null {
    const clip = getClipAtTime(clips, time);
    if (!clip) return null;
    
    const timeInClip = time - clip.startTime;
    const localTime = clip.trimStart + timeInClip * getClipPlaybackRate(clip);
    
    return { clip, localTime };
}

export function sortClipsByTime(clips: VideoTrackClip[]): VideoTrackClip[] {
    return [...clips].sort((a, b) => a.startTime - b.startTime);
}

export function splitClipAtTime(clip: VideoTrackClip, timelineTime: number): SplitClipResult | null {
    const clipDuration = getClipTimelineDuration(clip);
    const clipEnd = clip.startTime + clipDuration;

    if (
        timelineTime <= clip.startTime + MIN_CLIP_DURATION ||
        timelineTime >= clipEnd - MIN_CLIP_DURATION
    ) {
        return null;
    }

    const splitPointInSource = timelineToClipTime(clip, timelineTime);

    const updatedClip: VideoTrackClip = {
        ...clip,
        trimEnd: splitPointInSource,
    };

    const newClip: VideoTrackClip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: timelineTime,
        trimStart: splitPointInSource,
        trimEnd: clip.trimEnd,
    };

    return { updatedClip, newClip };
}
