export type MockupAnimationType = "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale" | "pop";
export type MockupMotionPreset = "none" | "turntable" | "float" | "orbit" | "showcase" | "wobble";
export type MockupKeyframeEasing = "linear" | "ease-in-out" | "ease-out";

export interface MockupTransform {
    x: number;
    y: number;
    scale: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
}

export interface MockupTransformKeyframe extends MockupTransform {
    id: string;
    time: number;
    easing: MockupKeyframeEasing;
}

export interface MockupAnimationConfig {
    type: MockupAnimationType;
    startTime: number;
    endTime: number;
    duration: number;
    delay: number;
    intensity: number;
    motionPreset?: MockupMotionPreset;
    motionIntensity?: number;
    motionSpeed?: number;
    keyframes?: MockupTransformKeyframe[];
}

export const DEFAULT_MOCKUP_ANIMATION: MockupAnimationConfig = {
    type: "none",
    startTime: 0,
    endTime: 0,
    duration: 0.6,
    delay: 0,
    intensity: 80,
    motionPreset: "none",
    motionIntensity: 60,
    motionSpeed: 1,
    keyframes: [],
};

export interface MockupAnimationState {
    visible: boolean;
    opacity: number;
    translateX: number;
    translateY: number;
    scale: number;
}

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
const easeKeyframe = (progress: number, easing: MockupKeyframeEasing) => {
    const clamped = clamp01(progress);
    if (easing === "ease-in-out") return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    if (easing === "ease-out") return 1 - Math.pow(1 - clamped, 3);
    return clamped;
};

export function getMockupTransformState(config: MockupAnimationConfig, time: number, base: MockupTransform): MockupTransform {
    const keyframes = [...(config.keyframes ?? [])].sort((a, b) => a.time - b.time);
    let transform = { ...base };
    if (keyframes.length === 1) {
        const { x, y, scale, rotationX, rotationY, rotationZ } = keyframes[0];
        transform = { x, y, scale, rotationX, rotationY, rotationZ };
    } else if (keyframes.length > 1) {
        const previous = [...keyframes].reverse().find(keyframe => keyframe.time <= time) ?? keyframes[0];
        const next = keyframes.find(keyframe => keyframe.time >= time) ?? keyframes[keyframes.length - 1];
        const range = next.time - previous.time;
        const progress = range <= 0 ? 0 : easeKeyframe((time - previous.time) / range, next.easing);
        transform = {
            x: lerp(previous.x, next.x, progress),
            y: lerp(previous.y, next.y, progress),
            scale: lerp(previous.scale, next.scale, progress),
            rotationX: lerp(previous.rotationX, next.rotationX, progress),
            rotationY: lerp(previous.rotationY, next.rotationY, progress),
            rotationZ: lerp(previous.rotationZ, next.rotationZ, progress),
        };
    }

    const preset = config.motionPreset ?? "none";
    const intensity = (config.motionIntensity ?? 60) / 100;
    const speed = Math.max(0.05, config.motionSpeed ?? 1);
    const localTime = Math.max(0, time - config.startTime) * speed;
    if (preset === "turntable") transform.rotationY += localTime * 120 * intensity;
    if (preset === "float") {
        transform.y += Math.sin(localTime * Math.PI * 1.4) * 24 * intensity;
        transform.rotationZ += Math.sin(localTime * Math.PI * 0.7) * 4 * intensity;
    }
    if (preset === "orbit") {
        transform.x += Math.sin(localTime * Math.PI * 0.8) * 42 * intensity;
        transform.y += Math.cos(localTime * Math.PI * 0.8) * 14 * intensity;
        transform.rotationY += Math.sin(localTime * Math.PI * 0.8) * 45 * intensity;
        transform.rotationX += Math.cos(localTime * Math.PI * 0.8) * 10 * intensity;
    }
    if (preset === "showcase") {
        transform.rotationY += Math.sin(localTime * Math.PI * 0.55) * 65 * intensity;
        transform.rotationX += Math.cos(localTime * Math.PI * 0.55) * 12 * intensity;
        transform.scale *= 1 + Math.sin(localTime * Math.PI * 0.55) * 0.08 * intensity;
    }
    if (preset === "wobble") {
        transform.rotationY += Math.sin(localTime * Math.PI * 2.2) * 16 * intensity;
        transform.rotationZ += Math.sin(localTime * Math.PI * 3.1) * 6 * intensity;
    }
    return transform;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const easeOutBack = (value: number) => {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
};

export function getMockupAnimationState(config: MockupAnimationConfig, time: number): MockupAnimationState {
    const endTime = config.endTime > 0 ? config.endTime : Number.POSITIVE_INFINITY;
    const visible = time >= config.startTime && time <= endTime;
    const raw = config.duration <= 0 ? 1 : clamp01((time - config.startTime - config.delay) / config.duration);
    const progress = config.type === "pop" ? easeOutBack(raw) : easeOutCubic(raw);
    const state: MockupAnimationState = { visible, opacity: visible ? 1 : 0, translateX: 0, translateY: 0, scale: 1 };
    if (!visible || config.type === "none") return state;
    if (config.type === "fade") state.opacity = raw;
    if (config.type.startsWith("slide-")) state.opacity = raw;
    if (config.type === "slide-up") state.translateY = (1 - progress) * config.intensity;
    if (config.type === "slide-down") state.translateY = -(1 - progress) * config.intensity;
    if (config.type === "slide-left") state.translateX = (1 - progress) * config.intensity;
    if (config.type === "slide-right") state.translateX = -(1 - progress) * config.intensity;
    if (config.type === "scale") { state.opacity = raw; state.scale = 0.6 + 0.4 * progress; }
    if (config.type === "pop") { state.opacity = raw; state.scale = 0.4 + 0.6 * progress; }
    return state;
}
