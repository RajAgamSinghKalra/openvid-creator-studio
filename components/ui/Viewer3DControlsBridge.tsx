import { EnvironmentPreset, Viewer3DControls, ViewerControls3D } from "@/lib/viewer-controls3d";
import { useEffect } from "react";

export function Viewer3DControlsBridge({
    environment,
    glow,
    onChange,
}: {
    environment: EnvironmentPreset;
    glow: number;
    onChange: (controls: Viewer3DControls) => void;
}) {
    const controls = ViewerControls3D({ defaultEnvironment: environment, defaultGlow: glow });

    useEffect(() => {
        onChange(controls);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controls.autoRotate, controls.rotationSpeed, controls.glow, controls.environment]);

    return null;
}