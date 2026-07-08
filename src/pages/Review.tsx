import { AppLayout } from "@/components/layout/AppLayout";
import { BriefReview } from "@/components/brief/BriefReview";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectStore } from "@/store/projectStore";
import { Loader2 } from "lucide-react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  StatusChip,
} from "@/components/shell";
import type { ParsedBrief } from "@/types/brief";

function formatBudget(budget: ParsedBrief["budget"] | undefined): string | null {
  if (!budget) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  if (budget.perShow) return `${fmt(budget.perShow)} / show`;
  if (budget.range) return `${fmt(budget.range.min)}–${fmt(budget.range.max)}`;
  return null;
}

// ─── From-the-Brief Rail ─────────────────────────────────────────────────────
// Read-only reference truth for the Review step, sourced entirely from the
// already-parsed brief in the project store. Venue is the one fact renders
// can't fake — it gets the pink MISSING treatment when absent.

function FromTheBriefRail({ brief }: { brief: ParsedBrief | null }) {
  const personality = brief?.brand?.personality?.slice(0, 3).join(" · ") || null;
  const primaryFootprint =
    brief?.spatial?.footprints?.find((f) => f.priority === "primary") ??
    brief?.spatial?.footprints?.[0];
  const budget = formatBudget(brief?.budget);
  const primaryShow = brief?.events?.shows?.[0];
  const venue = primaryShow
    ? [primaryShow.name, primaryShow.location].filter(Boolean).join(" — ")
    : null;

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Sourced from the parsed brief — edit any fact on the sheet and it updates here.
        </p>
      }
    >
      <RailTitle label="From the brief" hint="What the AI extracted — the reference truth." />

      <RailSection label="Brand" accent="sky">
        <RailRow label="Name" value={brief?.brand?.name} />
        <RailRow label="Personality" value={personality} />
        <RailRow label="Category" value={brief?.brand?.category} />
      </RailSection>

      <RailSection label="Objectives" accent="violet">
        {brief?.objectives?.primary ? (
          <p
            className="line-clamp-4 text-[12px] leading-[18px]"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            {brief.objectives.primary}
          </p>
        ) : (
          <RailRow label="Primary objective" />
        )}
        <RailRow
          label="Secondary objectives"
          mono
          value={
            brief?.objectives?.secondary?.length ? String(brief.objectives.secondary.length) : undefined
          }
          className="mt-1"
        />
      </RailSection>

      <RailSection label="Spatial facts" accent="pink">
        <RailRow
          label="Footprint"
          mono
          value={
            primaryFootprint
              ? `${primaryFootprint.size}${primaryFootprint.sqft ? ` · ${primaryFootprint.sqft} sqft` : ""}`
              : undefined
          }
        />
        <RailRow label="Budget" mono value={budget ?? undefined} />
        <RailRow
          label="Venue"
          tone={venue ? "default" : "attention"}
          value={venue ?? "MISSING"}
        />
      </RailSection>
    </InkRail>
  );
}

export default function ReviewPage() {
  const { projectId, isLoading } = useProjectSync();
  const brief = useProjectStore((s) => s.currentProject?.parsedBrief ?? null);

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
            title="Review"
            subtitle="Confirm what the AI extracted before generating concepts"
            headerRight={
              brief ? (
                <StatusChip variant="pass">Brief parsed</StatusChip>
              ) : (
                <StatusChip variant="neutral">Not parsed</StatusChip>
              )
            }
          >
            <BriefReview projectId={projectId} />
          </WorkSheet>

          <FromTheBriefRail brief={brief} />
        </div>
      </div>
    </AppLayout>
  );
}
