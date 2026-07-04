import { AspectRatio } from "./editor.types";

export interface Preview3DConfig {
  id: string;
  label: string;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  translateY: number;
  scale: number;
  perspective?: number;
}

export interface PhoneRotationOffset {
  rx: number;
  ry: number;
}

export const CSS_PHONE_PREVIEW_ROTATIONS: Record<string, PhoneRotationOffset> = {
  "front":              { rx: -30, ry: 22   },
  "top-left-angle":     { rx: -45, ry: 40   },
  "top-right-angle":    { rx: -45, ry: -15  },
  "bottom-left-angle":  { rx: -10, ry: 40   },
  "bottom-right-angle": { rx: -10, ry: -15  },
  "isometric":          { rx: -55, ry: -40  },
  "tilt-up":            { rx: -40, ry: 22   },
};

export const CSS_LAPTOP_PREVIEW_ROTATIONS: Record<string, PhoneRotationOffset> = {
  "front":              { rx: 30,  ry: -30  },
  "top-left-angle":     { rx: 50,  ry: -45  },
  "top-right-angle":    { rx: 50,  ry: 10   },
  "bottom-left-angle":  { rx: 15,  ry: -45  },
  "bottom-right-angle": { rx: 15,  ry: 10   },
  "isometric":          { rx: 60,  ry: -55  },
  "tilt-up":            { rx: 50,  ry: -30  },
};

export const THREEJS_PHONE_ROTATIONS: Record<string, PhoneRotationOffset> = {
  "front":              { rx: -58.23, ry: -29.82 },
  "top-left-angle":     { rx: -72,    ry: -55    },
  "top-right-angle":    { rx: -72,    ry: -5     },
  "bottom-left-angle":  { rx: -42,    ry: -55    },
  "bottom-right-angle": { rx: -42,    ry: -5     },
  "isometric":          { rx: -80,    ry: -70    },
  "tilt-up":            { rx: -75,    ry: -29.82 },
};

/** Three.js absolute rotation values for the laptop viewer. */
export const THREEJS_LAPTOP_ROTATIONS: Record<string, PhoneRotationOffset> = {
  "front":              { rx: 43.23,  ry: -37.82 },
  "top-left-angle":     { rx: 55,     ry: -60    },
  "top-right-angle":    { rx: 55,     ry: -15    },
  "bottom-left-angle":  { rx: 30,     ry: -60    },
  "bottom-right-angle": { rx: 30,     ry: -15    },
  "isometric":          { rx: 65,     ry: -75    },
  "tilt-up":            { rx: 60,     ry: -37.82 },
};

export const PREVIEW_CONFIGS: readonly Preview3DConfig[] = Object.freeze([
  Object.freeze({ id: "front", label: "Front", rotateX: 0, rotateY: 0, rotateZ: 0, translateY: 0, scale: 0.9, perspective: 600 }),
  Object.freeze({ id: "top-left-angle", label: "Top Left Angle", rotateX: 18, rotateY: 25, rotateZ: -15, translateY: -10, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "top-right-angle", label: "Top Right Angle", rotateX: 18, rotateY: -22, rotateZ: 15, translateY: 5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "bottom-left-angle", label: "Bottom Left Angle", rotateX: -18, rotateY: 25, rotateZ: 15, translateY: -5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "bottom-right-angle", label: "Bottom Right Angle", rotateX: -18, rotateY: -22, rotateZ: -15, translateY: -5, scale: 0.95, perspective: 500 }),
  Object.freeze({ id: "isometric", label: "Isometric", rotateX: 35, rotateY: -45, rotateZ: 10, translateY: 0, scale: 0.85, perspective: 1000 }), Object.freeze({ id: "tilt-up", label: "Tilt Up", rotateX: 15, rotateY: 0, rotateZ: 0, translateY: -2, scale: 0.88, perspective: 500 })
]);

export interface ImageMaskConfig {
  enabled: boolean;
  top?: { from: number; to?: number };
  right?: { from: number; to?: number };
  bottom?: { from: number; to?: number };
  left?: { from: number; to?: number };
  angle?: number;
  angleFrom?: number;
  angleTo?: number;
}

export const DEFAULT_MASK_CONFIG: ImageMaskConfig = {
  enabled: false,
};

export interface PhotoEditorPlaceholderProps {
  className?: string;
  canvasImageUrl?: string | null;
  staticImageUrl?: string | null;
  onSelectPreview?: (config: Preview3DConfig) => void;
  selectedPreviewId?: string;
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  customAspectRatio?: { width: number; height: number } | null;
  onCustomAspectRatioChange?: (dimensions: { width: number; height: number }) => void;
  onOpenCropper?: () => void;
  apply3DToBackground?: boolean;
  onToggle3DBackground?: (value: boolean) => void;
  imageMaskConfig?: ImageMaskConfig;
  onImageMaskConfigChange?: (config: ImageMaskConfig) => void;
  imageTransform?: Preview3DConfig;
  onReset?: () => void;
}