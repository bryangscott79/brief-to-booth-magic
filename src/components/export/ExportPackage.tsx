import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  FileText,
  Folder,
  Package,
  Hammer,
  Box,
  Loader2,
  FolderArchive,
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useProjectImages, type ProjectImage } from "@/hooks/useProjectImages";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageLightbox, useImageLightbox } from "@/components/common/ImageLightbox";
import { supabase } from "@/integrations/supabase/client";
import { ProposalExport } from "./ProposalExport";
import { DesignedDeck } from "./DesignedDeck";
import { DeckStudio } from "./DeckStudio";
import { FigmaExportPanel } from "./FigmaExportPanel";
import { SaveLearningsButton } from "./SaveLearningsButton";
import { useRhinoRenders } from "@/hooks/useRhinoRenders";
import { useBrandIntelligence, useClient } from "@/hooks/useClients";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useAgency } from "@/hooks/useAgency";
import { useProject } from "@/hooks/useProjects";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { parseVersionedAngleId, sanitizeConfigKey } from "@/lib/promptVersions";
import { markProjectExported } from "@/lib/markProjectExported";

interface MaterialItem {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

interface MaterialCategory {
  name: string;
  items: MaterialItem[];
  subtotal: number;
}

interface MaterialsData {
  categories: MaterialCategory[];
  grandTotal: number;
  notes: string;
}

interface MeshyPrompt {
  viewName: string;
  prompt: string;
  styleTokens: string;
  materialHints: string;
}

interface ModelingBrief {
  overallDimensions: string;
  layerStructure: { layerName: string; color: string; contents: string }[];
  materials: { name: string; application: string; finish: string; rhinoMaterial: string }[];
  constructionNotes: string;
  scaleReference: string;
}

interface ThreeDData {
  meshyPrompts: MeshyPrompt[];
  modelingBrief: ModelingBrief;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** File-name-safe token — used for zip entry names and the zip itself. */
function sanitizeName(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9_\- ]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "file"
  );
}

/** Best-effort extension sniff from a storage URL. */
function extOf(url: string, fallback: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "png";
  if (lower.includes(".webp")) return "webp";
  if (lower.includes(".svg")) return "svg";
  if (lower.includes(".jpeg") || lower.includes(".jpg")) return "jpg";
  if (lower.includes(".pdf")) return "pdf";
  return fallback;
}

interface ZipProgress {
  done: number;
  total: number;
  current: string;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPackage() {
  const { currentProject } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  // Click-to-expand on any render thumbnail in the export page.
  const lightbox = useImageLightbox();

  const projectId = currentProject?.id;
  const { data: images } = useProjectImages(projectId);
  const { data: rhinoRenders = [] } = useRhinoRenders(projectId);
  // DB row (brief_file_url/name, status) — same query useProjectSync warms.
  const { data: dbProject } = useProject(projectId ?? undefined);
  const queryClient = useQueryClient();

  const clientId = currentProject?.clientId ?? null;
  const { data: client } = useClient(clientId);
  const { data: brandIntelligence = [] } = useBrandIntelligence(clientId);
  const approvedIntel = brandIntelligence.filter((e: any) => e.is_approved);
  const { profile } = useCompanyProfile();
  const { agency } = useAgency();
  const agencyId = agency?.id ?? null;
  const activationTypeId = (currentProject as any)?.activation_type_id ?? (currentProject as any)?.activationTypeId ?? null;

  // Active booth size (footprint config) — same shared selection the
  // Spatial and Prompts steps use, so the export reflects the size the
  // user is actually working in instead of hardcoding configs[0].
  const {
    configs: spatialConfigs,
    activeConfig,
    activeConfigKey,
    activeConfigLabel,
    defaultConfigKey,
  } = useActiveSpatialConfig(projectId ?? null);

  const [materials, setMaterials] = useState<MaterialsData | null>(null);
  const [threeDData, setThreeDData] = useState<ThreeDData | null>(null);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loading3D, setLoading3D] = useState(false);
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null);
  const [zipSkipped, setZipSkipped] = useState<string[]>([]);

  const brief = currentProject?.parsedBrief;
  const elements = currentProject?.elements;

  if (!brief || !elements) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No project data to export</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/upload")}>
          Start a New Project
        </Button>
      </div>
    );
  }

  const completedElements = Object.values(elements).filter(e => e.status === "complete").length;
  const totalElements = Object.keys(elements).length;

  // ── Active-config derivations ─────────────────────────────────────────
  // Spatial config is the source of truth once the Spatial step has run;
  // the brief footprint is the fallback for early projects.
  const activeBoothSize =
    activeConfigLabel || brief.spatial?.footprints?.[0]?.size || "30x30";
  const activeBoothSqft =
    (typeof activeConfig?.totalSqft === "number" ? activeConfig.totalSqft : undefined) ??
    brief.spatial?.footprints?.[0]?.sqft;

  // Which booth size does a render belong to? Mirrors the Files page rule:
  // __cfg__ suffix on angle_id first, prompt_artifacts.configKey fallback,
  // and untagged/legacy renders belong to configs[0] (the old hardcoded
  // pipeline only ever rendered the first config).
  const renderConfigKey = (img: ProjectImage): string | null => {
    const parsed = parseVersionedAngleId(img.angle_id).configKey;
    if (parsed) return parsed;
    const artifactKey =
      typeof img.prompt_artifacts?.configKey === "string" ? img.prompt_artifacts.configKey : null;
    if (artifactKey) return artifactKey;
    return defaultConfigKey;
  };

  /** Human label ("20x40") for a sanitized config key, falling back to the key. */
  const configLabelOf = (key: string | null): string | null => {
    if (!key) return null;
    const cfg = spatialConfigs.find(
      (c) => c.footprintSize && sanitizeConfigKey(String(c.footprintSize)) === key,
    );
    return cfg?.footprintSize ? String(cfg.footprintSize) : key;
  };

  const currentImages = (images || []).filter((i) => i.is_current);
  // Renders scoped to the ACTIVE booth size — used everywhere a payload or
  // stat refers to "the" booth (3D brief references, summary labels).
  const activeConfigImages = activeConfigKey
    ? currentImages.filter((img) => renderConfigKey(img) === activeConfigKey)
    : currentImages;

  const handleGenerateMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-materials", {
        body: {
          parsedBrief: brief,
          spatialStrategy: elements.spatialStrategy?.data,
          budgetLogic: elements.budgetLogic?.data,
          boothSize: activeBoothSize,
          agency_id: agencyId,
          client_id: clientId,
          activation_type_id: activationTypeId,
          project_id: projectId,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setMaterials(data.materials);
      toast({ title: "Materials list generated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleGenerate3D = async () => {
    setLoading3D(true);
    try {
      // Only reference renders of the ACTIVE booth size — a 10x10 view
      // must not steer the modeling brief for a 100x60 build.
      const imageUrls = activeConfigImages.map(i => ({
        angle: i.angle_name,
        url: i.public_url,
      }));
      const { data, error } = await supabase.functions.invoke("generate-3d-brief", {
        body: {
          parsedBrief: brief,
          spatialStrategy: elements.spatialStrategy?.data,
          renderPrompts: currentProject?.renderPrompts,
          imageUrls,
          boothSize: activeBoothSize,
          agency_id: agencyId,
          client_id: clientId,
          activation_type_id: activationTypeId,
          project_id: projectId,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setThreeDData(data.brief);
      toast({ title: "3D modeling brief generated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading3D(false);
    }
  };

  const downloadMaterialsCSV = () => {
    if (!materials) return;
    const rows = ["Category,Item,Description,Qty,Unit,Unit Cost,Total Cost"];
    for (const cat of materials.categories) {
      for (const item of cat.items) {
        rows.push(`"${cat.name}","${item.name}","${item.description}",${item.quantity},"${item.unit}",${item.unitCost},${item.totalCost}`);
      }
    }
    rows.push(`,,,,,,`);
    rows.push(`"GRAND TOTAL",,,,,,${materials.grandTotal}`);
    downloadTextFile(`${brief.brand?.name || "project"}_materials.csv`, rows.join("\n"));
  };

  const download3DBrief = () => {
    if (!threeDData) return;
    const lines: string[] = [];
    lines.push(`# 3D Modeling Brief — ${brief.brand?.name || "Project"}`);
    lines.push(`\n## Overall Dimensions\n${threeDData.modelingBrief.overallDimensions}`);
    lines.push(`\n## Scale Reference\n${threeDData.modelingBrief.scaleReference}`);
    lines.push(`\n## Layer Structure`);
    for (const l of threeDData.modelingBrief.layerStructure) {
      lines.push(`- **${l.layerName}** (${l.color}): ${l.contents}`);
    }
    lines.push(`\n## Materials Specification`);
    for (const m of threeDData.modelingBrief.materials) {
      lines.push(`- **${m.name}** — ${m.application} | Finish: ${m.finish} | Rhino Material: ${m.rhinoMaterial}`);
    }
    lines.push(`\n## Construction Notes\n${threeDData.modelingBrief.constructionNotes}`);
    lines.push(`\n---\n## Meshy.ai Prompts`);
    for (const p of threeDData.meshyPrompts) {
      lines.push(`\n### ${p.viewName}`);
      lines.push(`**Prompt:** ${p.prompt}`);
      lines.push(`**Style Tokens:** ${p.styleTokens}`);
      lines.push(`**Material Hints:** ${p.materialHints}`);
    }
    downloadTextFile(`${brief.brand?.name || "project"}_3d_brief.md`, lines.join("\n"));
  };


  const handleDownloadZip = async () => {
    setLoadingZip(true);
    setZipSkipped([]);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const brandName = brief.brand?.name || currentProject?.name || "Project";

      // ── 1. Assemble every fetchable asset up front (real progress) ──
      // Renders are organized per booth size: renders/{configKey}/{angle}_{ts}.ext
      const renderPathOf = (img: ProjectImage) => {
        const cfg = renderConfigKey(img) ?? "default";
        const ts = new Date(img.created_at).getTime();
        return `renders/${cfg}/${sanitizeName(img.angle_name)}_${ts}.${extOf(img.public_url, "jpg")}`;
      };

      interface FetchTask { label: string; url: string; path: string }
      const tasks: FetchTask[] = [];

      for (const img of currentImages) {
        tasks.push({ label: img.angle_name, url: img.public_url, path: renderPathOf(img) });
      }

      const polishedRhino = rhinoRenders.filter(
        r => r.polish_status === "complete" && r.polished_public_url,
      );
      for (const r of polishedRhino) {
        const viewName = sanitizeName(r.view_name || "untitled");
        tasks.push({
          label: `${r.view_name || "Untitled"} (original)`,
          url: r.original_public_url,
          path: `rhino-renders/${viewName}_original.jpg`,
        });
        tasks.push({
          label: `${r.view_name || "Untitled"} (polished)`,
          url: r.polished_public_url!,
          path: `rhino-renders/${viewName}_polished.jpg`,
        });
      }

      // Original brief file — brief_file_url may be an expired signed URL;
      // a failed fetch just lands in the skipped manifest.
      const briefFileName = dbProject?.brief_file_name
        ? dbProject.brief_file_name.replace(/[^a-zA-Z0-9._\- ]/g, "_")
        : dbProject?.brief_file_url
          ? `brief.${extOf(dbProject.brief_file_url, "pdf")}`
          : null;
      if (dbProject?.brief_file_url && briefFileName) {
        tasks.push({
          label: "Original brief",
          url: dbProject.brief_file_url,
          path: `brief/${briefFileName}`,
        });
      }

      // Brand logos — agency logo off the agencies row, client logo off the
      // linked client record. Both optional; both skip gracefully.
      if (agency?.logo_url) {
        tasks.push({
          label: "Agency logo",
          url: agency.logo_url,
          path: `brand/agency-logo.${extOf(agency.logo_url, "png")}`,
        });
      }
      if (client?.logo_url) {
        tasks.push({
          label: "Client logo",
          url: client.logo_url,
          path: `brand/client-logo.${extOf(client.logo_url, "png")}`,
        });
      }

      // ── 2. Fetch in parallel (concurrency 4) with a skip manifest ──
      const skipped: string[] = [];
      const fetchedByPath = new Map<string, Blob>();
      let done = 0;
      let cursor = 0;
      setZipProgress({ done: 0, total: tasks.length, current: "" });
      const worker = async () => {
        while (cursor < tasks.length) {
          const task = tasks[cursor++];
          setZipProgress({ done, total: tasks.length, current: task.label });
          try {
            const res = await fetch(task.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            fetchedByPath.set(task.path, await res.blob());
          } catch {
            skipped.push(`${task.path} — ${task.label}`);
          }
          done += 1;
          setZipProgress({ done, total: tasks.length, current: task.label });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, Math.max(tasks.length, 1)) }, worker),
      );
      // Keep zip entry order stable (task order), whatever finished first.
      for (const task of tasks) {
        const blob = fetchedByPath.get(task.path);
        if (blob) zip.file(task.path, blob);
      }

      // ── 3. Build structured content markdown ──
      let content = `# ${brandName} — Trade Show Booth Proposal\n\n---\n\n`;

      const brand = (brief as any).brand || {};
      content += `## Brand Overview\n`;
      content += `- **Name:** ${brand.name || "N/A"}\n`;
      content += `- **Category:** ${brand.category || "N/A"}\n`;
      content += `- **POV:** ${brand.pov || "N/A"}\n`;
      content += `- **Personality:** ${(brand.personality || []).join(", ")}\n`;
      content += `- **Colors:** ${(brand.visualIdentity?.colors || []).join(", ")}\n\n`;

      const obj = (brief as any).objectives || {};
      content += `## Objectives\n`;
      content += `- **Primary:** ${obj.primary || "N/A"}\n`;
      content += `- **Secondary:** ${(obj.secondary || []).join("; ")}\n`;
      content += `- **Differentiation:** ${(obj.differentiationGoals || []).join("; ")}\n\n`;

      const audiences = brief.audiences || [];
      if (audiences.length) {
        content += `## Target Audiences\n`;
        for (const a of audiences) content += `- **${a.name}** (${a.priority}): ${a.description}\n`;
        content += `\n`;
      }

      const shows = brief.events?.shows || [];
      if (shows.length) {
        content += `## Events\n`;
        for (const s of shows) content += `- ${s.name} — ${s.location}\n`;
        content += `\n`;
      }

      content += `## Spatial\n- **Active Booth Size:** ${activeBoothSize}${activeBoothSqft ? ` (${activeBoothSqft} sqft)` : ""}\n`;
      if (spatialConfigs.length > 1) {
        content += `- **All Configurations:** ${spatialConfigs
          .map((c) => c.footprintSize)
          .filter(Boolean)
          .join(", ")}\n`;
      }
      content += `\n`;

      const budget = (brief as any).budget || {};
      content += `## Budget\n- ${budget.perShow ? `$${budget.perShow.toLocaleString()} per show` : budget.range ? `$${budget.range.min.toLocaleString()} - $${budget.range.max.toLocaleString()}` : "TBD"}\n\n`;

      content += `---\n\n# Strategic Elements\n\n`;
      const elementKeys = [
        { key: "bigIdea", label: "Big Idea" },
        { key: "experienceFramework", label: "Experience Framework" },
        { key: "interactiveMechanics", label: "Interactive Mechanics" },
        { key: "digitalStorytelling", label: "Digital Storytelling" },
        { key: "humanConnection", label: "Human Connection" },
        { key: "adjacentActivations", label: "Adjacent Activations" },
        { key: "spatialStrategy", label: "Spatial Strategy" },
        { key: "budgetLogic", label: "Budget Logic" },
      ];
      for (const { key, label } of elementKeys) {
        const el = (elements as any)[key];
        if (el?.data) {
          content += `## ${label}\n\n\`\`\`json\n${JSON.stringify(el.data, null, 2)}\n\`\`\`\n\n`;
        }
      }

      // Rhino renders (already fetched into the zip above — just document them).
      if (polishedRhino.length > 0) {
        content += `---\n\n# 3D Design Renders\n\n`;
        for (const r of polishedRhino) {
          const viewName = sanitizeName(r.view_name || "untitled");
          content += `- **${r.view_name || "Untitled"}**: rhino-renders/${viewName}_original.jpg → rhino-renders/${viewName}_polished.jpg\n`;
        }
        content += `\n`;
      }

      // Rendered views, grouped per booth size the way the zip is organized.
      content += `---\n\n# Rendered Views\n\n`;
      for (const img of currentImages) {
        const sizeLabel = configLabelOf(renderConfigKey(img));
        content += `- **${img.angle_name}**${sizeLabel ? ` (${sizeLabel})` : ""}: ${renderPathOf(img)}\n`;
      }

      // Skipped-asset manifest — visible in the package itself.
      if (skipped.length > 0) {
        content += `\n---\n\n# Skipped Assets\n\n`;
        content += `These assets could not be fetched (expired URL or network error) and are NOT in this package:\n\n`;
        for (const s of skipped) content += `- ${s}\n`;
      }

      zip.file("content.md", content);

      // ── 3. JSON version for structured import ──
      const jsonData = {
        project: brandName,
        activeBoothSize,
        activeConfigKey,
        brand: brief.brand,
        objectives: brief.objectives,
        audiences: brief.audiences,
        events: brief.events,
        spatial: brief.spatial,
        budget: brief.budget,
        elements: Object.fromEntries(
          elementKeys.filter(({ key }) => (elements as any)[key]?.data).map(({ key, label }) => [key, { label, data: (elements as any)[key].data }])
        ),
        rhinoRenders: rhinoRenders.filter(r => r.polish_status === "complete").map(r => ({
          viewName: r.view_name,
          originalUrl: r.original_public_url,
          polishedUrl: r.polished_public_url,
        })),
        images: currentImages.map(img => ({
          angleId: img.angle_id,
          angleName: img.angle_name,
          boothSize: configLabelOf(renderConfigKey(img)),
          configKey: renderConfigKey(img),
          filename: renderPathOf(img),
        })),
        skipped,
      };
      zip.file("content.json", JSON.stringify(jsonData, null, 2));

      setZipProgress({ done: tasks.length, total: tasks.length, current: "Packaging zip…" });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // {Client}_{Project}_Export.zip — client record first, brand fallback.
      const clientPart = sanitizeName(client?.name || brief.brand?.name || "Client");
      const projectPart = sanitizeName(currentProject?.name || brandName);
      a.download = `${clientPart}_${projectPart}_Export.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setZipSkipped(skipped);
      const included = tasks.length - skipped.length;
      if (skipped.length > 0) {
        toast({
          title: "Package downloaded — some assets skipped",
          description: `${included} of ${tasks.length} assets included; ${skipped.length} skipped (listed in content.md and below).`,
        });
      } else {
        toast({
          title: "Package downloaded",
          description: `${included} of ${tasks.length} assets + content.md/content.json zipped.`,
        });
      }

      // The hand-off left the building — light the final pipeline segment.
      if (projectId) await markProjectExported(projectId, queryClient);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingZip(false);
      setZipProgress(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* The sheet band owns the "Export" title — no duplicate inside. */}

      {/* Client deck — the flagship path: brand-mode choice + designed
       * slide system compiled deterministically → editable PPTX / PDF. */}
      <DeckStudio projectId={projectId ?? null} clientId={currentProject?.clientId ?? null} />

      {/* AI-designed deck — legacy alternate. Claude designs every slide as
       * HTML+CSS using the full project + agency context. */}
      <DesignedDeck
        projectId={projectId ?? null}
        parsedBrief={brief}
        elements={elements}
        projectName={currentProject?.name || brief.brand?.name || 'Project'}
        images={images || []}
        brandColor={profile?.brand_color ?? undefined}
        secondaryColor={profile?.secondary_color ?? undefined}
        agencyName={profile?.company_name || (agency as any)?.name || undefined}
      />

      {/* Classic export — pptxgenjs path with inline DeckEditor. Kept as a
       * secondary option for users who want a fast, structured export. */}
      <ProposalExport
        brief={brief}
        elements={elements}
        images={images || []}
        projectName={currentProject?.name || brief.brand?.name || 'Project'}
        rhinoRenders={rhinoRenders.map(r => ({
          id: r.id,
          view_name: r.view_name,
          original_public_url: r.original_public_url,
          polished_public_url: r.polished_public_url,
          polish_status: r.polish_status,
        }))}
        brandIntelligence={approvedIntel.map((e: any) => ({
          category: e.category,
          title: e.title,
          content: e.content,
        }))}
      />

      {/* Download All Assets ZIP */}
      <Card className="element-card border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderArchive className="h-4 w-4 text-primary" />
              Download All Assets
            </CardTitle>
            <Button size="sm" onClick={handleDownloadZip} disabled={loadingZip}>
              {loadingZip ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
              {loadingZip ? "Packaging..." : "Download .zip"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Downloads every rendered view (organized per booth size), 3D renders, the original brief, brand logos, and strategic content (Markdown + JSON) into a single .zip you can take to Google Slides, Keynote, Canva, or any presentation tool.
          </p>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Folder className="h-3 w-3" /> renders/{"{size}"}/</span>
            <span className="flex items-center gap-1"><Folder className="h-3 w-3" /> rhino-renders/</span>
            <span className="flex items-center gap-1"><Folder className="h-3 w-3" /> brief/</span>
            <span className="flex items-center gap-1"><Folder className="h-3 w-3" /> brand/</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> content.md</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> content.json</span>
          </div>
          {loadingZip && zipProgress && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate pr-2">{zipProgress.current || "Preparing…"}</span>
                <span className="font-mono shrink-0">
                  {zipProgress.done}/{zipProgress.total} assets
                </span>
              </div>
              <Progress
                value={zipProgress.total > 0 ? (zipProgress.done / zipProgress.total) * 100 : 0}
                className="h-2"
              />
            </div>
          )}
          {!loadingZip && zipSkipped.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
              <p className="text-xs font-medium text-destructive mb-1">
                {zipSkipped.length} asset{zipSkipped.length === 1 ? "" : "s"} skipped in the last package (also listed in content.md):
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                {zipSkipped.map((s) => (
                  <li key={s} className="truncate">{s}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Package Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-2xl font-semibold text-navy truncate">{brief.brand?.name || currentProject?.name}</div>
              <div className="text-sm text-slate">Project</div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold tracking-tight text-navy">{activeBoothSize}</div>
              <div className="text-sm text-slate">Active Booth Size</div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold tracking-tight text-navy">{completedElements}/{totalElements}</div>
              <div className="text-sm text-slate">Elements Complete</div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold tracking-tight text-navy">{currentImages.length}</div>
              <div className="text-sm text-slate">Rendered Views</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials List */}
      <Card className="element-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Hammer className="h-4 w-4 text-primary" />
              Materials & Cost Estimate
            </CardTitle>
            <div className="flex gap-2">
              {materials && (
                <Button variant="outline" size="sm" onClick={downloadMaterialsCSV}>
                  <Download className="mr-1 h-3 w-3" /> CSV
                </Button>
              )}
              <Button size="sm" onClick={handleGenerateMaterials} disabled={loadingMaterials}>
                {loadingMaterials ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Hammer className="mr-1 h-3 w-3" />}
                {materials ? "Regenerate" : "Generate"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!materials && !loadingMaterials && (
            <p className="text-sm text-muted-foreground">
              AI will analyze your brief, spatial plan, and budget to generate a detailed materials list with estimated costs.
            </p>
          )}
          {loadingMaterials && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Analyzing project data and estimating costs...</p>
              <Progress value={45} className="h-2" />
            </div>
          )}
          {materials && (
            <div className="space-y-4">
              {materials.categories.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium text-sm">{cat.name}</h4>
                    <span className="text-sm font-semibold">{formatCurrency(cat.subtotal)}</span>
                  </div>
                  <div className="space-y-1">
                    {cat.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-muted/50">
                        <div className="flex-1">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground ml-2">{item.description}</span>
                        </div>
                        <div className="flex items-center gap-4 text-right shrink-0">
                          <span className="text-muted-foreground w-16">{item.quantity} {item.unit}</span>
                          <span className="w-20">{formatCurrency(item.totalCost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-semibold">Grand Total</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(materials.grandTotal)}</span>
              </div>
              {materials.notes && (
                <p className="text-xs text-muted-foreground italic">{materials.notes}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3D Modeling Brief */}
      <Card className="element-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4 text-primary" />
              3D Modeling Brief & Meshy.ai Prompts
            </CardTitle>
            <div className="flex gap-2">
              {threeDData && (
                <Button variant="outline" size="sm" onClick={download3DBrief}>
                  <Download className="mr-1 h-3 w-3" /> Download .md
                </Button>
              )}
              <Button size="sm" onClick={handleGenerate3D} disabled={loading3D}>
                {loading3D ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Box className="mr-1 h-3 w-3" />}
                {threeDData ? "Regenerate" : "Generate"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!threeDData && !loading3D && (
            <p className="text-sm text-muted-foreground">
              Generate Meshy.ai-ready image-to-3D prompts and a comprehensive Rhino/SketchUp modeling brief with dimensions, layers, and materials.
            </p>
          )}
          {loading3D && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Creating 3D modeling brief and Meshy.ai prompts...</p>
              <Progress value={45} className="h-2" />
            </div>
          )}
          {threeDData && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Meshy.ai Prompts</h4>
                <div className="space-y-2">
                  {threeDData.meshyPrompts.map((p, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1">
                      <div className="font-medium text-sm">{p.viewName}</div>
                      <p className="text-xs">{p.prompt}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{p.styleTokens}</Badge>
                        <Badge variant="outline" className="text-xs">{p.materialHints}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Modeling Brief</h4>
                <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-xs">
                  <div><strong>Dimensions:</strong> {threeDData.modelingBrief.overallDimensions}</div>
                  <div><strong>Scale:</strong> {threeDData.modelingBrief.scaleReference}</div>
                  <div><strong>Layers:</strong> {threeDData.modelingBrief.layerStructure.map(l => l.layerName).join(", ")}</div>
                  <div><strong>Materials:</strong> {threeDData.modelingBrief.materials.map(m => m.name).join(", ")}</div>
                  <div className="pt-1 border-t"><strong>Construction Notes:</strong> {threeDData.modelingBrief.constructionNotes}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Figma Export */}
      <FigmaExportPanel
        brief={brief}
        elements={elements}
        images={images || []}
        projectName={currentProject?.name || brief.brand?.name || 'Project'}
        config={{
          clientLogo: null,
          exhibitHouseLogo: profile?.logo_url || null,
          exhibitHouseName: profile?.company_name || 'Your Company',
          exhibitHouseTagline: profile?.tagline || undefined,
          brandColor: profile?.brand_color || '#0047AB',
          secondaryColor: profile?.secondary_color || '#4682B4',
          contactInfo: profile?.contact_name ? {
            name: profile.contact_name,
            email: profile.contact_email || '',
            phone: profile.contact_phone || '',
          } : undefined,
        }}
        rhinoRenders={rhinoRenders.map(r => ({
          id: r.id,
          view_name: r.view_name,
          original_public_url: r.original_public_url,
          polished_public_url: r.polished_public_url,
          polish_status: r.polish_status,
        }))}
        brandIntelligence={approvedIntel.map((e: any) => ({
          category: e.category,
          title: e.title,
          content: e.content,
        }))}
      />

      {/* Polished 3D Renders */}
      {rhinoRenders.filter(r => r.polish_status === "complete").length > 0 && (
        <Card className="element-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4 text-primary" />
              3D Design Renders
              <Badge variant="secondary" className="ml-auto">
                {rhinoRenders.filter(r => r.polish_status === "complete").length} polished
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rhinoRenders
                .filter(r => r.polish_status === "complete" && r.polished_public_url)
                .map(r => (
                  <button
                    type="button"
                    key={r.id}
                    className="relative aspect-video rounded-lg overflow-hidden bg-muted group text-left cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary"
                    onClick={() =>
                      lightbox.open(
                        r.polished_public_url!,
                        r.view_name || "Polished render",
                        r.view_name || "Polished render",
                      )
                    }
                    title="Click to view full size"
                  >
                    <img
                      src={r.polished_public_url!}
                      alt={r.view_name || "Polished render"}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <span className="text-xs text-white font-medium">
                        {r.view_name || "Untitled View"}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Polished Rhino renders are included in presentation exports and ZIP downloads.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Save Learnings to Client Intelligence */}
      <SaveLearningsButton
        clientId={currentProject?.clientId ?? null}
        projectId={projectId ?? null}
      />

      {/* Click-to-expand for any render thumbnail on this page. */}
      <ImageLightbox {...lightbox.props} />
    </div>
  );
}
