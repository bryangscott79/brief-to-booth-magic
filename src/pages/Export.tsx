import { AppLayout } from "@/components/layout/AppLayout";
import { ExportPackage } from "@/components/export/ExportPackage";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectStore } from "@/store/projectStore";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useClient } from "@/hooks/useClients";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  SpecMono,
} from "@/components/shell";

const MISSING_PINK = "#F472B6";

function MissingLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="font-semibold underline-offset-2 hover:underline"
      style={{ color: MISSING_PINK }}
    >
      MISSING
    </Link>
  );
}

// ─── Package Rail ────────────────────────────────────────────────────────────
// Read-only pre-flight for the Export step: are the logos the package pulls
// actually on file, how complete is the concept, and how many renders ship.
// All read from data already loaded on this page.

function PackageRail({ projectId }: { projectId: string | null }) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const clientId = currentProject?.clientId ?? null;
  const { profile } = useCompanyProfile();
  const { data: client } = useClient(clientId);
  const { data: images } = useProjectImages(projectId);
  const { activeConfigLabel } = useActiveSpatialConfig(projectId);

  const elements = currentProject?.elements;
  const completedCount = elements
    ? Object.values(elements).filter((e) => e.status === "complete").length
    : 0;
  const totalCount = elements ? Object.keys(elements).length : 8;
  const renderCount = (images ?? []).filter((img) => img.is_current).length;

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Proposals and decks pull logos from the agency profile and the client record.
        </p>
      }
    >
      <RailTitle label="Pre-flight · Package" hint="What ships in the hand-off, checked before export." />

      <RailSection label="Logos" accent="sky">
        <RailRow
          label="Agency logo"
          tone={profile?.logo_url ? "pass" : "default"}
          value={profile?.logo_url ? "On file" : <MissingLink to="/company" />}
        />
        <RailRow
          label="Client logo"
          tone={client?.logo_url ? "pass" : "default"}
          value={
            client?.logo_url ? (
              "On file"
            ) : clientId ? (
              <MissingLink to={`/clients/${clientId}`} />
            ) : undefined
          }
        />
      </RailSection>

      <RailSection label="Completeness" accent="violet">
        <RailRow
          label="Active booth size"
          mono
          tone={activeConfigLabel ? "pass" : "default"}
          value={activeConfigLabel ?? undefined}
        />
        <RailRow
          label="Concept elements"
          mono
          tone={completedCount === totalCount && totalCount > 0 ? "pass" : "default"}
          value={elements ? `${completedCount}/${totalCount}` : undefined}
        />
        <RailRow
          label="Renders"
          mono
          tone={renderCount > 0 ? "pass" : "default"}
          value={images ? String(renderCount) : undefined}
        />
      </RailSection>
    </InkRail>
  );
}

export default function ExportPage() {
  const { projectId, isLoading } = useProjectSync();
  const { data: images } = useProjectImages(projectId);
  const { activeConfigLabel } = useActiveSpatialConfig(projectId);
  // Total current renders across all booth sizes — this matches what the
  // asset ZIP actually contains (organized per size inside renders/).
  const renderCount = (images ?? []).filter((img) => img.is_current).length;

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
            eyebrow="Step 06 / 06"
            title="Export"
            subtitle="Package renders, strategy, and specs for hand-off"
            headerRight={
              <SpecMono className="text-slate">
                {activeConfigLabel ? `${activeConfigLabel} · ` : ""}
                {renderCount} {renderCount === 1 ? "render" : "renders"}
              </SpecMono>
            }
          >
            <ExportPackage />
          </WorkSheet>

          <PackageRail projectId={projectId} />
        </div>
      </div>
    </AppLayout>
  );
}
