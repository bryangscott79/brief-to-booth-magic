import { AppLayout } from "@/components/layout/AppLayout";
import { SpatialPlanner } from "@/components/spatial/SpatialPlanner";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import {
  calculateBoothDimensions,
  normalizeZones,
  validateSpatialLayout,
} from "@/lib/spatialUtils";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  SpecMono,
} from "@/components/shell";

// ─── Zone Program Rail ───────────────────────────────────────────────────────
// Read-only reference truth for the Spatial step: the active config's zone
// program (sqft + %) and its validation summary. Computed with the exact same
// pure utilities the planner itself uses (normalizeZones +
// validateSpatialLayout), so the rail always agrees with the canvas.

function ZoneProgramRail({ projectId }: { projectId: string | null }) {
  const { activeConfig, activeConfigLabel } = useActiveSpatialConfig(projectId);

  const { zones, validation, totalSqft } = useMemo(() => {
    const footprint = activeConfig?.footprintSize ? String(activeConfig.footprintSize) : null;
    if (!footprint || !Array.isArray(activeConfig?.zones) || activeConfig.zones.length === 0) {
      return { zones: [], validation: null, totalSqft: null as number | null };
    }
    const dims = calculateBoothDimensions(footprint);
    const normalized = normalizeZones(activeConfig.zones, dims.totalSqft);
    return {
      zones: normalized,
      validation: validateSpatialLayout(normalized, dims.totalSqft),
      totalSqft: dims.totalSqft,
    };
  }, [activeConfig]);

  const errorCount = validation?.errors.length ?? 0;
  const warningCount = validation?.warnings.length ?? 0;

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Geometry is ground truth — renders follow the canvas, not the prose.
        </p>
      }
    >
      <RailTitle
        label="Zone program"
        hint={
          activeConfigLabel
            ? `Active config ${activeConfigLabel}${totalSqft ? ` · ${totalSqft} sqft` : ""}`
            : "No footprint config yet — generate spatial strategy first."
        }
      />

      <RailSection label="Zones" accent="sky">
        {zones.length > 0 ? (
          zones.map((z) => (
            <RailRow
              key={z.id ?? z.name}
              label={z.name}
              mono
              value={`${Math.round(z.sqft)} sqft · ${Math.round(z.percentage)}%`}
            />
          ))
        ) : (
          <RailRow label="Zones" />
        )}
      </RailSection>

      <RailSection label="Validation" accent="pink">
        {validation ? (
          validation.valid && warningCount === 0 ? (
            <RailRow
              label="Layout"
              tone="pass"
              value={`Validated · ${validation.totalPercentage}%`}
              mono
            />
          ) : (
            <>
              <RailRow
                label="Errors"
                mono
                tone={errorCount > 0 ? "attention" : "pass"}
                value={String(errorCount)}
              />
              <RailRow
                label="Warnings"
                mono
                tone={warningCount > 0 ? "warn" : "default"}
                value={String(warningCount)}
              />
              <RailRow label="Allocated" mono value={`${validation.totalPercentage}%`} />
            </>
          )
        ) : (
          <RailRow label="Layout" />
        )}
      </RailSection>
    </InkRail>
  );
}

export default function SpatialPage() {
  const { projectId, isLoading } = useProjectSync();
  const { activeConfigLabel } = useActiveSpatialConfig(projectId);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
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
            eyebrow="Step 04 / 06"
            title="Spatial"
            subtitle="Zone the footprint — the canvas geometry drives every render"
            headerRight={
              activeConfigLabel ? <SpecMono className="text-slate">{activeConfigLabel}</SpecMono> : null
            }
          >
            <SpatialPlanner />
          </WorkSheet>

          <ZoneProgramRail projectId={projectId} />
        </div>
      </div>
    </AppLayout>
  );
}
