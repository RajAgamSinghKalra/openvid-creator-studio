"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatExportResolution, resolveExportResolution } from "@/lib/export-resolution";
import type { AspectRatio, ExportQuality } from "@/types";

interface ExportProgress {
  status: "idle" | "preparing" | "encoding" | "finalizing" | "complete" | "error";
  progress: number;
  message: string;
}

interface Dimensions {
  width: number;
  height: number;
}

interface ExportDropdownProps {
  onExport: (quality: ExportQuality) => void;
  exportProgress: ExportProgress;
  hasTransparentBackground?: boolean;
  aspectRatio?: AspectRatio;
  customDimensions?: Dimensions | null;
  sourceDimensions?: Dimensions | null;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  onCustomDimensionsChange?: (dimensions: Dimensions) => void;
}

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "auto", label: "Auto (source)" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Portrait" },
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Standard" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "custom", label: "Custom ratio" },
];

const QUALITY_HINTS: Record<ExportQuality, string> = {
  "4k": "Maximum fidelity",
  "2k": "High quality",
  "1080p": "Recommended",
  "720p": "Smaller file",
  "480p": "Draft quality",
  "gif": "Loop without audio",
  "webm-alpha": "Transparent video",
};

export function ExportDropdown({
  onExport,
  exportProgress,
  hasTransparentBackground,
  aspectRatio = "auto",
  customDimensions,
  sourceDimensions,
  onAspectRatioChange,
  onCustomDimensionsChange,
}: ExportDropdownProps) {
  const t = useTranslations("editor.export");
  const [isOpen, setIsOpen] = useState(false);
  const [editingCustomRatio, setEditingCustomRatio] = useState(false);
  const [customWidth, setCustomWidth] = useState("1920");
  const [customHeight, setCustomHeight] = useState("1080");
  const [customError, setCustomError] = useState("");

  const isExporting = exportProgress.status !== "idle"
    && exportProgress.status !== "complete"
    && exportProgress.status !== "error";
  const isTransparent = !!hasTransparentBackground;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setEditingCustomRatio(false);
      setCustomWidth(String(customDimensions?.width ?? 1920));
      setCustomHeight(String(customDimensions?.height ?? 1080));
      setCustomError("");
    }
    setIsOpen(open);
  };

  const handleExport = (quality: ExportQuality) => {
    setIsOpen(false);
    onExport(quality);
  };

  const handleAspectRatioChange = (value: string) => {
    const nextRatio = value as AspectRatio;
    if (nextRatio === "custom") {
      setEditingCustomRatio(true);
      return;
    }
    setEditingCustomRatio(false);
    setCustomError("");
    onAspectRatioChange?.(nextRatio);
  };

  const applyCustomRatio = () => {
    const width = Number.parseInt(customWidth, 10);
    const height = Number.parseInt(customHeight, 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16 || width > 8192 || height > 8192) {
      setCustomError("Enter width and height between 16 and 8192.");
      return;
    }

    onCustomDimensionsChange?.({ width, height });
    onAspectRatioChange?.("custom");
    setEditingCustomRatio(false);
    setCustomError("");
  };

  const renderQualityItem = (id: ExportQuality, isRecommended = false) => {
    const isGif = id === "gif";
    const dimensions = resolveExportResolution(id, {
      aspectRatio,
      customDimensions,
      sourceDimensions,
    });
    const resolution = formatExportResolution(dimensions);

    return (
      <button
        className={`group flex flex-col items-start gap-1.5 border-b border-white/10 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
          isGif ? "hover:bg-orange-500/5" : isTransparent ? "hover:bg-cyan-500/5" : "hover:bg-white/5"
        }`}
        onClick={() => handleExport(id)}
        disabled={editingCustomRatio}
        aria-label={`Export as ${id.toUpperCase()} at ${resolution}`}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className={`text-sm font-medium transition-colors ${
            isGif ? "text-orange-400 group-hover:text-orange-300" : "text-white group-hover:text-blue-400"
          }`}>
            {isTransparent && !isGif ? (
              <>{id.toUpperCase()} WebM · <span className="text-cyan-400 group-hover:text-cyan-300">{t("noBackground")}</span></>
            ) : (
              t(`qualities.${id}.label`)
            )}
          </span>
          {isRecommended && !isTransparent && (
            <span className="rounded-full border border-blue-500/30 px-2 py-0.5 text-[9px] font-bold tracking-tight text-blue-400">
              {t("recommended")}
            </span>
          )}
          {isGif && isTransparent && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400/80">
              {t("solidBackground")}
            </span>
          )}
        </div>
        <span className={`text-[11px] font-mono ${isGif ? "text-orange-400/70" : "text-white/50"}`}>
          {resolution} · {isTransparent ? (isGif ? t("gifNotice") : "VP9 Alpha") : QUALITY_HINTS[id]}
        </span>
      </button>
    );
  };

  const selectedRatioValue = editingCustomRatio ? "custom" : aspectRatio;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="primary"
          className="min-w-27.5 gap-2 px-3 py-2 text-sm"
          size="sm"
          disabled={isExporting}
          aria-label={t("button")}
        >
          <Icon icon="icon-park-outline:export" width="18" aria-hidden="true" />
          {t("button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-999999 w-80 overflow-hidden border-white/10 bg-[#1C1C1F] p-0 text-white shadow-2xl">
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
          <div className="border-b border-white/10 bg-white/5 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Frame ratio</span>
              <span className="text-[10px] font-mono text-blue-300">
                {aspectRatio === "custom" && customDimensions ? `${customDimensions.width}:${customDimensions.height}` : aspectRatio}
              </span>
            </div>
            <select
              value={selectedRatioValue}
              onChange={(event) => handleAspectRatioChange(event.target.value)}
              disabled={!onAspectRatioChange}
              className="h-9 w-full rounded-lg border border-white/10 bg-black px-3 text-xs text-white outline-none focus:border-blue-500/60"
              aria-label="Export frame aspect ratio"
            >
              {ASPECT_RATIO_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            {(editingCustomRatio || aspectRatio === "custom") && (
              <div className="mt-2">
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <input
                    type="number"
                    min="16"
                    max="8192"
                    value={customWidth}
                    onChange={(event) => setCustomWidth(event.target.value)}
                    className="h-8 min-w-0 rounded-md border border-white/10 bg-white/5 px-2 text-xs font-mono text-white outline-none focus:border-blue-500/60"
                    aria-label="Custom aspect ratio width"
                  />
                  <span className="text-xs text-white/40">×</span>
                  <input
                    type="number"
                    min="16"
                    max="8192"
                    value={customHeight}
                    onChange={(event) => setCustomHeight(event.target.value)}
                    className="h-8 min-w-0 rounded-md border border-white/10 bg-white/5 px-2 text-xs font-mono text-white outline-none focus:border-blue-500/60"
                    aria-label="Custom aspect ratio height"
                  />
                  <button
                    type="button"
                    onClick={applyCustomRatio}
                    className="h-8 rounded-md bg-blue-600 px-2.5 text-[10px] font-semibold text-white hover:bg-blue-500"
                  >
                    Apply
                  </button>
                </div>
                {customError && <p className="mt-1.5 text-[10px] text-red-400">{customError}</p>}
                {editingCustomRatio && !customError && <p className="mt-1.5 text-[10px] text-white/40">Apply the custom ratio before choosing an export quality.</p>}
              </div>
            )}
          </div>

          <div className="border-b border-white/10 px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">{t("title")}</span>
          </div>
          <div className="flex max-h-96 flex-col overflow-y-auto custom-scrollbar">
            {renderQualityItem("4k")}
            {renderQualityItem("2k")}
            {renderQualityItem("1080p", true)}
            {renderQualityItem("720p")}
            {renderQualityItem("480p")}
            {renderQualityItem("gif")}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
