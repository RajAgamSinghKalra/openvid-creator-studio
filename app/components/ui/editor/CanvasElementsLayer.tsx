import { SVG_COMPONENTS } from "@/components/canvas-svg";
import { RotationHandleIcon } from "@/components/ui/RotationHandleIcon";
import { Corner, VIDEO_Z_INDEX, getNearestCorner, getCornerStyle } from "@/lib";
import { CanvasElement, SvgElement, ImageElement, TextElement } from "@/types/canvas-elements.types";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { getTextAnimationState, getTextBackgroundCss, getTextFontFamilyCss, getTextFontWeight } from "@/lib/text-rendering";

type ResizeDirection = { x: -1 | 0 | 1; y: -1 | 0 | 1; cursor: string; position: React.CSSProperties };

const TEXT_RESIZE_HANDLES: ResizeDirection[] = [
    { x: -1, y: -1, cursor: "nwse-resize", position: { left: -6, top: -6 } },
    { x: 0, y: -1, cursor: "ns-resize", position: { left: "50%", top: -6, transform: "translateX(-50%)" } },
    { x: 1, y: -1, cursor: "nesw-resize", position: { right: -6, top: -6 } },
    { x: 1, y: 0, cursor: "ew-resize", position: { right: -6, top: "50%", transform: "translateY(-50%)" } },
    { x: 1, y: 1, cursor: "nwse-resize", position: { right: -6, bottom: -6 } },
    { x: 0, y: 1, cursor: "ns-resize", position: { left: "50%", bottom: -6, transform: "translateX(-50%)" } },
    { x: -1, y: 1, cursor: "nesw-resize", position: { left: -6, bottom: -6 } },
    { x: -1, y: 0, cursor: "ew-resize", position: { left: -6, top: "50%", transform: "translateY(-50%)" } },
];

function TextResizeHandles({ element, refSize, layerRef, onUpdate }: {
    element: TextElement;
    refSize: number;
    layerRef: React.RefObject<HTMLDivElement | null>;
    onUpdate: (updates: Partial<CanvasElement>) => void;
}) {
    const dragRef = useRef<{
        pointerId: number; startX: number; startY: number; width: number; height: number;
        x: number; y: number; direction: ResizeDirection;
    } | null>(null);

    const beginResize = (event: React.PointerEvent<HTMLButtonElement>, direction: ResizeDirection) => {
        event.preventDefault();
        event.stopPropagation();
        const box = event.currentTarget.parentElement;
        if (!box || !layerRef.current || refSize <= 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            width: box.offsetWidth,
            height: box.offsetHeight,
            x: element.x,
            y: element.y,
            direction,
        };
    };

    const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        const layer = layerRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !layer || refSize <= 0) return;
        const angle = -element.rotation * Math.PI / 180;
        const screenDx = event.clientX - drag.startX;
        const screenDy = event.clientY - drag.startY;
        const localDx = screenDx * Math.cos(angle) - screenDy * Math.sin(angle);
        const localDy = screenDx * Math.sin(angle) + screenDy * Math.cos(angle);
        const nextWidth = drag.direction.x === 0 ? drag.width : Math.max(40, drag.width + drag.direction.x * localDx);
        const nextHeight = drag.direction.y === 0 ? drag.height : Math.max(24, drag.height + drag.direction.y * localDy);
        const localCenterX = drag.direction.x * (nextWidth - drag.width) / 2;
        const localCenterY = drag.direction.y * (nextHeight - drag.height) / 2;
        const rotation = element.rotation * Math.PI / 180;
        const centerDx = localCenterX * Math.cos(rotation) - localCenterY * Math.sin(rotation);
        const centerDy = localCenterX * Math.sin(rotation) + localCenterY * Math.cos(rotation);
        const layerRect = layer.getBoundingClientRect();
        onUpdate({
            x: Math.max(0, Math.min(100, drag.x + centerDx / layerRect.width * 100)),
            y: Math.max(0, Math.min(100, drag.y + centerDy / layerRect.height * 100)),
            width: nextWidth / refSize * 100,
            height: nextHeight / refSize * 100,
        });
    };

    const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return TEXT_RESIZE_HANDLES.map((direction, index) => (
        <button
            key={index}
            type="button"
            data-element-resize
            aria-label="Resize text box"
            className="absolute z-20 size-3 rounded-[2px] border-2 border-white bg-blue-500 shadow-sm pointer-events-auto"
            style={{ ...direction.position, cursor: direction.cursor }}
            onPointerDown={(event) => beginResize(event, direction)}
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onPointerMove={resize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
        />
    ));
}

function InlineTextEditor({
    element,
    refSize,
    onEnd
}: {
    element: TextElement;
    refSize: number;
    onEnd: (content: string) => void;
}) {
    const divRef = useRef<HTMLDivElement>(null);
    const committed = useRef(false);

    const commit = useCallback((node: HTMLElement) => {
        if (committed.current) return;
        committed.current = true;
        onEnd(node.textContent ?? "");
    }, [onEnd]);

    useEffect(() => {
        const node = divRef.current;
        if (!node) return;
        node.textContent = element.content;
        node.focus();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fontSize = refSize > 0 ? element.fontSize * (refSize / 1080) : element.fontSize;

    return (
        <div
            ref={divRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label="Edit text element"
            aria-multiline="true"
            style={{
                fontSize: `${fontSize}px`,
                fontFamily: getTextFontFamilyCss(element.fontFamily),
                fontWeight: getTextFontWeight(element.fontWeight),
                fontStyle: element.fontStyle ?? "normal",
                textDecoration: element.textDecoration ?? "none",
                textAlign: element.textAlign ?? "center",
                textTransform: element.textTransform ?? "none",
                color: element.color,
                opacity: element.opacity,
                outline: "none",
                border: "1.5px solid #3b82f6",
                borderRadius: "3px",
                padding: "2px 6px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                width: element.width > 0 ? "100%" : undefined,
                height: element.height > 0 ? "100%" : undefined,
                boxSizing: "border-box",
                overflow: element.height > 0 ? "auto" : undefined,
                minWidth: "20px",
                cursor: "text",
                pointerEvents: "auto",
                background: getTextBackgroundCss(element),
                WebkitTextStroke: (element.strokeWidth ?? 0) > 0 ? `${element.strokeWidth}px ${element.strokeColor ?? "#000000"}` : undefined,
                textShadow: (element.shadowBlur ?? 0) > 0 ? `${element.shadowOffsetX ?? 0}px ${element.shadowOffsetY ?? 0}px ${element.shadowBlur}px ${element.shadowColor ?? "#000000"}` : undefined,
                lineHeight: element.lineHeight ?? 1.2,
                letterSpacing: `${element.letterSpacing ?? 0}px`,
                userSelect: "text",
            }}
            onBlur={(e) => commit(e.currentTarget)}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") { e.preventDefault(); commit(e.currentTarget); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(e.currentTarget); }
            }}
            onPointerDown={(e) => e.stopPropagation()}
        />
    );
}

export function CanvasElementsLayer({
    canvasContainerRef,
    canvasElements,
    selectedElementId,
    selectedElementIds,
    hoveredElementId,
    isDraggingElement,
    behindVideo,
    onElementSelect,
    onMultiSelect,
    onElementUpdate,
    setHoveredElementId,
    setIsDraggingElement,
    setIsDraggingElementRotation,
    elementDragStart,
    layerZIndex,
    hitTestOnly = false,
    elementCorners: elementCornersProp,
    setElementCorners: setElementCornersProp,
    editingTextId = null,
    onDoubleClickText,
    onTextEditEnd,
    onGroupDragStart,
    videoIncludedInSelection,
    currentTime = 0,
}: {
    canvasContainerRef?: React.RefObject<HTMLDivElement | null>;
    canvasElements: CanvasElement[];
    selectedElementId: string | null;
    selectedElementIds?: string[];
    hoveredElementId: string | null;
    isDraggingElement: boolean;
    behindVideo: boolean;
    onElementSelect?: (id: string | null) => void;
    onMultiSelect?: (ids: string[]) => void;
    onElementUpdate?: (id: string, updates: Partial<CanvasElement>) => void;
    setHoveredElementId: (id: string | null) => void;
    setIsDraggingElement: (dragging: boolean) => void;
    setIsDraggingElementRotation: (dragging: boolean) => void;
    elementDragStart: React.MutableRefObject<{ x: number; y: number; initialX: number; initialY: number; initialRotation: number }>;
    layerZIndex: number;
    hitTestOnly?: boolean;
    elementCorners?: Record<string, Corner | null>;
    setElementCorners?: React.Dispatch<React.SetStateAction<Record<string, Corner | null>>>;
    editingTextId?: string | null;
    onDoubleClickText?: (id: string) => void;
    onTextEditEnd?: (id: string, content: string) => void;
    onGroupDragStart?: (e: React.MouseEvent) => void;
    videoIncludedInSelection?: boolean;
    currentTime?: number;
}) {
    const layerRef = useRef<HTMLDivElement>(null);
    const [refSize, setRefSize] = useState(0);

    const [localElementCorners, setLocalElementCorners] = useState<Record<string, Corner | null>>({});
    const elementCorners = elementCornersProp ?? localElementCorners;
    const setElementCorners = setElementCornersProp ?? setLocalElementCorners;

    useEffect(() => {
        const el = layerRef.current;
        if (!el) return;
        const measure = () => {
            const { width, height } = el.getBoundingClientRect();
            setRefSize(Math.min(width, height));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const toPx = (pct: number) => refSize > 0 ? (pct / 100) * refSize : 0;

    const setRefs = useCallback((node: HTMLDivElement | null) => {
        (layerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (canvasContainerRef) {
            const externalRef = canvasContainerRef as React.MutableRefObject<HTMLDivElement | null>;
            externalRef.current = node;
        }
    }, [canvasContainerRef]);

    const sortedElements = useMemo(() => {
        const filtered = hitTestOnly
            ? canvasElements
            : canvasElements.filter(el =>
                behindVideo ? el.zIndex < VIDEO_Z_INDEX : el.zIndex >= VIDEO_Z_INDEX
            );
        return [...filtered].sort((a, b) => {
            if (hitTestOnly) {
                if (a.id === selectedElementId) return 1;
                if (b.id === selectedElementId) return -1;
            }
            return a.zIndex - b.zIndex;
        });
    }, [canvasElements, hitTestOnly, behindVideo, selectedElementId]);

    if (sortedElements.length === 0) {
        return (
            <div
                ref={setRefs}
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: layerZIndex }}
            />
        );
    }

    return (
        <div
            ref={setRefs}
            className="absolute inset-0"
            onClick={(e) => {
                if (e.target === e.currentTarget && onElementSelect) {
                    onElementSelect(null);
                }
            }}
            style={{ zIndex: layerZIndex, pointerEvents: 'none' }}
        >
            {sortedElements.map((element) => {
                const isSelected = selectedElementId === element.id || (selectedElementIds?.includes(element.id) ?? false);
                const isHovered = hoveredElementId === element.id;
                const activeCorner: Corner | null = elementCorners[element.id] ?? null;

                if (element.type === "text" && currentTime >= 0 && !getTextAnimationState(element, currentTime).visible) {
                    return null;
                }

                const wPx = toPx(element.width);
                const hPx = toPx(element.height);

                const commonStyle: React.CSSProperties = {
                    position: "absolute",
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    width: wPx > 0 ? `${wPx}px` : `${element.width}%`,
                    height: hPx > 0 ? `${hPx}px` : `${element.height}%`,
                    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
                    zIndex: hitTestOnly ? element.zIndex : element.zIndex,
                    transition: isDraggingElement ? 'none' : 'transform 0.1s ease-out',
                };

                const handleMouseEnter = () => setHoveredElementId(element.id);
                const handleMouseLeave = () => {
                    setHoveredElementId(null);
                    setElementCorners(prev => ({ ...prev, [element.id]: null }));
                };
                const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
                    const corner = getNearestCorner(e, element.rotation);
                    setElementCorners(prev => ({ ...prev, [element.id]: corner }));
                };
                const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
                    if (!onElementSelect) return;
                    if (element.locked) return;
                    if (e.button === 2) return;
                    if ((e.target as HTMLElement).closest('[data-element-rotation]')) {
                        e.stopPropagation();
                        return;
                    }
                    if ((e.target as HTMLElement).closest('[data-element-resize]')) {
                        e.stopPropagation();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    const current = selectedElementIds ?? (selectedElementId ? [selectedElementId] : []);
                    const isGroupMember = current.includes(element.id) && (current.length > 1 || !!videoIncludedInSelection);

                    if (e.shiftKey && onMultiSelect) {
                        const next = current.includes(element.id)
                            ? current.filter(id => id !== element.id)
                            : [...current, element.id];
                        onMultiSelect(next);
                    } else if (isGroupMember) {
                        onElementSelect(element.id);
                    } else {
                        onElementSelect(element.id);
                        if (onMultiSelect) onMultiSelect([element.id]);
                    }
                    setIsDraggingElement(true);
                    elementDragStart.current = {
                        x: e.clientX, y: e.clientY,
                        initialX: element.x, initialY: element.y, initialRotation: element.rotation,
                    };

                    if (isGroupMember && videoIncludedInSelection && onGroupDragStart) {
                        onGroupDragStart(e);
                    }
                };

                const rotationHandle = (isSelected) && activeCorner && onElementUpdate ? (
                    <div
                        data-element-rotation
                        className="pointer-events-auto cursor-grab"
                        style={{ ...getCornerStyle(activeCorner, -14), padding: '1px', margin: '-1px' }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDraggingElementRotation(true);
                            elementDragStart.current = {
                                x: e.clientX,
                                y: e.clientY,
                                initialX: element.x,
                                initialY: element.y,
                                initialRotation: element.rotation,
                            };
                        }}
                    >
                        <RotationHandleIcon corner={activeCorner} />
                    </div>
                ) : null;

                const selectionBorder = (isSelected || isHovered) ? (
                    <div
                        className={`absolute inset-0 border pointer-events-none ${isSelected ? 'border-blue-500' : 'border-white/50'}`}
                        style={{ borderRadius: '2px' }}
                        aria-hidden="true"
                    />
                ) : null;

                if (hitTestOnly) {
                    if (element.visible === false) return null;
                    if (editingTextId === element.id) return null;

                    const TOP_Z_INDEX = 2147483647;

                    const expandedHitArea = isSelected ? (
                        <div
                            className="absolute"
                            style={{
                                backgroundColor: 'rgba(0,0,0,0.002)',
                                pointerEvents: 'auto'
                            }}
                        />
                    ) : null;

                    if (element.type === "text") {
                        return (
                            <div
                                key={element.id}
                                data-canvas-element
                                className={`absolute pointer-events-auto select-none ${element.locked ? "cursor-not-allowed" : "cursor-move"}`}
                                style={{
                                    left: `${element.x}%`,
                                    top: `${element.y}%`,
                                    width: element.width > 0 ? `${wPx}px` : undefined,
                                    height: element.height > 0 ? `${hPx}px` : undefined,
                                    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
                                    zIndex: isSelected ? TOP_Z_INDEX : element.zIndex,
                                    backgroundColor: isSelected ? 'rgba(0,0,0,0.002)' : 'transparent'
                                }}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                                onMouseMove={handleMouseMove}
                                onMouseDown={handleMouseDown}
                                onDoubleClick={(e) => {
                                    if (element.locked) return;
                                    e.stopPropagation();
                                    if (onDoubleClickText) onDoubleClickText(element.id);
                                }}
                            >
                                {expandedHitArea}

                                <div
                                    className="whitespace-pre-wrap break-words pointer-events-none"
                                    style={{
                                        fontSize: refSize > 0 ? `${element.fontSize * (refSize / 1080)}px` : `${element.fontSize}px`,
                                        fontFamily: element.fontFamily,
                                        width: element.width > 0 ? "100%" : undefined,
                                        height: element.height > 0 ? "100%" : undefined,
                                        boxSizing: "border-box",
                                        overflow: "hidden",
                                        opacity: 0
                                    }}
                                >
                                    {element.content}
                                </div>

                                {selectionBorder}
                                {rotationHandle}
                                {isSelected && !element.locked && onElementUpdate && (
                                    <TextResizeHandles element={element} refSize={refSize} layerRef={layerRef} onUpdate={(updates) => onElementUpdate(element.id, updates)} />
                                )}
                            </div>
                        );
                    }

                    return (
                        <div
                            key={element.id}
                            data-canvas-element
                            className={`absolute pointer-events-auto ${element.locked ? "cursor-not-allowed" : "cursor-move"}`}
                            style={{
                                ...commonStyle,
                                zIndex: isSelected ? TOP_Z_INDEX : element.zIndex,
                                backgroundColor: isSelected ? 'rgba(0,0,0,0.002)' : 'transparent'
                            }}
                            role="button"
                            aria-label={`Canvas element: ${element.type}`}
                            aria-pressed={isSelected}
                            tabIndex={0}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onMouseMove={handleMouseMove}
                            onMouseDown={handleMouseDown}
                        >
                            {expandedHitArea}

                            {selectionBorder}
                            {rotationHandle}
                        </div>
                    );
                }
                if (element.visible === false) return null;

                if (element.type === "svg") {
                    const SvgComponent = SVG_COMPONENTS[(element as SvgElement).svgId];
                    return (
                        <div
                            key={element.id}
                            className="absolute pointer-events-none"
                            style={commonStyle}
                        >
                            {SvgComponent && (
                                <div className="w-full h-full" style={{ opacity: element.opacity }}>
                                    <SvgComponent color={(element as SvgElement).color} className="w-full h-full" />
                                </div>
                            )}
                        </div>
                    );
                }

                if (element.type === "image") {
                    return (
                        <div
                            key={element.id}
                            className="absolute pointer-events-none"
                            style={commonStyle}
                        >
                            <img
                                src={(element as ImageElement).imagePath}
                                alt="Image element"
                                crossOrigin="anonymous"
                                className="w-full h-full object-contain rounded"
                                style={{ pointerEvents: 'none', opacity: element.opacity }}
                            />
                        </div>
                    );
                }

                if (element.type === "text") {
                    const isEditing = editingTextId === element.id;
                    const animationEnd = (element.startTime ?? 0) + (element.animation?.delay ?? 0) + (element.animation?.duration ?? 0);
                    const completedTime = Math.min(animationEnd, element.endTime ?? animationEnd);
                    const previewTime = currentTime < 0 ? completedTime : currentTime;
                    const animationState = getTextAnimationState(element, previewTime);
                    if (!animationState.visible) return null;
                    const scaledPadding = (element.backgroundPadding ?? 0) * (refSize / 1080);
                    return (
                        <div
                            key={element.id}
                            className="absolute"
                            style={{
                                left: `${element.x}%`,
                                top: `${element.y}%`,
                                width: element.width > 0 ? `${wPx}px` : undefined,
                                height: element.height > 0 ? `${hPx}px` : undefined,
                                transform: `translate(-50%, -50%) translate(${animationState.translateX * (refSize / 1080)}px, ${animationState.translateY * (refSize / 1080)}px) rotate(${element.rotation + animationState.rotation}deg) scale(${animationState.scale})`,
                                filter: animationState.blur > 0 ? `blur(${animationState.blur * (refSize / 1080)}px)` : undefined,
                                zIndex: isEditing ? 9999 : element.zIndex,
                                transition: isDraggingElement ? 'none' : 'transform 0.1s ease-out',
                                pointerEvents: isEditing ? 'auto' : 'none',
                            }}
                        >
                            {isEditing ? (
                                <InlineTextEditor
                                    element={element as TextElement}
                                    refSize={refSize}
                                    onEnd={(content) => {
                                        if (onTextEditEnd) onTextEditEnd(element.id, content);
                                    }}
                                />
                            ) : (
                                <div
                                    className="whitespace-pre-wrap break-words"
                                    style={{
                                        fontSize: refSize > 0 ? `${element.fontSize * (refSize / 1080)}px` : `${element.fontSize}px`,
                                        fontFamily: getTextFontFamilyCss(element.fontFamily),
                                        fontWeight: getTextFontWeight(element.fontWeight),
                                        fontStyle: element.fontStyle ?? 'normal',
                                        textDecoration: element.textDecoration ?? 'none',
                                        textTransform: element.textTransform ?? 'none',
                                        textAlign: element.textAlign ?? 'center',
                                        pointerEvents: 'none',
                                        width: element.width > 0 ? "100%" : undefined,
                                        height: element.height > 0 ? "100%" : undefined,
                                        overflow: "hidden",
                                        overflowWrap: "anywhere",
                                        boxSizing: "border-box",
                                        display: element.height > 0 ? "flex" : undefined,
                                        alignItems: element.height > 0 ? "center" : undefined,
                                        justifyContent: element.textAlign === "left" ? "flex-start" : element.textAlign === "right" ? "flex-end" : "center",
                                        opacity: element.opacity * animationState.opacity,
                                        lineHeight: element.lineHeight ?? 1.2,
                                        letterSpacing: `${(element.letterSpacing ?? 0) * (refSize / 1080)}px`,
                                        padding: `${scaledPadding}px`,
                                        borderRadius: `${(element.backgroundRadius ?? 0) * (refSize / 1080)}px`,
                                        backgroundColor: getTextBackgroundCss(element),
                                    }}
                                >
                                    <span style={{
                                        color: element.fillType === "gradient" ? "transparent" : element.color,
                                        backgroundImage: element.fillType === "gradient" ? `linear-gradient(${element.gradientAngle ?? 0}deg, ${element.color}, ${element.gradientColor ?? "#A855F7"})` : undefined,
                                        backgroundClip: element.fillType === "gradient" ? "text" : undefined,
                                        WebkitBackgroundClip: element.fillType === "gradient" ? "text" : undefined,
                                        WebkitTextStroke: (element.strokeWidth ?? 0) > 0 ? `${(element.strokeWidth ?? 0) * (refSize / 1080)}px ${element.strokeColor ?? '#000000'}` : undefined,
                                        textShadow: [
                                            (element.glowBlur ?? 0) > 0 ? `0 0 ${(element.glowBlur ?? 0) * (refSize / 1080)}px ${element.glowColor ?? element.color}` : "",
                                            (element.shadowBlur ?? 0) > 0 ? `${(element.shadowOffsetX ?? 0) * (refSize / 1080)}px ${(element.shadowOffsetY ?? 0) * (refSize / 1080)}px ${(element.shadowBlur ?? 0) * (refSize / 1080)}px ${element.shadowColor ?? '#000000'}` : "",
                                        ].filter(Boolean).join(", ") || undefined,
                                    }}>{animationState.content}</span>
                                </div>
                            )}
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
}
