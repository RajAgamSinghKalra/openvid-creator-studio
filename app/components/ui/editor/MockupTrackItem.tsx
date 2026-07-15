"use client";

import { useRef } from "react";
import { Icon } from "@iconify/react";
import type { MockupAnimationConfig } from "@/types/mockup-animation.types";

interface MockupTrackItemProps {
    config: MockupAnimationConfig;
    contentWidth: number;
    videoDuration: number;
    onUpdate: (updates: Partial<MockupAnimationConfig>) => void;
    onSelect?: () => void;
    currentTime?: number;
    onSeek?: (time: number) => void;
}

type DragMode = "move" | "start" | "end";

export function MockupTrackItem({ config, contentWidth, videoDuration, onUpdate, onSelect, currentTime = 0, onSeek }: MockupTrackItemProps) {
    const dragRef = useRef<{ mode: DragMode; pointerId: number; startX: number; startTime: number; endTime: number; keyframes: MockupAnimationConfig["keyframes"] } | null>(null);
    const keyframeDragRef = useRef<{ pointerId: number; id: string; startX: number; startTime: number } | null>(null);
    const effectiveEnd = config.endTime > 0 ? Math.min(config.endTime, videoDuration) : videoDuration;
    const left = videoDuration > 0 ? (config.startTime / videoDuration) * contentWidth : 0;
    const width = videoDuration > 0 ? Math.max(10, ((effectiveEnd - config.startTime) / videoDuration) * contentWidth) : 0;

    const beginDrag = (event: React.PointerEvent, mode: DragMode) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startTime: config.startTime, endTime: effectiveEnd, keyframes: config.keyframes };
        onSelect?.();
    };

    const moveDrag = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || contentWidth <= 0 || videoDuration <= 0) return;
        const deltaTime = ((event.clientX - drag.startX) / contentWidth) * videoDuration;
        const minimumDuration = Math.min(0.25, videoDuration);

        if (drag.mode === "move") {
            const clipDuration = drag.endTime - drag.startTime;
            const startTime = Math.max(0, Math.min(videoDuration - clipDuration, drag.startTime + deltaTime));
            const appliedDelta = startTime - drag.startTime;
            onUpdate({
                startTime,
                endTime: startTime + clipDuration,
                keyframes: (drag.keyframes ?? []).map(keyframe => ({ ...keyframe, time: keyframe.time + appliedDelta })),
            });
        } else if (drag.mode === "start") {
            onUpdate({ startTime: Math.max(0, Math.min(drag.endTime - minimumDuration, drag.startTime + deltaTime)) });
        } else {
            onUpdate({ endTime: Math.min(videoDuration, Math.max(drag.startTime + minimumDuration, drag.endTime + deltaTime)) });
        }
    };

    const endDrag = (event: React.PointerEvent) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const beginKeyframeDrag = (event: React.PointerEvent, id: string, time: number) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        keyframeDragRef.current = { pointerId: event.pointerId, id, startX: event.clientX, startTime: time };
        onSelect?.();
        onSeek?.(time);
    };
    const moveKeyframe = (event: React.PointerEvent) => {
        const drag = keyframeDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || contentWidth <= 0) return;
        const delta = (event.clientX - drag.startX) / contentWidth * videoDuration;
        const time = Math.max(config.startTime, Math.min(effectiveEnd, drag.startTime + delta));
        onUpdate({ keyframes: (config.keyframes ?? []).map(keyframe => keyframe.id === drag.id ? { ...keyframe, time } : keyframe).sort((a, b) => a.time - b.time) });
        onSeek?.(time);
    };
    const endKeyframeDrag = (event: React.PointerEvent) => {
        if (keyframeDragRef.current?.pointerId !== event.pointerId) return;
        keyframeDragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div
            className="absolute top-[12%] h-[76%] rounded-md border border-violet-400/60 bg-violet-500/20 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.15)] select-none overflow-hidden"
            style={{ left, width }}
            onPointerDown={(event) => beginDrag(event, "move")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(event) => { event.stopPropagation(); onSelect?.(); }}
        >
            <button type="button" aria-label="Resize mockup start" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-violet-300/50 hover:bg-violet-200" onPointerDown={(event) => beginDrag(event, "start")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
            <div className="h-full px-3 flex items-center gap-1.5 pointer-events-none truncate">
                <Icon icon="mdi:cellphone-screenshot" width="13" />
                <span className="text-[9px] font-semibold truncate">Mockup - {(config.motionPreset ?? "none") !== "none" ? config.motionPreset : config.type.replace("-", " ")}</span>
            </div>
            {(config.keyframes ?? []).map((keyframe) => {
                const clipDuration = Math.max(0.001, effectiveEnd - config.startTime);
                const markerLeft = ((keyframe.time - config.startTime) / clipDuration) * 100;
                const active = Math.abs(currentTime - keyframe.time) < 0.08;
                return (
                    <button
                        key={keyframe.id}
                        type="button"
                        aria-label={`Mockup keyframe at ${keyframe.time.toFixed(2)} seconds`}
                        className={`absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border ${active ? "border-white bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.8)]" : "border-amber-200 bg-amber-500"}`}
                        style={{ left: `${Math.max(0, Math.min(100, markerLeft))}%` }}
                        onPointerDown={(event) => beginKeyframeDrag(event, keyframe.id, keyframe.time)}
                        onPointerMove={moveKeyframe}
                        onPointerUp={endKeyframeDrag}
                        onPointerCancel={endKeyframeDrag}
                    />
                );
            })}
            <button type="button" aria-label="Resize mockup end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-violet-300/50 hover:bg-violet-200" onPointerDown={(event) => beginDrag(event, "end")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
        </div>
    );
}
