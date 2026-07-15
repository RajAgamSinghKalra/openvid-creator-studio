"use client";

import { Icon } from "@iconify/react";
import { useRef } from "react";
import type { BackgroundVideoItem } from "@/types/background.types";
import type { BackgroundVideoTransform } from "@/types/background.types";

interface VideoRecentBackgroundGridProps {
    videos: BackgroundVideoItem[];
    selectedId?: string;
    transform: BackgroundVideoTransform;
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
    onUpload: (file: File) => void;
    onResetTransform: () => void;
}

export function VideoRecentBackgroundGrid({
    videos,
    selectedId,
    transform,
    onSelect,
    onRemove,
    onUpload,
    onResetTransform,
}: VideoRecentBackgroundGridProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const acceptFile = (file?: File) => {
        if (file?.type.startsWith("video/")) onUpload(file);
    };

    return (
        <div className="space-y-6">
            <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
                aria-label="Upload a background video"
            />

            <div
                className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center hover:border-white/20 transition cursor-pointer group bg-white/2"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    acceptFile(event.dataTransfer.files?.[0]);
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload or drop a background video"
            >
                <Icon icon="mdi:video-plus-outline" className="text-3xl mx-auto mb-2 text-white/50 group-hover:text-white/70" />
                <p className="text-xs text-white/60">
                    Drop a video here or <span className="text-white">browse</span>
                </p>
                <p className="mt-1 text-[10px] text-white/35">Videos loop silently and follow the timeline.</p>
            </div>

            {videos.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold mb-3 flex items-center gap-2">
                        <Icon icon="mdi:history" width="14" />
                        <span>Recent videos</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {videos.map((video) => (
                            <div
                                key={video.id}
                                onClick={() => onSelect(video.id)}
                                className={`aspect-video rounded-lg cursor-pointer hover:ring-2 ring-white/60 transition relative overflow-hidden group border border-white/10 ${
                                    selectedId === video.id ? "ring-2 ring-white" : ""
                                }`}
                                role="button"
                                aria-label={`Use ${video.name} as the background`}
                                aria-pressed={selectedId === video.id}
                            >
                                <video
                                    src={video.url}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                    onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                                    onMouseLeave={(event) => {
                                        event.currentTarget.pause();
                                        event.currentTarget.currentTime = 0;
                                    }}
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pb-1 pt-5 text-[9px] text-white/80 truncate">
                                    {video.name}
                                </div>
                                {selectedId === video.id && (
                                    <div className="absolute left-1 top-1 rounded-full bg-white p-1 text-black">
                                        <Icon icon="mdi:check" width="12" />
                                    </div>
                                )}
                                <button
                                    className="absolute top-1 right-1 z-20 p-1 rounded-md bg-black/50 text-white/70 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onRemove(video.id);
                                    }}
                                    aria-label={`Remove ${video.name}`}
                                >
                                    <Icon icon="lucide:trash-2" width="12" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedId && (
                <div className="rounded-lg border border-white/10 bg-white/3 p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] text-white/55">
                        <span>Canvas size</span>
                        <span>{Math.round(transform.width)}% × {Math.round(transform.height)}%</span>
                    </div>
                    <button
                        type="button"
                        onClick={onResetTransform}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10 hover:text-white"
                    >
                        <Icon icon="lucide:scan" width="14" />
                        Fit to canvas
                    </button>
                    <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                        Drag the background on the canvas to move it. Drag its edges or corners to resize it. Double-click to reset.
                    </p>
                </div>
            )}
        </div>
    );
}
