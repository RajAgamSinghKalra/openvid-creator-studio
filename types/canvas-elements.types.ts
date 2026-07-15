export type CanvasElementType = "svg" | "image" | "text";

export interface CanvasElementBase {
    id: string;
    type: CanvasElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    zIndex: number;
    visible?: boolean;
    locked?: boolean;
    groupId?: string;
}

export interface SvgElement extends CanvasElementBase {
    type: "svg";
    category: string;
    svgId: string;
    color?: string;
}

export interface ImageElement extends CanvasElementBase {
    type: "image";
    category: string;
    imagePath: string;
}

export type TextAnimationType = "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale" | "pop" | "typewriter";

export interface TextAnimationConfig {
    type: TextAnimationType;
    duration: number;
    delay: number;
    intensity: number;
}

export interface TextElement extends CanvasElementBase {
    type: "text";
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: "normal" | "medium" | "bold";
    color: string;
    fontStyle?: "normal" | "italic";
    textDecoration?: "none" | "underline" | "line-through";
    textAlign?: "left" | "center" | "right";
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: "none" | "uppercase" | "lowercase";
    strokeColor?: string;
    strokeWidth?: number;
    backgroundColor?: string;
    backgroundOpacity?: number;
    backgroundPadding?: number;
    backgroundRadius?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    startTime?: number;
    endTime?: number;
    animation?: TextAnimationConfig;
}

export type CanvasElement = SvgElement | ImageElement | TextElement;

export interface SvgCategory { id: string; title: string; items: SvgItem[]; }
export interface SvgItem { id: string; name: string; icon?: string; }
export interface ImageCategory { id: string; title: string; items: ImageItem[]; }
export interface ImageItem { id: string; name: string; imagePath: string; previewPath?: string; }

export interface ElementsMenuProps {
    onAddElement: (element: CanvasElement) => void;
    selectedElement?: CanvasElement | null;
    onUpdateElement?: (id: string, updates: Partial<CanvasElement>) => void;
    onDeleteElement?: (id: string) => void;
    onBringToFront?: (id: string) => void;
    onSendToBack?: (id: string) => void;
}

export const PRESET_COLORS = ["#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF"];

export const TEXT_PRESETS = [
    { label: "Title", fontSize: 72, weight: "bold", sample: "BIG TITLE" },
    { label: "Subtitle", fontSize: 42, weight: "medium", sample: "Subtitle" },
    { label: "Body", fontSize: 28, weight: "normal", sample: "Body text" },
    { label: "Caption", fontSize: 20, weight: "medium", sample: "Caption" },
] as const;

export const FONT_FAMILIES = ["Inter", "Roboto", "Poppins", "Montserrat", "DM Sans", "Arial", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana", "Courier New", "Impact"];

export interface TextTemplate { id: string; name: string; description: string; preview: string; style: Partial<TextElement>; }

export const TEXT_TEMPLATES: TextTemplate[] = [
    { id: "clean-title", name: "Clean title", description: "Bold centered opener", preview: "CREATE MORE", style: { content: "CREATE MORE", fontSize: 76, fontFamily: "Inter", fontWeight: "bold", letterSpacing: -2, textAlign: "center", animation: { type: "scale", duration: 0.55, delay: 0, intensity: 30 } } },
    { id: "lower-third", name: "Lower third", description: "Name or speaker label", preview: "YOUR NAME", style: { content: "YOUR NAME\nCreative director", x: 28, y: 82, fontSize: 36, fontFamily: "DM Sans", fontWeight: "bold", textAlign: "left", lineHeight: 1.15, backgroundColor: "#111827", backgroundOpacity: 0.88, backgroundPadding: 18, backgroundRadius: 14, animation: { type: "slide-left", duration: 0.5, delay: 0, intensity: 80 } } },
    { id: "subtitle", name: "Subtitle", description: "Readable video caption", preview: "Readable captions", style: { content: "Readable captions", y: 84, fontSize: 34, fontFamily: "Inter", fontWeight: "medium", textAlign: "center", backgroundColor: "#000000", backgroundOpacity: 0.72, backgroundPadding: 12, backgroundRadius: 8, animation: { type: "fade", duration: 0.25, delay: 0, intensity: 20 } } },
    { id: "neon", name: "Neon glow", description: "Bright promotional title", preview: "NIGHT MODE", style: { content: "NIGHT MODE", fontSize: 68, fontFamily: "Montserrat", fontWeight: "bold", color: "#67E8F9", strokeColor: "#0E7490", strokeWidth: 2, shadowColor: "#22D3EE", shadowBlur: 28, letterSpacing: 4, animation: { type: "pop", duration: 0.65, delay: 0, intensity: 35 } } },
    { id: "impact", name: "Impact", description: "High-contrast statement", preview: "MAKE IT BOLD", style: { content: "MAKE IT BOLD", fontSize: 82, fontFamily: "Impact", fontWeight: "bold", color: "#FDE047", strokeColor: "#000000", strokeWidth: 5, textTransform: "uppercase", animation: { type: "slide-up", duration: 0.45, delay: 0, intensity: 70 } } },
    { id: "minimal", name: "Minimal", description: "Elegant spaced heading", preview: "NEW COLLECTION", style: { content: "NEW COLLECTION", fontSize: 38, fontFamily: "Poppins", fontWeight: "medium", letterSpacing: 9, animation: { type: "fade", duration: 0.8, delay: 0, intensity: 20 } } },
    { id: "typewriter", name: "Typewriter", description: "Character-by-character reveal", preview: "Launching now...", style: { content: "Launching now...", fontSize: 44, fontFamily: "Courier New", fontWeight: "bold", textAlign: "left", animation: { type: "typewriter", duration: 1.6, delay: 0, intensity: 20 } } },
    { id: "social-pop", name: "Social pop", description: "Rounded social caption", preview: "Wait for it!", style: { content: "Wait for it!", fontSize: 48, fontFamily: "Poppins", fontWeight: "bold", color: "#111827", backgroundColor: "#F9A8D4", backgroundOpacity: 1, backgroundPadding: 18, backgroundRadius: 24, animation: { type: "pop", duration: 0.5, delay: 0, intensity: 45 } } },
];

export const FONT_WEIGHTS = [
    { key: "normal", label: "Regular" },
    { key: "medium", label: "Medium" },
    { key: "bold", label: "Bold" },
] as const;

export interface UploadedImage { id: string; name: string; dataUrl: string; uploadedAt: number; }

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
