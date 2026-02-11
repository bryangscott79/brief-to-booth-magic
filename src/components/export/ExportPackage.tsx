import { useProjectStore, ELEMENT_META } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Download, 
  FileText, 
  Folder,
  Check,
  Package,
  Hammer,
  Box,
  Loader2,
  Presentation,
  FolderArchive,
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ElementType } from "@/types/brief";

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

  const projectId = currentProject?.id;
  const { data: images } = useProjectImages(projectId);

  const [materials, setMaterials] = useState<MaterialsData | null>(null);
  const [threeDData, setThreeDData] = useState<ThreeDData | null>(null);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loading3D, setLoading3D] = useState(false);
  const [loadingPresentation, setLoadingPresentation] = useState(false);
  const [presentationSlides, setPresentationSlides] = useState<any[] | null>(null);
  const [loadingZip, setLoadingZip] = useState(false);

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

  const handleGenerateMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-materials", {
        body: {
          parsedBrief: brief,
          spatialStrategy: elements.spatialStrategy?.data,
          budgetLogic: elements.budgetLogic?.data,
          boothSize: brief.spatial?.footprints?.[0]?.size || "30x30",
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
      const imageUrls = (images || []).filter(i => i.is_current).map(i => ({
        angle: i.angle_name,
        url: i.public_url,
      }));
      const { data, error } = await supabase.functions.invoke("generate-3d-brief", {
        body: {
          parsedBrief: brief,
          spatialStrategy: elements.spatialStrategy?.data,
          renderPrompts: currentProject?.renderPrompts,
          imageUrls,
          boothSize: brief.spatial?.footprints?.[0]?.size || "30x30",
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

  const handleGeneratePresentation = async () => {
    setLoadingPresentation(true);
    try {
      const imageUrls = (images || []).filter(i => i.is_current).map(i => ({
        angle: i.angle_id,
        angleName: i.angle_name,
        url: i.public_url,
      }));
      const { data, error } = await supabase.functions.invoke("generate-presentation", {
        body: {
          parsedBrief: brief,
          elements,
          projectName: brief.brand?.name || currentProject?.name,
          imageUrls,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setPresentationSlides(data.slides);
      toast({ title: "Presentation content generated", description: "Click Download to get your .pptx file" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPresentation(false);
    }
  };

  const downloadPresentation = async () => {
    if (!presentationSlides) return;
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();

    const brandName = brief.brand?.name || currentProject?.name || "Project";
    const brandColors = brief.brand?.visualIdentity?.colors || [];
    // Strip # from hex colors for pptxgenjs
    const cleanColor = (c: string) => c.replace(/^#/, "");
    const primaryColor = cleanColor(brandColors[0] || "#1a1a2e");
    const accentColor = cleanColor(brandColors[1] || "#e94560");
    const darkBg = "0D0D0D";
    const lightText = "FFFFFF";
    const mutedText = "AAAAAA";
    const bodyText = "333333";
    const subtitleGray = "777777";

    pptx.author = "Brief-to-Booth";
    pptx.title = `${brandName} — Trade Show Booth Proposal`;
    pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

    const W = 13.33;
    const H = 7.5;
    const MARGIN = 0.7;
    const CONTENT_W = W - MARGIN * 2;

    // Map of available images by angle
    const imageMap: Record<string, string> = {};
    (images || []).filter(i => i.is_current).forEach(i => {
      imageMap[i.angle_id] = i.public_url;
    });

    // Helper: add a thin accent bar at top
    const addAccentBar = (s: any) => {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.06, fill: { color: accentColor } });
    };

    // Helper: add brand watermark at bottom-right
    const addBrandWatermark = (s: any, color = mutedText) => {
      s.addText(brandName.toUpperCase(), {
        x: W - 3.5, y: H - 0.6, w: 3, h: 0.4,
        fontSize: 8, color, fontFace: "Arial",
        align: "right", italic: true,
      });
    };

    // Helper: add slide number
    const addSlideNumber = (s: any, num: number, total: number, color = mutedText) => {
      s.addText(`${num} / ${total}`, {
        x: MARGIN, y: H - 0.6, w: 1.5, h: 0.4,
        fontSize: 8, color, fontFace: "Arial",
      });
    };

    const totalSlides = presentationSlides.length;

    for (let idx = 0; idx < presentationSlides.length; idx++) {
      const slide = presentationSlides[idx];
      const s = pptx.addSlide();

      if (slide.slideType === "title") {
        // ─── TITLE SLIDE: Full dark bg, large text left, image right ───
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: darkBg } });
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: accentColor } });

        // Brand name small at top
        s.addText(brandName.toUpperCase(), {
          x: MARGIN, y: 0.5, w: 5, h: 0.4,
          fontSize: 10, color: accentColor, fontFace: "Arial",
          bold: true,
        });

        // Title
        s.addText(slide.title, {
          x: MARGIN, y: 1.5, w: 6, h: 2,
          fontSize: 36, bold: true, color: lightText, fontFace: "Arial",
          lineSpacingMultiple: 1.1,
        });

        // Subtitle
        s.addText(slide.subtitle, {
          x: MARGIN, y: 3.6, w: 6, h: 0.8,
          fontSize: 16, color: mutedText, fontFace: "Arial",
        });

        // Body points as a row at bottom
        if (slide.bodyPoints?.length) {
          s.addText(slide.bodyPoints.join("  •  "), {
            x: MARGIN, y: H - 1.4, w: CONTENT_W, h: 0.5,
            fontSize: 10, color: mutedText, fontFace: "Arial",
          });
        }

        // Hero image on the right side
        if (imageMap["hero_34"]) {
          try {
            s.addImage({ path: imageMap["hero_34"], x: 7.2, y: 0.8, w: 5.5, h: 5.5, sizing: { type: "cover", w: 5.5, h: 5.5 } });
          } catch {}
        }

      } else if (slide.slideType === "section") {
        // ─── SECTION DIVIDER: Accent bg, centered text ───
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: primaryColor } });
        s.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 3, w: 2, h: 0.06, fill: { color: accentColor } });

        s.addText(slide.title, {
          x: MARGIN, y: 1.8, w: CONTENT_W, h: 1.2,
          fontSize: 32, bold: true, color: lightText, fontFace: "Arial",
        });
        s.addText(slide.subtitle, {
          x: MARGIN, y: 3.4, w: CONTENT_W, h: 0.8,
          fontSize: 16, color: "CCCCCC", fontFace: "Arial",
        });
        addSlideNumber(s, idx + 1, totalSlides, "888888");

      } else if (slide.slideType === "imageFeature") {
        // ─── IMAGE FEATURE: Image fills most of slide, text overlay at bottom ───
        s.background = { fill: darkBg };
        addAccentBar(s);

        // Title at top
        s.addText(slide.title, {
          x: MARGIN, y: 0.4, w: CONTENT_W, h: 0.6,
          fontSize: 20, bold: true, color: lightText, fontFace: "Arial",
        });

        // Large image in center
        const imgAngle = slide.imageAngle && imageMap[slide.imageAngle] ? slide.imageAngle : "hero_34";
        if (imageMap[imgAngle]) {
          try {
            s.addImage({ path: imageMap[imgAngle], x: MARGIN, y: 1.2, w: CONTENT_W, h: 4.6, sizing: { type: "contain", w: CONTENT_W, h: 4.6 } });
          } catch {}
        }

        // Bullet points below image
        if (slide.bodyPoints?.length) {
          s.addText(
            slide.bodyPoints.map((p: string) => ({ text: `• ${p}\n`, options: { fontSize: 10, color: mutedText } })),
            { x: MARGIN, y: 6, w: CONTENT_W, h: 1, fontFace: "Arial", valign: "top" }
          );
        }
        addBrandWatermark(s, "555555");
        addSlideNumber(s, idx + 1, totalSlides, "555555");

      } else if (slide.slideType === "closing") {
        // ─── CLOSING: Dark bg, centered messaging ───
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: darkBg } });
        s.addShape(pptx.ShapeType.rect, { x: W / 2 - 1, y: 2.5, w: 2, h: 0.06, fill: { color: accentColor } });

        s.addText(slide.title, {
          x: 1.5, y: 1.2, w: W - 3, h: 1.2,
          fontSize: 30, bold: true, color: lightText, fontFace: "Arial", align: "center",
        });
        s.addText(slide.subtitle, {
          x: 1.5, y: 2.8, w: W - 3, h: 0.8,
          fontSize: 16, color: mutedText, fontFace: "Arial", align: "center",
        });
        if (slide.bodyPoints?.length) {
          s.addText(
            slide.bodyPoints.map((p: string) => ({ text: `• ${p}\n`, options: { fontSize: 12, color: "CCCCCC" } })),
            { x: 2.5, y: 4, w: W - 5, h: 2, fontFace: "Arial", align: "center", valign: "top" }
          );
        }
        addBrandWatermark(s, "555555");

      } else if (slide.slideType === "twoColumn") {
        // ─── TWO COLUMN: Split layout ───
        s.background = { fill: "FAFAFA" };
        addAccentBar(s);

        s.addText(slide.title, {
          x: MARGIN, y: 0.5, w: CONTENT_W, h: 0.7,
          fontSize: 22, bold: true, color: primaryColor, fontFace: "Arial",
        });
        s.addText(slide.subtitle, {
          x: MARGIN, y: 1.15, w: CONTENT_W, h: 0.45,
          fontSize: 12, color: subtitleGray, fontFace: "Arial",
        });

        // Divider line
        s.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 1.7, w: 1.5, h: 0.04, fill: { color: accentColor } });

        const hasImage = slide.imageAngle && imageMap[slide.imageAngle];
        const textW = hasImage ? 5.5 : CONTENT_W;

        if (slide.bodyPoints?.length) {
          s.addText(
            slide.bodyPoints.map((p: string) => ({ text: `• ${p}\n\n`, options: { fontSize: 13, color: bodyText, lineSpacingMultiple: 1.3 } })),
            { x: MARGIN, y: 2, w: textW, h: 4.5, fontFace: "Arial", valign: "top" }
          );
        }

        if (hasImage) {
          try {
            s.addImage({ path: imageMap[slide.imageAngle], x: 6.8, y: 2, w: 5.8, h: 4.5, sizing: { type: "contain", w: 5.8, h: 4.5 } });
          } catch {}
        }

        addBrandWatermark(s);
        addSlideNumber(s, idx + 1, totalSlides);

      } else if (slide.slideType === "data") {
        // ─── DATA SLIDE: Clean layout for numbers/stats ───
        s.background = { fill: "FFFFFF" };
        addAccentBar(s);

        s.addText(slide.title, {
          x: MARGIN, y: 0.5, w: CONTENT_W, h: 0.7,
          fontSize: 22, bold: true, color: primaryColor, fontFace: "Arial",
        });
        s.addText(slide.subtitle, {
          x: MARGIN, y: 1.15, w: CONTENT_W, h: 0.45,
          fontSize: 12, color: subtitleGray, fontFace: "Arial",
        });
        s.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 1.7, w: 1.5, h: 0.04, fill: { color: accentColor } });

        if (slide.bodyPoints?.length) {
          s.addText(
            slide.bodyPoints.map((p: string) => ({ text: `• ${p}\n\n`, options: { fontSize: 13, color: bodyText, lineSpacingMultiple: 1.4 } })),
            { x: MARGIN, y: 2, w: CONTENT_W, h: 4.5, fontFace: "Arial", valign: "top" }
          );
        }

        addBrandWatermark(s);
        addSlideNumber(s, idx + 1, totalSlides);

      } else {
        // ─── CONTENT (default): Clean white slide with optional image ───
        s.background = { fill: "FFFFFF" };
        addAccentBar(s);

        // Title block
        s.addText(slide.title, {
          x: MARGIN, y: 0.5, w: CONTENT_W, h: 0.7,
          fontSize: 22, bold: true, color: primaryColor, fontFace: "Arial",
        });
        s.addText(slide.subtitle, {
          x: MARGIN, y: 1.15, w: CONTENT_W, h: 0.45,
          fontSize: 12, color: subtitleGray, fontFace: "Arial",
        });

        // Accent divider
        s.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 1.7, w: 1.5, h: 0.04, fill: { color: accentColor } });

        const hasImg = slide.imageAngle && imageMap[slide.imageAngle];
        const bulletW = hasImg ? 5.5 : CONTENT_W;

        // Body bullets
        if (slide.bodyPoints?.length) {
          s.addText(
            slide.bodyPoints.map((p: string) => ({ text: `• ${p}\n\n`, options: { fontSize: 13, color: bodyText, lineSpacingMultiple: 1.3 } })),
            { x: MARGIN, y: 2, w: bulletW, h: 4.5, fontFace: "Arial", valign: "top" }
          );
        }

        // Side image
        if (hasImg) {
          try {
            s.addImage({ path: imageMap[slide.imageAngle], x: 6.8, y: 2, w: 5.8, h: 4.5, sizing: { type: "contain", w: 5.8, h: 4.5 } });
          } catch {}
        }

        addBrandWatermark(s);
        addSlideNumber(s, idx + 1, totalSlides);
      }

      // Speaker notes
      if (slide.speakerNotes) {
        s.addNotes(slide.speakerNotes);
      }
    }

    pptx.writeFile({ fileName: `${brandName}_Booth_Proposal.pptx` });
  };

  const handleDownloadZip = async () => {
    setLoadingZip(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const brandName = brief.brand?.name || currentProject?.name || "Project";
      const currentImages = (images || []).filter(i => i.is_current);

      // ── 1. Download and add all rendered images ──
      const imgFolder = zip.folder("renders")!;
      for (const img of currentImages) {
        try {
          const response = await fetch(img.public_url);
          if (response.ok) {
            const blob = await response.blob();
            const ext = img.public_url.includes(".png") ? "png" : "jpg";
            imgFolder.file(`${img.angle_name.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.${ext}`, blob);
          }
        } catch {
          console.warn(`Failed to fetch image: ${img.angle_name}`);
        }
      }

      // ── 2. Build structured content markdown ──
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

      content += `## Spatial\n- **Booth Size:** ${brief.spatial?.footprints?.[0]?.size || "TBD"} (${brief.spatial?.footprints?.[0]?.sqft || "TBD"} sqft)\n\n`;

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

      if (presentationSlides) {
        content += `---\n\n# Presentation Slides\n\n`;
        for (let i = 0; i < presentationSlides.length; i++) {
          const slide = presentationSlides[i];
          content += `### Slide ${i + 1}: ${slide.title}\n`;
          content += `**Type:** ${slide.slideType} | **Subtitle:** ${slide.subtitle}\n`;
          if (slide.imageAngle) content += `**Image:** ${slide.imageAngle}\n`;
          if (slide.bodyPoints?.length) {
            for (const p of slide.bodyPoints) content += `- ${p}\n`;
          }
          if (slide.speakerNotes) content += `\n> **Speaker Notes:** ${slide.speakerNotes}\n`;
          content += `\n`;
        }
      }

      content += `---\n\n# Rendered Views\n\n`;
      for (const img of currentImages) {
        const ext = img.public_url.includes(".png") ? "png" : "jpg";
        content += `- **${img.angle_name}**: renders/${img.angle_name.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.${ext}\n`;
      }

      zip.file("content.md", content);

      // ── 3. JSON version for structured import ──
      const jsonData = {
        project: brandName,
        brand: brief.brand,
        objectives: brief.objectives,
        audiences: brief.audiences,
        events: brief.events,
        spatial: brief.spatial,
        budget: brief.budget,
        elements: Object.fromEntries(
          elementKeys.filter(({ key }) => (elements as any)[key]?.data).map(({ key, label }) => [key, { label, data: (elements as any)[key].data }])
        ),
        slides: presentationSlides || [],
        images: currentImages.map(img => ({
          angleId: img.angle_id,
          angleName: img.angle_name,
          filename: `renders/${img.angle_name.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.${img.public_url.includes(".png") ? "png" : "jpg"}`,
        })),
      };
      zip.file("content.json", JSON.stringify(jsonData, null, 2));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brandName}_Export_Package.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Package downloaded", description: `${currentImages.length} images + content files zipped` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingZip(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Export Package</h2>
        <p className="text-muted-foreground">
          Generate materials lists, 3D modeling briefs, and download your complete project
        </p>
      </div>

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
            Downloads all rendered images, strategic content (Markdown + JSON), and slide structure into a single .zip file you can take to Google Slides, Keynote, Canva, or any presentation tool.
          </p>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Folder className="h-3 w-3" /> renders/</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> content.md</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> content.json</span>
          </div>
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold">{brief.brand?.name || currentProject?.name}</div>
              <div className="text-sm text-muted-foreground">Project</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{completedElements}/{totalElements}</div>
              <div className="text-sm text-muted-foreground">Elements Complete</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{images?.filter(i => i.is_current).length || 0}</div>
              <div className="text-sm text-muted-foreground">Rendered Views</div>
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

      {/* Presentation Deck */}
      <Card className="element-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Presentation className="h-4 w-4 text-primary" />
              Presentation Deck
            </CardTitle>
            <div className="flex gap-2">
              {presentationSlides && (
                <Button variant="outline" size="sm" onClick={downloadPresentation}>
                  <Download className="mr-1 h-3 w-3" /> Download .pptx
                </Button>
              )}
              <Button size="sm" onClick={handleGeneratePresentation} disabled={loadingPresentation}>
                {loadingPresentation ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Presentation className="mr-1 h-3 w-3" />}
                {presentationSlides ? "Regenerate" : "Generate"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!presentationSlides && !loadingPresentation && (
            <p className="text-sm text-muted-foreground">
              AI will compile all strategic elements, spatial plans, budget data, and rendered images into a polished PowerPoint presentation deck ready for client review.
            </p>
          )}
          {loadingPresentation && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Crafting your presentation deck...</p>
              <Progress value={45} className="h-2" />
            </div>
          )}
          {presentationSlides && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{presentationSlides.length} slides generated</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {presentationSlides.map((slide, i) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/50 text-center">
                    <div className="text-xs font-medium truncate">{slide.title}</div>
                    <Badge variant="outline" className="text-[10px] mt-1">{slide.slideType}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
