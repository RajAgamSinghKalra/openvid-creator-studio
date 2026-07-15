"use client";

import { useRef } from "react";
import { Icon } from "@iconify/react";
import type { CanvasElement, TextElement } from "@/types/canvas-elements.types";

interface CanvasElementTrackItemProps {
    element: TextElement;
    contentWidth: number;
    timelineDuration: number;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<CanvasElement>) => void;
}

type DragMode = "move" | "start" | "end";

export function CanvasElementTrackItem({ element, contentWidth, timelineDuration, isSelected, onSelect, onUpdate }: CanvasElementTrackItemProps) {
    const dragRef = useRef<{ mode: DragMode; pointerId: number; startX: number; startTime: number; endTime: number } | null>(null);
    const startTime = Math.max(0, element.startTime ?? 0);
    const effectiveEnd = element.endTime && element.endTime > startTime ? Math.min(element.endTime, timelineDuration) : timelineDuration;
    const left = timelineDuration > 0 ? (startTime / timelineDuration) * contentWidth : 0;
    const width = timelineDuration > 0 ? Math.max(12, ((effectiveEnd - startTime) / timelineDuration) * contentWidth) : 0;

    const beginDrag = (event: React.PointerEvent, mode: DragMode) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startTime, endTime: effectiveEnd };
        onSelect();
    };

    const moveDrag = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || contentWidth <= 0 || timelineDuration <= 0) return;
        const deltaTime = ((event.clientX - drag.startX) / contentWidth) * timelineDuration;
        const minimumDuration = Math.min(0.25, timelineDuration);
        if (drag.mode === "move") {
            const clipDuration = drag.endTime - drag.startTime;
            const nextStart = Math.max(0, Math.min(timelineDuration - clipDuration, drag.startTime + deltaTime));
            onUpdate({ startTime: nextStart, endTime: nextStart + clipDuration });
        } else if (drag.mode === "start") {
            onUpdate({ startTime: Math.max(0, Math.min(drag.endTime - minimumDuration, drag.startTime + deltaTime)) });
        } else {
            onUpdate({ endTime: Math.min(timelineDuration, Math.max(drag.startTime + minimumDuration, drag.endTime + deltaTime)) });
        }
    };

    const endDrag = (event: React.PointerEvent) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div
            className={`absolute top-[10%] h-[80%] overflow-hidden rounded-md border select-none ${isSelected ? "border-cyan-200 bg-cyan-500/35 text-white" : "border-cyan-400/50 bg-cyan-500/18 text-cyan-100"}`}
            style={{ left, width }}
            onPointerDown={(event) => beginDrag(event, "move")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(event) => { event.stopPropagation(); onSelect(); }}
        >
            <button type="button" aria-label="Resize text start" className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-cyan-200/45 hover:bg-cyan-100" onPointerDown={(event) => beginDrag(event, "start")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
            <div className="flex h-full items-center gap-1.5 truncate px-3 pointer-events-none">
                <Icon icon="lucide:type" width="12" />
                <span className="truncate text-[9px] font-semibold">{element.content || "Text"}</span>
            </div>
            <button type="button" aria-label="Resize text end" className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-cyan-200/45 hover:bg-cyan-100" onPointerDown={(event) => beginDrag(event, "end")} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
        </div>
    );
}
