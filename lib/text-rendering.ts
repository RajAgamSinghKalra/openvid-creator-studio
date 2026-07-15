import type { TextElement } from "@/types/canvas-elements.types";

const FONT_VARIABLES: Record<string, string> = {
    Inter: "--font-inter", Roboto: "--font-roboto", Poppins: "--font-poppins",
    Montserrat: "--font-montserrat", "DM Sans": "--font-dm-sans",
};

export interface TextAnimationState {
    opacity: number;
    translateX: number;
    translateY: number;
    scale: number;
    content: string;
    visible: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const easeOutBack = (value: number) => {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
};

export function getTextContent(element: TextElement): string {
    if (element.textTransform === "uppercase") return element.content.toUpperCase();
    if (element.textTransform === "lowercase") return element.content.toLowerCase();
    return element.content;
}

export function getTextAnimationState(element: TextElement, time: number): TextAnimationState {
    const content = getTextContent(element);
    const startTime = element.startTime ?? 0;
    const endTime = element.endTime ?? Number.POSITIVE_INFINITY;
    const animation = element.animation ?? { type: "none", duration: 0.5, delay: 0, intensity: 50 };
    const rawProgress = animation.duration <= 0 ? 1 : clamp01((time - startTime - animation.delay) / animation.duration);
    const progress = animation.type === "pop" ? easeOutBack(rawProgress) : easeOutCubic(rawProgress);
    const visible = time >= startTime && time <= endTime;
    const state: TextAnimationState = { opacity: visible ? 1 : 0, translateX: 0, translateY: 0, scale: 1, content, visible };

    if (!visible || animation.type === "none") return state;
    if (animation.type === "fade") state.opacity = rawProgress;
    if (animation.type.startsWith("slide-")) state.opacity = rawProgress;
    if (animation.type === "slide-up") state.translateY = (1 - progress) * animation.intensity;
    if (animation.type === "slide-down") state.translateY = -(1 - progress) * animation.intensity;
    if (animation.type === "slide-left") state.translateX = (1 - progress) * animation.intensity;
    if (animation.type === "slide-right") state.translateX = -(1 - progress) * animation.intensity;
    if (animation.type === "scale") { state.opacity = rawProgress; state.scale = 0.65 + 0.35 * progress; }
    if (animation.type === "pop") { state.opacity = rawProgress; state.scale = 0.45 + 0.55 * progress; }
    if (animation.type === "typewriter") state.content = content.slice(0, Math.floor(content.length * rawProgress));
    return state;
}

export function getTextFontFamilyCss(fontFamily: string): string {
    const variable = FONT_VARIABLES[fontFamily];
    return variable ? `var(${variable}), ${fontFamily}, sans-serif` : `${fontFamily}, sans-serif`;
}

export function getCanvasFontFamily(fontFamily: string): string {
    const variable = FONT_VARIABLES[fontFamily];
    if (variable && typeof document !== "undefined") {
        const resolved = getComputedStyle(document.body).getPropertyValue(variable).trim();
        if (resolved) return `${resolved}, ${fontFamily}, sans-serif`;
    }
    return `${fontFamily}, sans-serif`;
}

function colorWithOpacity(color: string, opacity: number): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        const [r, g, b] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
        return `rgba(${r}, ${g}, ${b}, ${clamp01(opacity)})`;
    }
    return color;
}

export function getTextBackgroundCss(element: TextElement): string {
    if (!element.backgroundColor || (element.backgroundOpacity ?? 0) <= 0) return "transparent";
    return colorWithOpacity(element.backgroundColor, element.backgroundOpacity ?? 1);
}

export function drawTextElement(ctx: CanvasRenderingContext2D, element: TextElement, canvasWidth: number, canvasHeight: number, time: number) {
    const state = getTextAnimationState(element, time);
    if (!state.visible || state.opacity <= 0) return;

    const scale = Math.min(canvasWidth, canvasHeight) / 1080;
    const fontSize = element.fontSize * scale;
    const lineHeight = fontSize * (element.lineHeight ?? 1.2);
    const weight = element.fontWeight === "normal" ? 400 : element.fontWeight === "medium" ? 500 : 700;

    ctx.save();
    ctx.translate((element.x / 100) * canvasWidth, (element.y / 100) * canvasHeight);
    ctx.translate(state.translateX * scale, state.translateY * scale);
    ctx.rotate((element.rotation * Math.PI) / 180);
    ctx.scale(state.scale, state.scale);
    ctx.globalAlpha = element.opacity * state.opacity;
    ctx.font = `${element.fontStyle === "italic" ? "italic " : ""}${weight} ${fontSize}px ${getCanvasFontFamily(element.fontFamily)}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = element.textAlign ?? "center";
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(element.letterSpacing ?? 0) * scale}px`;

    const padding = (element.backgroundPadding ?? 0) * scale;
    const explicitBoxWidth = element.width > 0 ? (element.width / 100) * Math.min(canvasWidth, canvasHeight) : 0;
    const explicitBoxHeight = element.height > 0 ? (element.height / 100) * Math.min(canvasWidth, canvasHeight) : 0;
    const maximumTextWidth = explicitBoxWidth > 0 ? Math.max(1, explicitBoxWidth - padding * 2) : Number.POSITIVE_INFINITY;
    const wrapLine = (line: string) => {
        if (!Number.isFinite(maximumTextWidth) || ctx.measureText(line).width <= maximumTextWidth) return [line];
        const output: string[] = [];
        let current = "";
        for (const word of line.split(/\s+/)) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= maximumTextWidth) {
                current = candidate;
                continue;
            }
            if (current) output.push(current);
            if (ctx.measureText(word).width <= maximumTextWidth) {
                current = word;
                continue;
            }
            let chunk = "";
            for (const character of word) {
                if (chunk && ctx.measureText(chunk + character).width > maximumTextWidth) {
                    output.push(chunk);
                    chunk = character;
                } else {
                    chunk += character;
                }
            }
            current = chunk;
        }
        if (current || output.length === 0) output.push(current);
        return output;
    };
    const lines = state.content.split("\n").flatMap(wrapLine);
    const widths = lines.map(line => ctx.measureText(line).width);
    const blockWidth = explicitBoxWidth || Math.max(1, ...widths) + padding * 2;
    const blockHeight = explicitBoxHeight || Math.max(lineHeight, lines.length * lineHeight) + padding * 2;
    if (element.backgroundColor && (element.backgroundOpacity ?? 0) > 0) {
        ctx.save();
        ctx.fillStyle = getTextBackgroundCss(element);
        ctx.beginPath();
        ctx.roundRect(-blockWidth / 2, -blockHeight / 2, blockWidth, blockHeight, (element.backgroundRadius ?? 0) * scale);
        ctx.fill();
        ctx.restore();
    }

    if (explicitBoxWidth > 0 || explicitBoxHeight > 0) {
        ctx.beginPath();
        ctx.rect(-blockWidth / 2, -blockHeight / 2, blockWidth, blockHeight);
        ctx.clip();
    }

    ctx.fillStyle = element.color;
    ctx.strokeStyle = element.strokeColor ?? "transparent";
    ctx.lineWidth = (element.strokeWidth ?? 0) * scale;
    ctx.lineJoin = "round";
    ctx.shadowColor = element.shadowColor ?? "transparent";
    ctx.shadowBlur = (element.shadowBlur ?? 0) * scale;
    ctx.shadowOffsetX = (element.shadowOffsetX ?? 0) * scale;
    ctx.shadowOffsetY = (element.shadowOffsetY ?? 0) * scale;
    const align = element.textAlign ?? "center";
    const textX = align === "left" ? -blockWidth / 2 + padding : align === "right" ? blockWidth / 2 - padding : 0;

    lines.forEach((line, index) => {
        const y = (index - (lines.length - 1) / 2) * lineHeight;
        if ((element.strokeWidth ?? 0) > 0) ctx.strokeText(line, textX, y);
        ctx.fillText(line, textX, y);
        if (element.textDecoration && element.textDecoration !== "none") {
            const decorationY = y + (element.textDecoration === "underline" ? fontSize * 0.42 : 0);
            ctx.save();
            ctx.shadowColor = "transparent";
            ctx.strokeStyle = element.color;
            ctx.lineWidth = Math.max(1, fontSize * 0.05);
            ctx.beginPath();
            const lineStart = align === "left" ? textX : align === "right" ? textX - widths[index] : textX - widths[index] / 2;
            ctx.moveTo(lineStart, decorationY);
            ctx.lineTo(lineStart + widths[index], decorationY);
            ctx.stroke();
            ctx.restore();
        }
    });
    ctx.restore();
}
