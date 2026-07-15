interface LabelSidebarProps {
    audioTracksCount?: number;
    mockupActive?: boolean;
    textLabels?: string[];
    scrollTop?: number;
    contentHeight?: number;
}

export default function LabelSidebar({ audioTracksCount = 0, mockupActive = false, textLabels = [], scrollTop = 0, contentHeight }: LabelSidebarProps) {
    return (
        <div className="absolute left-0 top-0 bottom-0 w-14 shrink-0 overflow-hidden border-r border-white/5 bg-[#0D0D11] z-30">
          <div className="flex flex-col" style={{ height: contentHeight, transform: `translateY(-${scrollTop}px)` }}>
            <div className="h-[22px] shrink-0 border-b border-white/5" />

            <div className="h-12 shrink-0 flex items-center px-3">
                <span className="text-[9px] uppercase font-semibold tracking-wider text-zinc-500">Video</span>
            </div>

            <div className="h-12 shrink-0 flex items-center px-3 border-t border-white/5">
                <span className="text-[9px] uppercase font-semibold tracking-wider text-zinc-500">Zoom</span>
            </div>

            {textLabels.map((label, index) => (
                <div key={`${label}-${index}`} className="h-8 shrink-0 flex items-center px-2 border-t border-white/5 bg-cyan-500/3" title={label}>
                    <span className="truncate text-[9px] uppercase font-semibold tracking-wider text-cyan-400/75">Text</span>
                </div>
            ))}

            {mockupActive && (
                <div className="h-8 flex items-center px-3 border-t border-white/5 bg-violet-500/3">
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-violet-400/70">Mockup</span>
                </div>
            )}

            {audioTracksCount > 0 && (
                <div className="h-5 flex items-center px-3 border-t border-white/5 bg-white/1">
                    <span className="text-[9px] uppercase font-semibold tracking-wider text-zinc-500">Audio</span>
                </div>
            )}
          </div>
        </div>

    );
}
