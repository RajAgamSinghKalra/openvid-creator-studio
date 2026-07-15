export interface ZoomFocusPoint {
    x: number;
    y: number;
}

export interface BoundedZoomTransform {
    scale: number;
    focusX: number;
    focusY: number;
    translateXPercent: number;
    translateYPercent: number;
    pivotXPercent: number;
    pivotYPercent: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function getZoomFocusBounds(targetScale: number): { min: number; max: number } {
    const safeScale = Math.max(1, Number.isFinite(targetScale) ? targetScale : 1);
    const min = 50 / safeScale;
    return { min, max: 100 - min };
}

/**
 * Keeps the selected focal point centerable without allowing the scaled frame
 * to uncover any canvas edge.
 */
export function clampZoomFocus(focusX: number, focusY: number, targetScale: number): ZoomFocusPoint {
    const bounds = getZoomFocusBounds(targetScale);
    return {
        x: clamp(Number.isFinite(focusX) ? focusX : 50, bounds.min, bounds.max),
        y: clamp(Number.isFinite(focusY) ? focusY : 50, bounds.min, bounds.max),
    };
}

/**
 * Produces the same top-left-origin transform for CSS preview and Canvas
 * export. The pivot is derived from the target scale, so every intermediate
 * entry/exit scale remains inside the frame as well.
 */
export function getBoundedZoomTransform(
    scale: number,
    focusX: number,
    focusY: number,
    targetScale: number = scale,
): BoundedZoomTransform {
    const safeScale = Math.max(1, Number.isFinite(scale) ? scale : 1);
    const safeTargetScale = Math.max(1, Number.isFinite(targetScale) ? targetScale : safeScale);
    const focus = clampZoomFocus(focusX, focusY, safeTargetScale);

    if (safeTargetScale <= 1.000001) {
        return {
            scale: safeScale,
            focusX: 50,
            focusY: 50,
            translateXPercent: 0,
            translateYPercent: 0,
            pivotXPercent: 50,
            pivotYPercent: 50,
        };
    }

    const pivotXPercent = clamp(
        (safeTargetScale * focus.x - 50) / (safeTargetScale - 1),
        0,
        100,
    );
    const pivotYPercent = clamp(
        (safeTargetScale * focus.y - 50) / (safeTargetScale - 1),
        0,
        100,
    );

    return {
        scale: safeScale,
        focusX: focus.x,
        focusY: focus.y,
        translateXPercent: (1 - safeScale) * pivotXPercent,
        translateYPercent: (1 - safeScale) * pivotYPercent,
        pivotXPercent,
        pivotYPercent,
    };
}
