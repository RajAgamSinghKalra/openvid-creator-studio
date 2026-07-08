import { useControls } from "leva";
import { useEffect } from "react";

export type EnvironmentPreset = "sunset" | "dawn" | "night" | "warehouse" | "forest" | "apartment" | "studio" | "city" | "park" | "lobby";

interface ViewerControlsOptions {
    defaultEnvironment?: EnvironmentPreset;
    defaultGlow?: number;
}

const ENVIRONMENT_OPTIONS = [
    'sunset', 'dawn', 'night', 'warehouse', 'forest',
    'apartment', 'studio', 'city', 'park', 'lobby',
] as const;

 interface Viewer3DControls {
     autoRotate: boolean;
     rotationSpeed: number;
     glow: number;
     environment: EnvironmentPreset;
 }

export function ViewerControls3D({ defaultEnvironment = "studio", defaultGlow = 1.0 }: ViewerControlsOptions = {}): Viewer3DControls {
    const [controls, set] = useControls("Configuration 3D", () => ({
        autoRotate: false,
        rotationSpeed: { value: 3.5, min: 0.1, max: 10, step: 0.1 },
        glow: { value: defaultGlow, min: 0.0, max: 5.0, step: 0.1 },
        environment: {
            options: ENVIRONMENT_OPTIONS,
            value: defaultEnvironment
        }
    }));

    useEffect(() => {
        set({ environment: defaultEnvironment, glow: defaultGlow });
    }, [defaultEnvironment, defaultGlow, set]);

  return controls as Viewer3DControls;
}