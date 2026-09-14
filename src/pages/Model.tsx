// Model — the Blender / 3D model step.
//
// Flow C shell: white work sheet + navy reference rail. The deliverable is a
// FILE the user runs themselves (a deterministic Blender Python program, plus
// a glTF for anyone without Blender), so this page is fully client-side —
// no edge function, no service, nothing to configure.

import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
import { Loader2 } from "lucide-react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  SpecMono,
} from "@/components/shell";
import { ModelBuilder, useBoothModel, type BoothModelState } from "@/components/model";

// ─── Model Rail ──────────────────────────────────────────────────────────────
// Read-only reference truth for the Model step: exactly what the downloaded
// files contain and the conventions they were authored with. Everything here
// is derived from the same geometry the script is built from, so the rail can
// never disagree with the file.

function ModelRail({ model }: { model: BoothModelState }) {
  const geometry = model.geometry;
  const unit = geometry?.measurementSystem === "metric" ? "m" : "ft";

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Geometry is ground truth — the model is generated from the canvas, never hand-modelled.
        </p>
      }
    >
      <RailTitle
        label="Model output"
        hint={
          geometry
            ? "Two files, both built from the spatial canvas."
            : "Zone the footprint on the Spatial step to unlock the model."
        }
      />

      <RailSection label="Booth" accent="sky">
        <RailRow
          label="Footprint"
          mono
          value={geometry ? `${geometry.width} × ${geometry.depth} ${unit}` : undefined}
        />
        <RailRow
          label="Ceiling"
          mono
          value={geometry ? `${geometry.ceilingHeightFt} ft` : undefined}
        />
        <RailRow label="Booth size" mono value={model.configLabel ?? undefined} />
      </RailSection>

      <RailSection label="Contents" accent="violet">
        <RailRow label="Zones" mono tone={model.stats.zones > 0 ? "pass" : "default"} value={geometry ? model.stats.zones : undefined} />
        <RailRow label="Features" mono value={geometry ? model.stats.features : undefined} />
        <RailRow label="Hanging elements" mono value={geometry ? model.stats.hangingElements : undefined} />
        <RailRow label="Objects" mono value={geometry ? model.stats.objects : undefined} />
        <RailRow label="Materials" mono value={geometry ? model.stats.materials : undefined} />
      </RailSection>

      <RailSection label="Conventions" accent="pink">
        <RailRow label="Units" mono value="metres (1 ft = 0.3048 m)" />
        <RailRow label="Origin" value="Front-left corner, floor level" />
        <RailRow label="Axes" mono value="+X width · +Y depth · +Z up" />
        <RailRow label="Re-run" value="Rebuilds CANOPY_Booth in place" />
      </RailSection>
    </InkRail>
  );
}

export default function Model() {
  const { projectId, isLoading } = useProjectSync();
  const model = useBoothModel(projectId);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-5 py-5 md:px-10">
        <div className="flex flex-col gap-5 lg:flex-row">
          <WorkSheet
            className="min-w-0 flex-1"
            eyebrow="Blender model"
            title="Model"
            subtitle="Turn the spatial layout into real 3D geometry you can open and edit"
            headerRight={
              <SpecMono className="text-slate">
                {model.configLabel ? `${model.configLabel} · ` : ""}
                {model.stats.objects} {model.stats.objects === 1 ? "object" : "objects"}
              </SpecMono>
            }
          >
            <ModelBuilder projectId={projectId} model={model} />
          </WorkSheet>

          <ModelRail model={model} />
        </div>
      </div>
    </AppLayout>
  );
}
