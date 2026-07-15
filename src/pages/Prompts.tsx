import { AppLayout } from "@/components/layout/AppLayout";
import { PromptGenerator } from "@/components/prompts/PromptGenerator";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectStore } from "@/store/projectStore";
import { useRenderStore } from "@/store/renderStore";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { useBrandLogo } from "@/hooks/useBrandLogo";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";
import { hangingApprovalKey } from "@/lib/hangingRefinement";
import { Loader2 } from "lucide-react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  StatusChip,
} from "@/components/shell";

// ─── Pre-flight Rail ─────────────────────────────────────────────────────────
// Read-only reference truth for the Render step: is everything the render
// pipeline references actually in place? Geometry reference, brand logo,
// active config, and the hanging-element approval gate — all read from the
// same stores/hooks PromptGenerator itself uses.

function PreFlightRail({ projectId }: { projectId: string | null }) {
  const parsedBrief = useProjectStore((s) => s.currentProject?.parsedBrief ?? null);
  const { activeConfig, activeConfigLabel, activeConfigKey } =
    useActiveSpatialConfig(projectId);
  const { activeLogo } = useBrandLogo(projectId);
  const { documents } = useKnowledgeDocuments({
    scope: "project",
    scopeId: projectId ?? undefined,
  });

  const heroImage = useRenderStore((s) => s.heroImage);
  const hangingApprovals = useRenderStore((s) => s.hangingApprovals);

  const hasGeometryRef = (documents ?? []).some(
    (d) => Array.isArray(d.user_tags) && d.user_tags.includes("geometry-reference"),
  );

  const hangingElements = parsedBrief?.hangingElements ?? [];
  const hangingApproved =
    !!heroImage && !!hangingApprovals[hangingApprovalKey(activeConfigKey, heroImage)];

  const totalSqft =
    typeof activeConfig?.totalSqft === "number" ? activeConfig.totalSqft : null;

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Environment · always on — every render is staged on a live show floor.
        </p>
      }
    >
      <RailTitle
        label="Pre-flight"
        hint="What the render pipeline references before it draws a pixel."
      />

      <RailSection label="References" accent="sky">
        <RailRow
          label="Geometry reference"
          tone={hasGeometryRef ? "pass" : "default"}
          value={hasGeometryRef ? "Captured" : undefined}
        />
        <RailRow
          label="Brand logo"
          tone={activeLogo ? "pass" : "attention"}
          value={activeLogo ? "Included" : "MISSING"}
        />
      </RailSection>

      <RailSection label="Configuration" accent="violet">
        <RailRow label="Active config" mono value={activeConfigLabel ?? undefined} />
        <RailRow label="Footprint" mono value={totalSqft ? `${totalSqft} sqft` : undefined} />
      </RailSection>

      <RailSection label="Hanging elements" accent="pink">
        {hangingElements.length === 0 ? (
          <RailRow label="Overhead structures" value="None" />
        ) : (
          <>
            <RailRow label="In brief" mono value={String(hangingElements.length)} />
            <RailRow
              label="Approval"
              tone={hangingApproved ? "pass" : heroImage ? "warn" : "default"}
              value={hangingApproved ? "Approved" : heroImage ? "Awaiting check" : "Pending hero"}
            />
          </>
        )}
      </RailSection>
    </InkRail>
  );
}

export default function PromptsPage() {
  const { projectId, isLoading } = useProjectSync();
  const heroImage = useRenderStore((s) => s.heroImage);
  const isGeneratingHero = useRenderStore((s) => s.isGeneratingHero);
  const isGenerating = useRenderStore((s) => s.isGenerating);

  if (isLoading) {
    return (
      <AppLayout surface="light">
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout surface="light">
      <div className="px-5 py-5 md:px-10">
        <div className="flex flex-col gap-5 lg:flex-row">
          <WorkSheet
            className="min-w-0 flex-1"
            eyebrow="Step 05 / 06"
            title="Prompts"
            subtitle="Hero first, then every view — each render carries its own prompt"
            headerRight={
              isGeneratingHero || isGenerating ? (
                <StatusChip variant="generating">Rendering</StatusChip>
              ) : heroImage ? (
                <StatusChip variant="pass">Hero rendered</StatusChip>
              ) : (
                <StatusChip variant="neutral">Awaiting hero</StatusChip>
              )
            }
          >
            <PromptGenerator />
          </WorkSheet>

          <PreFlightRail projectId={projectId} />
        </div>
      </div>
    </AppLayout>
  );
}
