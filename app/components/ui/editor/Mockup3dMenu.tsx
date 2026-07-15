"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@iconify/react";
import { SliderControl } from "../../../../components/ui/SliderControl";
import { HANDLE_R, ImageDeviceId, PAD_H, X_HALF, Y_HALF } from "@/types/mockup.types";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/DetailHeaderMenu";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";
import { getMockupTransformState, type MockupAnimationType, type MockupKeyframeEasing, type MockupMotionPreset, type MockupTransformKeyframe } from "@/types/mockup-animation.types";
import type { AspectRatio } from "@/types";

function PositionPad({
    x,
    y,
    onChangeX,
    onChangeY,
    onDragStart,
    backgroundUrl,
    backgroundColorCss,
}: {
    x: number;
    y: number;
    onChangeX: (v: number) => void;
    onChangeY: (v: number) => void;
    onDragStart?: () => void;
    backgroundUrl?: string | null;
    backgroundColorCss?: string | null;
}) {
    const padRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const rectCache = useRef<DOMRect | null>(null);
    const [isDraggingState, setIsDraggingState] = useState(false);

    const cx = Math.max(-X_HALF, Math.min(X_HALF, x));
    const cy = Math.max(-Y_HALF, Math.min(Y_HALF, y));
    const pctX = (cx + X_HALF) / (X_HALF * 2);
    const hy = ((cy + Y_HALF) / (Y_HALF * 2)) * PAD_H;

    const fromEvent = useCallback((e: React.PointerEvent) => {
        if (!rectCache.current) return;

        const rect = rectCache.current;
        const currentWidth = rect.width;
        const rx = Math.max(0, Math.min(currentWidth, e.clientX - rect.left));
        const ry = Math.max(0, Math.min(PAD_H, e.clientY - rect.top));

        onChangeX(Math.round((rx / currentWidth) * X_HALF * 2 - X_HALF));
        onChangeY(Math.round((ry / PAD_H) * Y_HALF * 2 - Y_HALF));
    }, [onChangeX, onChangeY]);

    const bgLayerStyle: React.CSSProperties = backgroundUrl
        ? {
            backgroundImage: `url('${backgroundUrl}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
        }
        : backgroundColorCss
            ? backgroundColorCss.startsWith("#") || backgroundColorCss.startsWith("rgb")
                ? { backgroundColor: backgroundColorCss }
                : {
                    backgroundImage: backgroundColorCss,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }
            : {};

    return (
        <div className="relative group w-full cursor-default">
            <div
                ref={padRef}
                className={`relative w-full rounded-[14px] overflow-hidden select-none border shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] transition-all duration-200 ${isDraggingState ? "border-cyan-500/40 ring-1 ring-cyan-500/20" : "border-zinc-800/50"
                    }`}
                style={{ height: PAD_H }}
                onPointerDown={(e) => {
                    dragging.current = true;
                    setIsDraggingState(true);
                    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                    if (padRef.current) {
                        rectCache.current = padRef.current.getBoundingClientRect();
                    }
                    onDragStart?.();
                    fromEvent(e);
                }}
                onPointerMove={(e) => {
                    if (dragging.current) {
                        fromEvent(e);
                    }
                }}
                onPointerUp={() => {
                    dragging.current = false;
                    setIsDraggingState(false);
                    rectCache.current = null;
                }}
            >
                <div className="absolute inset-0 pointer-events-none" style={bgLayerStyle} />
                <div className="absolute inset-0 pointer-events-none bg-black/40" />
                {isDraggingState && (
                    <div className="absolute inset-0 pointer-events-none rounded-[14px] ring-2 ring-cyan-400/30 animate-pulse" />
                )}
                <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(#a1a1aa_1px,transparent_1px)] bg-size-[14px_14px]" />
                <div
                    className="absolute top-0 bottom-0 w-px bg-linear-to-b from-transparent via-white/10 to-transparent -translate-x-1/2"
                    style={{ left: "50%" }}
                />
                <div
                    className="absolute left-0 right-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent -translate-y-1/2"
                    style={{ top: "50%" }}
                />
                <div
                    className="absolute pointer-events-none bg-white/10 transition-opacity -translate-x-1/2"
                    style={{ left: `${pctX * 100}%`, top: 0, bottom: 0, width: "1px" }}
                />
                <div
                    className="absolute pointer-events-none bg-white/10 transition-opacity -translate-y-1/2"
                    style={{ top: hy, left: 0, right: 0, height: "1px" }}
                />
                <div
                    className={`absolute bg-white border border-white/40 rounded-full shadow-[0_0_20px_4px_rgba(255,255,255,0.12),0_4px_12px_rgba(0,0,0,0.6)] mix-blend-screen flex items-center justify-center pointer-events-auto transition-transform duration-75`}
                    style={{
                        width: HANDLE_R * 3,
                        height: HANDLE_R * 3,
                        left: `${pctX * 100}%`,
                        top: hy,
                        transform: `translate(-50%, -50%) ${isDraggingState ? "scale(1.25)" : "scale(1)"}`,
                        cursor: isDraggingState ? "grabbing" : "grab",
                    }}
                />
            </div>
        </div>
    );
}

function ActiveDevicePreview({ tpl }: { tpl: ActiveDeviceTpl }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isMounted = true;

        if (isHovering) {
            const playVideo = async () => {
                try {
                    await video.play();
                } catch {
                }
            };
            if (isMounted) playVideo();
        } else {
            video.pause();
            video.currentTime = 0;
        }

        return () => {
            isMounted = false;
        };
    }, [isHovering]);

    return (
        <div
            className="relative w-full h-86 overflow-hidden squircle-element-camera border"
            style={{ borderColor: `${tpl.accentColor}44` }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <div className="absolute inset-0 bg-[#0d0d10]" />
            <div
                className="absolute inset-0 z-10 pointer-events-none"
                style={{
                    background: `linear-gradient(135deg, ${tpl.accentColor}22 0%, transparent 70%)`,
                }}
            />
            {tpl.posterUrl ? (
                <img
                    src={tpl.posterUrl}
                    alt={tpl.title}
                    draggable={false}
                    className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${isHovering ? "scale-105 opacity-0" : "scale-100 opacity-100"
                        }`}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Icon icon={tpl.icon} width="48" style={{ color: `${tpl.accentColor}cc` }} />
                </div>
            )}
            {tpl.videoUrl && (
                <video
                    ref={videoRef}
                    src={tpl.videoUrl}
                    poster={tpl.posterUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onLoadedData={() => setVideoReady(true)}
                    className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${isHovering && videoReady ? "scale-105 opacity-100" : "scale-100 opacity-0"
                        }`}
                />
            )}
            <div
                className={`absolute inset-0 z-20 bg-black/20 transition-opacity duration-300 ${isHovering ? "opacity-100" : "opacity-0"
                    }`}
            />
            <div className=" flex items-center gap-2 absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent z-30">
                <Icon icon={tpl.icon} width={14} />
                <span className="text-[11px] font-bold text-white/90 tracking-wide">{tpl.title}</span>
            </div>
            <div
                className="absolute top-2 right-2 size-5 rounded-full flex items-center justify-center z-30"
                style={{ background: tpl.accentColor }}
            >
                <Icon icon="mdi:check-bold" width={11} className="text-white" />
            </div>
        </div>
    );
}

export interface ActiveDeviceTpl {
    id: ImageDeviceId;
    title: string;
    accentColor: string;
    icon: string;
    modelUrl: string;
    posterUrl?: string;
    videoUrl?: string;
}

export interface Mockup3dMenuProps {
    activeDeviceTpl: ActiveDeviceTpl | null;
    imagePhoneDevice: string;
    isLaptop: boolean;
    imagePhoneScale: number;
    setImagePhoneScale: (v: number) => void;
    imagePhoneOpening: number;
    setImagePhoneOpening: (v: number) => void;
    imagePhoneShadow: number;
    setImagePhoneShadow: (v: number) => void;
    setImagePhoneShadowColor: (v: string) => void;
    imagePhoneX: number;
    setImagePhoneX: (v: number) => void;
    imagePhoneY: number;
    setImagePhoneY: (v: number) => void;
    setImagePhoneRotX: (v: number) => void;
    setImagePhoneRotY: (v: number) => void;
    imagePhoneRotX: number;
    imagePhoneRotY: number;
    imagePhoneRotZ: number;
    backgroundUrl?: string | null;
    backgroundColorCss?: string | null;
    onBack: () => void;
    onRemove: () => void;
    aspectRatio?: AspectRatio;
    onAspectRatioChange?: (ratio: AspectRatio) => void;
    currentTime?: number;
    videoDuration?: number;
}

export function Mockup3dMenu({
    activeDeviceTpl,
    imagePhoneDevice,
    isLaptop,
    imagePhoneScale,
    setImagePhoneScale,
    imagePhoneOpening,
    setImagePhoneOpening,
    imagePhoneShadow,
    setImagePhoneShadow,
    setImagePhoneShadowColor,
    imagePhoneX,
    setImagePhoneX,
    imagePhoneY,
    setImagePhoneY,
    setImagePhoneRotX,
    setImagePhoneRotY,
    imagePhoneRotX,
    imagePhoneRotY,
    imagePhoneRotZ,
    backgroundUrl,
    backgroundColorCss,
    onBack,
    onRemove,
    aspectRatio,
    onAspectRatioChange,
    currentTime = 0,
    videoDuration = 0,
}: Mockup3dMenuProps) {
    const t = useTranslations("mockupMenu");
    const { imagePhoneAnimation, setImagePhoneAnimation } = useMockup3dContext();
    const updateAnimation = (updates: Partial<typeof imagePhoneAnimation>) => {
        setImagePhoneAnimation(previous => ({ ...previous, ...updates }));
    };
    const sortedKeyframes = [...(imagePhoneAnimation.keyframes ?? [])].sort((a, b) => a.time - b.time);
    const currentTransform = getMockupTransformState(imagePhoneAnimation, currentTime, {
        x: imagePhoneX, y: imagePhoneY, scale: imagePhoneScale,
        rotationX: imagePhoneRotX, rotationY: imagePhoneRotY, rotationZ: imagePhoneRotZ,
    });
    const setKeyframeAtPlayhead = () => {
        const existing = sortedKeyframes.find(keyframe => Math.abs(keyframe.time - currentTime) < 0.06);
        const keyframe: MockupTransformKeyframe = {
            id: existing?.id ?? `mockup-keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            time: Math.max(0, Math.min(videoDuration || Number.POSITIVE_INFINITY, currentTime)),
            easing: existing?.easing ?? "ease-in-out",
            ...currentTransform,
        };
        updateAnimation({
            motionPreset: "none",
            keyframes: existing
                ? sortedKeyframes.map(item => item.id === existing.id ? keyframe : item)
                : [...sortedKeyframes, keyframe].sort((a, b) => a.time - b.time),
        });
    };
    const updateKeyframe = (id: string, updates: Partial<MockupTransformKeyframe>) => {
        updateAnimation({ keyframes: sortedKeyframes.map(keyframe => keyframe.id === id ? { ...keyframe, ...updates } : keyframe).sort((a, b) => a.time - b.time) });
    };
    const removeKeyframe = (id: string) => updateAnimation({ keyframes: sortedKeyframes.filter(keyframe => keyframe.id !== id) });
    const updateTransformAtPlayhead = (updates: Partial<MockupTransformKeyframe>) => {
        if (sortedKeyframes.length === 0) return false;
        const existing = sortedKeyframes.find(keyframe => Math.abs(keyframe.time - currentTime) < 0.08);
        if (existing) updateKeyframe(existing.id, updates);
        else {
            const created: MockupTransformKeyframe = {
                id: `mockup-keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                time: currentTime,
                easing: "ease-in-out",
                ...currentTransform,
                ...updates,
            };
            updateAnimation({ keyframes: [...sortedKeyframes, created].sort((a, b) => a.time - b.time) });
        }
        return true;
    };

    const handleReset = useCallback(() => {
        setImagePhoneX(0);
        setImagePhoneY(0);
        setImagePhoneScale(0.9);

        const defaultRotX = imagePhoneDevice === "laptop" ? 43.23 : -58.23;
        const defaultRotY = imagePhoneDevice === "laptop" ? -37.82 : -29.82;
        setImagePhoneRotX(defaultRotX);
        setImagePhoneRotY(defaultRotY);

        if (imagePhoneDevice === "laptop") {
            setImagePhoneOpening(1);
            setImagePhoneShadow(0.7);
        } else if (imagePhoneDevice === "double_iphone_13_pro") {
            setImagePhoneRotX(-30.23);
            setImagePhoneRotY(-60.82);
        } else if (imagePhoneDevice === "iphone-13-pro-max") {
            setImagePhoneScale(1.2);
        } else {
            setImagePhoneShadow(0.4);
        }
        setImagePhoneShadowColor("#000000");
    }, [
        imagePhoneDevice,
        setImagePhoneX,
        setImagePhoneY,
        setImagePhoneScale,
        setImagePhoneRotX,
        setImagePhoneRotY,
        setImagePhoneOpening,
        setImagePhoneShadow,
        setImagePhoneShadowColor
    ]);

    return (
        <>
            <div className="flex items-center gap-2 p-3 border-b border-white/6 shrink-0">
                <DetailPageHeader label={t("device3DTitle")} icon="mage:box-3d" onBack={onBack} />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
                {activeDeviceTpl && <ActiveDevicePreview tpl={activeDeviceTpl} />}

                <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                            <Icon icon="mdi:aspect-ratio" width="15" /> Whole frame ratio
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {(["16:9", "9:16"] as const).map((ratio) => (
                                <button
                                    key={ratio}
                                    type="button"
                                    onClick={() => onAspectRatioChange?.(ratio)}
                                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${aspectRatio === ratio ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/3 text-white/60 hover:bg-white/6"}`}
                                >
                                    <span className="text-xs font-semibold">{ratio}</span>
                                    {aspectRatio === ratio && <Icon icon="mdi:check-circle" width="16" />}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/35">Changes the background and complete export frame. The 3D device stays independently movable and resizable.</p>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                            {t("configuration")}
                        </span>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80 transition-colors"
                        >
                            <Icon icon="lucide:rotate-ccw" width="11" />
                            {t("reset")}
                        </button>
                    </div>

                    <SliderControl
                        icon="solar:scale-linear"
                        label={t("scale")}
                        value={Math.round(currentTransform.scale * 100)}
                        min={30}
                        max={300}
                        step={1}
                        onChange={(v) => {
                            if (!updateTransformAtPlayhead({ scale: v / 100 })) setImagePhoneScale(v / 100);
                        }}
                        suffix="%"
                    />
                    {isLaptop && (
                        <SliderControl
                            icon="material-symbols:laptop-chromebook-outline"
                            label={t("laptopOpening")}
                            value={Math.round(imagePhoneOpening * 100)}
                            min={0}
                            max={100}
                            step={1}
                            onChange={(v) => {
                                setImagePhoneOpening(v / 100);
                            }}
                            suffix="%"
                        />
                    )}
                    <SliderControl
                        icon="mdi:blur"
                        label={t("shadow")}
                        value={Math.round(imagePhoneShadow * 100)}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => {
                            setImagePhoneShadow(v / 100);
                        }}
                        suffix="%"
                    />

                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-white/60 font-medium">{t("position")}</span>
                        <PositionPad
                            x={currentTransform.x}
                            y={currentTransform.y}
                            onChangeX={(x) => { if (!updateTransformAtPlayhead({ x })) setImagePhoneX(x); }}
                            onChangeY={(y) => { if (!updateTransformAtPlayhead({ y })) setImagePhoneY(y); }}
                            backgroundUrl={backgroundUrl}
                            backgroundColorCss={backgroundColorCss}
                        />
                    </div>

                    <div className="border-t border-white/8 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">3D motion presets</span>
                            {(imagePhoneAnimation.motionPreset ?? "none") !== "none" && <span className="text-[9px] text-cyan-300">Live motion</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                            {([
                                ["none", "None", "mdi:cancel"],
                                ["turntable", "3D rotate", "mdi:rotate-3d-variant"],
                                ["float", "Float", "mdi:arrow-up-down"],
                                ["orbit", "Orbit", "mdi:orbit"],
                                ["showcase", "Showcase", "mdi:creation"],
                                ["wobble", "Wobble", "mdi:motion"],
                            ] as Array<[MockupMotionPreset, string, string]>).map(([preset, label, icon]) => (
                                <button key={preset} type="button" onClick={() => updateAnimation({ motionPreset: preset })} className={`min-h-14 px-2 py-2 rounded-lg border flex flex-col items-center justify-center gap-1 text-[9px] ${imagePhoneAnimation.motionPreset === preset || (!imagePhoneAnimation.motionPreset && preset === "none") ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200" : "bg-white/3 border-white/8 text-white/45 hover:bg-white/6"}`}>
                                    <Icon icon={icon} width="16" /> {label}
                                </button>
                            ))}
                        </div>
                        <SliderControl icon="mdi:signal" label="3D motion amount" value={imagePhoneAnimation.motionIntensity ?? 60} min={5} max={150} step={1} onChange={(motionIntensity) => updateAnimation({ motionIntensity })} suffix="%" />
                        <SliderControl icon="mdi:speedometer" label="3D motion speed" value={Math.round((imagePhoneAnimation.motionSpeed ?? 1) * 100)} min={10} max={300} step={5} onChange={(value) => updateAnimation({ motionSpeed: value / 100 })} suffix="%" />
                    </div>

                    <div className="border-t border-white/8 pt-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Transform keyframes</div>
                                <div className="mt-0.5 text-[9px] text-white/30">Position, 3D rotation, and scale</div>
                            </div>
                            <button type="button" onClick={setKeyframeAtPlayhead} className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20">
                                <Icon icon="mdi:rhombus" width="13" className="inline mr-1" /> Set at {currentTime.toFixed(2)}s
                            </button>
                        </div>
                        {sortedKeyframes.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-[10px] leading-relaxed text-white/35">Move the playhead, press Set, then adjust the phone. Repeat at another time to create a custom animation.</p>
                        ) : (
                            <div className="space-y-2">
                                {sortedKeyframes.map((keyframe, index) => (
                                    <div key={keyframe.id} className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-2.5 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Icon icon="mdi:rhombus" width="13" className="text-amber-300" />
                                            <span className="text-[10px] font-semibold text-amber-100">Keyframe {index + 1}</span>
                                            <input aria-label="Keyframe time" type="number" min={0} max={videoDuration || undefined} step={0.01} value={Number(keyframe.time.toFixed(2))} onChange={(event) => updateKeyframe(keyframe.id, { time: Math.max(0, Number(event.target.value)) })} className="ml-auto w-16 rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[10px] text-white outline-none" />
                                            <button type="button" aria-label="Delete keyframe" onClick={() => removeKeyframe(keyframe.id)} className="text-white/35 hover:text-red-300"><Icon icon="lucide:trash-2" width="13" /></button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {([
                                                ["x", "X"], ["y", "Y"], ["scale", "Scale"],
                                                ["rotationX", "Rot X"], ["rotationY", "Rot Y"], ["rotationZ", "Rot Z"],
                                            ] as Array<["x" | "y" | "scale" | "rotationX" | "rotationY" | "rotationZ", string]>).map(([field, label]) => (
                                                <label key={field} className="text-[8px] uppercase text-white/35">{label}<input type="number" step={field === "scale" ? 0.05 : 1} value={Number(keyframe[field].toFixed(2))} onChange={(event) => updateKeyframe(keyframe.id, { [field]: Number(event.target.value) })} className="mt-0.5 w-full rounded-md border border-white/8 bg-black/20 px-1.5 py-1.5 text-[10px] normal-case text-white outline-none" /></label>
                                            ))}
                                        </div>
                                        <select aria-label="Keyframe easing" value={keyframe.easing} onChange={(event) => updateKeyframe(keyframe.id, { easing: event.target.value as MockupKeyframeEasing })} className="w-full rounded-md border border-white/8 bg-[#111116] px-2 py-1.5 text-[10px] text-white/65 outline-none">
                                            <option value="linear">Linear</option><option value="ease-in-out">Ease in/out</option><option value="ease-out">Ease out</option>
                                        </select>
                                    </div>
                                ))}
                                <button type="button" onClick={() => updateAnimation({ keyframes: [] })} className="w-full text-[10px] text-white/35 hover:text-red-300">Clear all keyframes</button>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-white/8 pt-4 space-y-3">
                        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Timeline animation</span>
                        <div className="grid grid-cols-3 gap-1.5">
                            {(["none", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "scale", "pop"] as MockupAnimationType[]).map(type => (
                                <button key={type} type="button" onClick={() => updateAnimation({ type })} className={`min-h-9 px-2 squircle-element border text-[9px] capitalize ${imagePhoneAnimation.type === type ? "bg-violet-500/20 border-violet-400/40 text-violet-300" : "bg-white/3 border-white/8 text-white/45"}`}>
                                    {type.replace("-", " ")}
                                </button>
                            ))}
                        </div>
                        <SliderControl icon="mdi:timer-outline" label="Entrance duration" value={Math.round(imagePhoneAnimation.duration * 100)} min={10} max={500} step={5} onChange={(value) => updateAnimation({ duration: value / 100 })} suffix=" ×0.01s" />
                        <SliderControl icon="mdi:timer-sand" label="Entrance delay" value={Math.round(imagePhoneAnimation.delay * 100)} min={0} max={1000} step={5} onChange={(value) => updateAnimation({ delay: value / 100 })} suffix=" ×0.01s" />
                        <SliderControl icon="mdi:motion" label="Motion amount" value={imagePhoneAnimation.intensity} min={10} max={300} step={1} onChange={(intensity) => updateAnimation({ intensity })} />
                        <div className="grid grid-cols-2 gap-2">
                            <label className="text-[9px] uppercase tracking-wider text-white/40">Start (sec)<input type="number" min={0} step={0.1} value={imagePhoneAnimation.startTime} onChange={(event) => updateAnimation({ startTime: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded-lg border border-white/8 bg-white/4 px-2 py-2 text-xs text-white outline-none" /></label>
                            <label className="text-[9px] uppercase tracking-wider text-white/40">End (0 = full)<input type="number" min={0} step={0.1} value={imagePhoneAnimation.endTime} onChange={(event) => updateAnimation({ endTime: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded-lg border border-white/8 bg-white/4 px-2 py-2 text-xs text-white outline-none" /></label>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/30">Drag or resize the purple Mockup clip in the timeline for normal editor-style timing.</p>
                    </div>
                </div>

                <Button onClick={onRemove} variant="outline" className="w-full text-xs mt-2">
                    <Icon icon="ph:trash-bold" width="13" aria-hidden="true" />
                    {t("removeFrame")}
                </Button>
            </div>
        </>
    );
}
