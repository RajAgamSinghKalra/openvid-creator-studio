"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import type { LocalVideoProjectPreview } from "@/types/local-project.types";

interface LocalProjectsDialogProps {
    open: boolean;
    projects: LocalVideoProjectPreview[];
    activeProjectId: string | null;
    loading?: boolean;
    onClose: () => void;
    onLoad: (id: string) => void;
    onDelete: (id: string) => void;
    onNew: () => void;
}

export function LocalProjectsDialog({ open, projects, activeProjectId, loading, onClose, onLoad, onDelete, onNew }: LocalProjectsDialogProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
            <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111113] shadow-2xl" onMouseDown={event => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-white">Local projects</h2>
                        <p className="mt-0.5 text-[11px] text-white/40">Stored only in this browser on this computer.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onNew} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500">
                            <Icon icon="lucide:plus" width="14" /> New project
                        </button>
                        <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close projects">
                            <Icon icon="lucide:x" width="18" />
                        </button>
                    </div>
                </div>

                <div className="min-h-48 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex h-44 items-center justify-center text-xs text-white/40"><Icon icon="lucide:loader-circle" className="mr-2 animate-spin" /> Loading projects…</div>
                    ) : projects.length === 0 ? (
                        <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
                            <Icon icon="lucide:folder-open" width="28" className="mb-2 text-white/20" />
                            <p className="text-xs text-white/55">No saved video projects yet</p>
                            <p className="mt-1 text-[10px] text-white/30">Use Save in the editor toolbar to create one.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map(project => (
                                <div key={project.id} className={`group overflow-hidden rounded-xl border bg-white/[0.03] ${activeProjectId === project.id ? "border-blue-500/70" : "border-white/10 hover:border-white/25"}`}>
                                    <button type="button" onClick={() => onLoad(project.id)} className="block w-full text-left">
                                        <div className="flex aspect-video items-center justify-center bg-black/40">
                                            {project.thumbnailDataUrl ? <Image src={project.thumbnailDataUrl} alt="" width={320} height={180} unoptimized className="size-full object-cover" /> : <Icon icon="lucide:clapperboard" width="30" className="text-white/15" />}
                                        </div>
                                        <div className="px-3 py-2.5">
                                            <div className="truncate text-xs font-medium text-white/85">{project.name}</div>
                                            <div className="mt-1 text-[10px] text-white/35">Updated {new Date(project.updatedAt).toLocaleString()}</div>
                                        </div>
                                    </button>
                                    <div className="flex items-center justify-between border-t border-white/7 px-3 py-1.5">
                                        <span className="text-[9px] text-white/25">{activeProjectId === project.id ? "Currently open" : "Local"}</span>
                                        <button type="button" onClick={() => onDelete(project.id)} className="rounded p-1 text-white/30 hover:bg-red-500/10 hover:text-red-400" aria-label={`Delete ${project.name}`}>
                                            <Icon icon="lucide:trash-2" width="13" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
