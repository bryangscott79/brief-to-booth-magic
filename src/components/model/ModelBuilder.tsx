// ModelBuilder — the body of the Model step.
//
// The deliverable is a FILE, not a service: the two downloads lead the page.
//   • Blender script (.py) — real, navigable geometry with per-zone
//     collections, materials, a camera and a three-point light rig.
//   • glTF (.gltf)         — the same model, openable anywhere, no software.
//
// Everything is generated client-side from the spatial geometry, so this
// screen works offline and has no backend dependency of any kind.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, SectionLabel, SpecMono, StatusChip } from "@/components/shell";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { cn } from "@/lib/utils";
import type { BoothModelState } from "./useBoothModel";
import { HowToRun } from "./HowToRun";

/** Lines of the script shown in the collapsed preview. */
const PREVIEW_LINES = 26;

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[17px] font-medium leading-6 tracking-tight text-navy">
        {value}
      </p>
    </div>
  );
}

interface ModelBuilderProps {
  projectId: string | null;
  /** Built once by the page and shared with the reference rail. */
  model: BoothModelState;
}

export function ModelBuilder({ projectId, model }: ModelBuilderProps) {
  const { toast } = useToast();
  const { configs, activeIndex, setActiveIndex } = useActiveSpatialConfig(projectId);
  const [showFullScript, setShowFullScript] = useState(false);
  const [copied, setCopied] = useState(false);

  const preview = useMemo(() => {
    if (!model.script) return "";
    if (showFullScript) return model.script;
    return model.script.split("\n").slice(0, PREVIEW_LINES).join("\n");
  }, [model.script, showFullScript]);

  const scriptLineCount = useMemo(
    () => (model.script ? model.script.split("\n").length : 0),
    [model.script],
  );

  if (!projectId) {
    return (
      <EmptyState
        icon={Box}
        title="No project selected"
        body="Open a project to build its 3D model."
      />
    );
  }

  if (!model.geometry || !model.script) {
    return (
      <EmptyState
        icon={Box}
        title="No booth geometry yet"
        body="The model is built from the zones on the Spatial canvas. Generate a spatial strategy and lay out the footprint first."
        action={
          <Button asChild>
            <Link to={`/spatial?project=${projectId}`}>Go to Spatial</Link>
          </Button>
        }
      />
    );
  }

  const { geometry } = model;
  const unit = geometry.measurementSystem === "metric" ? "m" : "ft";

  const handleScriptDownload = () => {
    downloadText(model.scriptFilename, model.script!, "text/x-python");
    toast({
      title: "Blender script downloaded",
      description: `${model.scriptFilename} — open it in Blender's Scripting tab and press Run.`,
    });
  };

  const handleGltfDownload = () => {
    const gltf = model.buildGltf();
    if (!gltf) return;
    downloadText(model.gltfFilename, gltf, "model/gltf+json");
    toast({
      title: "glTF downloaded",
      description: `${model.gltfFilename} — opens in any 3D viewer, no Blender needed.`,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(model.script!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Use the download button instead.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-7">
      {/* ── Booth size ─────────────────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
            Booth size
          </span>
          {configs.map((config, i) => {
            const label = config.footprintSize ? String(config.footprintSize) : `Config ${i + 1}`;
            const active = i === activeIndex;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveIndex(i)}
                disabled={configs.length === 1}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[12px] font-medium transition-colors",
                  active
                    ? "bg-navy text-white"
                    : "bg-cloud text-slate hover:bg-cloud-line hover:text-navy",
                  configs.length === 1 && "cursor-default",
                )}
              >
                {active && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-grad-e" />}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── The two downloads ──────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleScriptDownload} className="gap-2">
            <FileCode2 className="h-4 w-4" strokeWidth={1.5} />
            Download Blender script (.py)
          </Button>
          <Button variant="outline" onClick={handleGltfDownload} className="gap-2">
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Download glTF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={model.rebuild}
            className="gap-1.5 text-slate hover:text-navy"
            title="Regenerate from the current spatial layout"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Rebuild
          </Button>
        </div>
        <p className="mt-2.5 text-[12px] leading-[18px] text-slate">
          Generated from the spatial canvas at{" "}
          <SpecMono className="text-[12px] text-charcoal">
            {model.generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </SpecMono>
          . Change zones on the Spatial step and hit Rebuild to pick the edits up — the script is
          deterministic, so the same layout always produces the same file.
        </p>
      </div>

      {/* ── What's in the model ────────────────────────────────────────── */}
      <section>
        <SectionLabel accent="violet">What&apos;s in the model</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 rounded-square border border-cloud-line px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Footprint" value={`${geometry.width}×${geometry.depth} ${unit}`} />
          <Stat label="Ceiling" value={`${geometry.ceilingHeightFt} ft`} />
          <Stat label="Zones" value={model.stats.zones} />
          <Stat label="Features" value={model.stats.features} />
          <Stat label="Hanging" value={model.stats.hangingElements} />
          <Stat label="Objects" value={model.stats.objects} />
        </div>
        <p className="mt-2.5 text-[12px] leading-[18px] text-slate">
          Objects are grouped into a collection per zone, named{" "}
          <SpecMono className="text-[12px]">Zone_&lt;Name&gt;_Pad</SpecMono>,{" "}
          <SpecMono className="text-[12px]">_Wall_N</SpecMono>,{" "}
          <SpecMono className="text-[12px]">_Canopy</SpecMono> and so on, with{" "}
          {model.stats.materials} named materials, a hero / front / plan camera and a three-point
          light rig. The model is authored in metres (1 ft = 0.3048 m) with the origin at the
          booth&apos;s front-left corner.
        </p>
      </section>

      {/* ── How to use this ────────────────────────────────────────────── */}
      <HowToRun scriptFilename={model.scriptFilename} />

      {/* ── Script preview ─────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel accent="sky">Script preview</SectionLabel>
          <div className="flex items-center gap-2">
            <StatusChip variant="neutral">{scriptLineCount} lines</StatusChip>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 text-slate hover:text-navy">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-pass" strokeWidth={1.5} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <pre className="mt-3 max-h-[420px] overflow-auto rounded-square border border-cloud-line bg-cloud px-4 py-3 font-mono text-[11px] leading-[17px] text-charcoal">
          {preview}
        </pre>
        {scriptLineCount > PREVIEW_LINES && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFullScript((v) => !v)}
            className="mt-1.5 gap-1.5 text-slate hover:text-navy"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showFullScript && "rotate-180")}
              strokeWidth={1.5}
            />
            {showFullScript ? "Show less" : `Show all ${scriptLineCount} lines`}
          </Button>
        )}
      </section>
    </div>
  );
}
