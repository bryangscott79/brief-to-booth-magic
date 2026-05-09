import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronRight,
  Download,
  TrendingUp,
  Layers,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutMetrics, generateLayoutMetrics } from "./LayoutMetrics";
import { LayoutVariations, LayoutReasoning, generateLayoutVariations } from "./LayoutVariations";
// InspirationUpload was removed from this view — visual references are
// handled at the project level (Upload step + Brand intelligence).
// FloorPlan card was removed — the SpatialCanvas above renders top-down,
// iso, flow, and heatmap directly. AI-rendered 2D blueprint export will
// move to a different surface when the user needs it again.
import { SpatialCanvas } from "./SpatialCanvas";
import {
  type BoothGeometry,
  boothGeometryFromLegacy,
  normalizedFromAbsoluteZone,
  fixLayoutAutomatically,
  type AbsoluteZone,
} from "@/lib/geometryModel";
import { useMeasurementSystem } from "@/hooks/useMeasurementSystem";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { ConstraintPanel } from "./ConstraintPanel";
import { CostEstimator } from "./CostEstimator";
import { PromptIngredientsEditor, type PromptIngredients } from "./PromptIngredientsEditor";
import type { QualityTier } from "@/lib/exhibitConstraints";
import { useProjectImages, useSaveRenderImage } from "@/hooks/useProjectImages";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { saveProjectField } from "@/hooks/useProjectSync";
import { useBrandIntelligence } from "@/hooks/useClients";
import {
  generatePrompt,
  getZoneInteriorAngles,
  type GeneratePromptParams,
} from "@/lib/promptBuilder";

// Import spatial utilities
import {
  calculateBoothDimensions,
  normalizeZones,
  validateSpatialLayout,
  generateScaleContext,
  type NormalizedZone,
  type ValidationResult,
  type BoothDimensions,
} from "@/lib/spatialUtils";

// Zone color palette
const ZONE_PALETTE = [
  { bg: "rgba(0, 71, 171, 0.45)", border: "rgba(0, 71, 171, 0.9)", text: "#002D6B" },
  { bg: "rgba(70, 130, 180, 0.45)", border: "rgba(70, 130, 180, 0.9)", text: "#2A6496" },
  { bg: "rgba(47, 79, 79, 0.45)", border: "rgba(47, 79, 79, 0.9)", text: "#1A3A3A" },
  { bg: "rgba(218, 165, 32, 0.45)", border: "rgba(218, 165, 32, 0.9)", text: "#8B6914" },
  { bg: "rgba(139, 69, 19, 0.45)", border: "rgba(139, 69, 19, 0.9)", text: "#6B3410" },
  { bg: "rgba(85, 107, 47, 0.45)", border: "rgba(85, 107, 47, 0.9)", text: "#3A4A20" },
  { bg: "rgba(128, 0, 128, 0.45)", border: "rgba(128, 0, 128, 0.9)", text: "#5C005C" },
  { bg: "rgba(176, 60, 60, 0.45)", border: "rgba(176, 60, 60, 0.9)", text: "#7A2020" },
];

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(100, 100, 100, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getZoneColors(zone: NormalizedZone, index: number) {
  if (zone.colorCode && zone.colorCode.startsWith('#')) {
    return {
      bg: hexToRgba(zone.colorCode, 0.45),
      border: hexToRgba(zone.colorCode, 0.9),
      text: zone.colorCode,
    };
  }
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

// Validation Panel Component
function ValidationPanel({ validation }: { validation: ValidationResult }) {
  if (validation.valid && validation.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary p-3 bg-primary/5 rounded-lg border border-primary/20">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>Layout validated — {validation.totalPercentage}% allocated across {validation.normalizedZones.length} zones</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
      <div className="text-sm font-medium flex items-center gap-2">
        {validation.errors.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        )}
        Layout Issues ({validation.errors.length} errors, {validation.warnings.length} warnings)
      </div>
      
      {validation.errors.map((error, i) => (
        <div key={`e-${i}`} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ))}
      
      {validation.warnings.map((warning, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 text-sm text-amber-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

export function SpatialPlanner() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [activeFootprint, setActiveFootprint] = useState(0);
  const [activeVariation, setActiveVariation] = useState("balanced");
  const [activeTab, setActiveTab] = useState<"layout" | "metrics" | "constraints" | "costs">("layout");
  const [selectedZone, setSelectedZone] = useState<{ zone: NormalizedZone; colors: any } | null>(null);
  // floorPlanView/floorPlanImage/floorPlanAnnotations remain in state
  // because the AI-rendered 2D blueprint flow may move to a different
  // surface (Export step or a side panel) and we'd lose user history
  // if we drop them now. The associated UI was removed with the bottom
  // Floor Plan card; the state itself is harmless to keep.
  const [floorPlanView, setFloorPlanView] = useState<"blocks" | "render">("blocks");
  const [floorPlanImage, setFloorPlanImage] = useState<string | null>(null);
  const [, setIsGeneratingFloorPlan] = useState(false);
  const [floorPlanAnnotations, setFloorPlanAnnotations] = useState<any[]>([]);
  const [qualityTier, setQualityTier] = useState<QualityTier>("premium");
  const [showIngredientsEditor, setShowIngredientsEditor] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [pendingFeedback, setPendingFeedback] = useState("");
  const [promptIngredients, setPromptIngredients] = useState<PromptIngredients | null>(null);
  const [pendingVariation, setPendingVariation] = useState<string | null>(null);

  const { data: savedImages = [] } = useProjectImages(projectId);
  const saveImage = useSaveRenderImage(projectId);

  const spatialData = currentProject?.elements.spatialStrategy.data;
  const currentConfig = spatialData?.configs?.[activeFootprint];
  const brief = currentProject?.parsedBrief;
  const bigIdea = currentProject?.elements.bigIdea.data;

  // Calculate booth dimensions with proper aspect ratio
  const boothDimensions: BoothDimensions = useMemo(() => {
    const footprintStr = currentConfig?.footprintSize || 
      brief?.spatial?.footprints?.[activeFootprint]?.size || 
      "30x30";
    return calculateBoothDimensions(footprintStr);
  }, [currentConfig, brief, activeFootprint]);

  // Normalize and validate zones
  const { normalizedZones, validation } = useMemo(() => {
    if (!currentConfig?.zones) {
      return { 
        normalizedZones: [], 
        validation: { valid: false, errors: ['No zones defined'], warnings: [], normalizedZones: [], totalPercentage: 0, totalSqft: 0 }
      };
    }
    
    const normalized = normalizeZones(currentConfig.zones, boothDimensions.totalSqft);
    const validationResult = validateSpatialLayout(normalized, boothDimensions.totalSqft);
    
    return { normalizedZones: normalized, validation: validationResult };
  }, [currentConfig, boothDimensions.totalSqft]);

  // Hydrate floor plan from saved images
  useMemo(() => {
    const saved = savedImages.find(img => img.angle_id === "floor_plan_2d" && img.is_current);
    if (saved && !floorPlanImage) setFloorPlanImage(saved.public_url);
  }, [savedImages]);

  // Hydrate annotations from spatial data
  useMemo(() => {
    const saved = spatialData?.floorPlanAnnotations;
    if (saved && Array.isArray(saved) && floorPlanAnnotations.length === 0) {
      setFloorPlanAnnotations(saved);
    }
  }, [spatialData]);
  
  // Extract budget from brief
  const budgetMax = useMemo(() => {
    const budgetRange = brief?.budget?.range;
    const perShow = brief?.budget?.perShow;
    return perShow || (budgetRange ? budgetRange.max : 0);
  }, [brief]);

  // Generate layout variations using normalized zones. Pass full
  // boothDimensions so each variation can be piped through
  // fixNormalizedLayoutAutomatically — this guarantees zones meet
  // industry size + percentage minimums by the time the user clicks
  // the option, rather than throwing immediate validation errors.
  const variations = useMemo(() => {
    if (normalizedZones.length === 0) return [];
    return generateLayoutVariations(
      normalizedZones,
      currentConfig?.footprintSize || "30x30",
      boothDimensions.totalSqft,
      budgetMax || undefined,
      qualityTier,
      boothDimensions,
    );
  }, [normalizedZones, currentConfig, boothDimensions, budgetMax, qualityTier]);
  
  const activeLayout = useMemo(() => 
    variations.find(v => v.id === activeVariation) || variations[0],
    [variations, activeVariation]
  );
  
  const metrics = useMemo(() => {
    if (!activeLayout?.zones) return null;
    return generateLayoutMetrics(activeLayout.zones, activeLayout.type, boothDimensions.totalSqft);
  }, [activeLayout, boothDimensions.totalSqft]);
  
  const handleGenerateFloorPlan = useCallback(async (ingredients?: PromptIngredients, feedback?: string) => {
    if (!currentConfig || !activeLayout) {
      toast({ title: "Missing data", description: "Spatial layout data is required to generate a floor plan.", variant: "destructive" });
      return;
    }
    setIsGeneratingFloorPlan(true);

    const scaleContext = generateScaleContext(boothDimensions.footprintLabel);

    const zoneDescriptions = activeLayout.zones
      .map((z: NormalizedZone) => `- ${z.name}: ${z.percentage}% (${z.sqft} sq ft) — positioned at ${Math.round(z.position.x)}% from left, ${Math.round(z.position.y)}% from top, ${Math.round(z.position.width)}% wide × ${Math.round(z.position.height)}% deep`)
      .join("\n");

    const heroName = currentProject?.elements.interactiveMechanics?.data?.hero?.name || "Hero installation";
    const materials = spatialData?.materialsAndMood?.map((m: any) => `${m.material}: ${m.feel}`).join(", ") || "";

    const variationContext = `LAYOUT STRATEGY: "${activeLayout.name}" (${activeLayout.score}% match)
- ${activeLayout.description}
- Optimized for: ${activeLayout.bestFor.join(", ")}`;

    const annotationBlock = floorPlanAnnotations.length > 0
      ? `\nUSER FEEDBACK (CRITICAL — apply all of these changes):\n${floorPlanAnnotations.map((a, i) => `${i + 1}. At position (${Math.round(a.x)}% from left, ${Math.round(a.y)}% from top): "${a.comment}"`).join("\n")}`
      : "";

    const feedbackBlock = (feedback || pendingFeedback)
      ? `\nREGENERATION FEEDBACK (CRITICAL — incorporate this direction):\n${feedback || pendingFeedback}`
      : "";

    const ing = ingredients;
    const colorsBlock = ing?.brandColors?.length
      ? `\nBRAND COLORS (include in key/legend at bottom of drawing):\n${ing.brandColors.map(c => `- ${c.name} (${c.hex}): used for ${c.usage}`).join("\n")}\nApply these colors as zone fill hatching or as accent elements in the drawing.`
      : "";

    const materialsBlock = ing?.materials?.length
      ? `\nMATERIALS (include in legend):\n${ing.materials.map(m => `- ${m.material}: ${m.feel} — ${m.application}`).join("\n")}`
      : `\nMATERIALS CONTEXT: ${materials}`;

    const styleBlock = ing?.styleNotes ? `\nSTYLE NOTES: ${ing.styleNotes}` : "";
    const layoutNotesBlock = ing?.layoutNotes ? `\nLAYOUT NOTES:\n${ing.layoutNotes}` : "";

    const prompt = `Generate a professional top-down 2D booth floor plan for a ${boothDimensions.width}' × ${boothDimensions.depth}' (${boothDimensions.totalSqft} sq ft) trade show exhibit for ${brief?.brand?.name || "client"}.

STYLE: Technical architectural floor plan on light blue graph-paper background. Bird's-eye view looking STRAIGHT DOWN. Clean black outlines. Minimal color — use brand colors ONLY for hatching/fills in zones and the legend key. NO 3D, NO perspective — purely flat 2D blueprint.

${scaleContext}

${variationContext}

ZONE LAYOUT (with exact positions):
${zoneDescriptions}

DRAWING REQUIREMENTS:
- Bold black rectangular booth outline with dimension labels ("${boothDimensions.width}'" and "${boothDimensions.depth}'")
- Each zone clearly labeled with zone name + sq ft
- Individual furniture items as simple black-outline icons from above
- Thin lines separating major zone areas
- Entry points marked with arrows from aisle side
- The hero "${heroName}" should be drawn as a prominent central fixture
- Include a LEGEND/KEY box at the bottom showing brand colors and material hatching patterns
${colorsBlock}
${materialsBlock}
${styleBlock}
${layoutNotesBlock}
${annotationBlock}
${feedbackBlock}

Aspect ratio: ${boothDimensions.aspectRatio >= 1 ? '4:3' : '3:4'}`;

    try {
      const { data, error } = await supabase.functions.invoke("generate-view", {
        body: {
          viewPrompt: prompt,
          viewName: "Floor Plan 2D",
          aspectRatio: boothDimensions.aspectRatio >= 1 ? "4:3" : "3:4",
          angleId: "floor_plan_2d",
          projectId,
          boothSize: currentConfig.footprintSize,
        },
      });

      if (error) throw error;
      if (!data?.imageUrl) throw new Error("No image returned");

      setFloorPlanImage(data.imageUrl);
      setFloorPlanView("render");

      // Save to DB
      if (projectId) {
        await saveImage.mutateAsync({
          angleId: "floor_plan_2d",
          angleName: "Floor Plan (2D)",
          imageDataUrl: data.imageUrl,
        });
      }

      toast({ 
        title: "Floor plan generated", 
        description: floorPlanAnnotations.length > 0 
          ? `Applied ${floorPlanAnnotations.length} feedback note(s)` 
          : "AI-rendered 2D floor plan is ready" 
      });
    } catch (err) {
      console.error("Floor plan generation error:", err);
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setIsGeneratingFloorPlan(false);
    }
  }, [brief, currentConfig, activeLayout, spatialData, bigIdea, projectId, currentProject, floorPlanAnnotations, boothDimensions]);

  // Build default ingredients from current project data
  const buildDefaultIngredients = useCallback((): PromptIngredients => {
    const brandColorNames: string[] = brief?.brand?.visualIdentity?.colors || [];
    const brandColors = brandColorNames.map((name: string) => ({
      name,
      hex: name.toLowerCase().includes("blue") ? "#0047AB" :
           name.toLowerCase().includes("purple") ? "#6B2FA0" :
           name.toLowerCase().includes("black") ? "#1A1A1A" :
           name.toLowerCase().includes("white") ? "#F5F5F5" :
           name.toLowerCase().includes("gold") ? "#C8A84B" :
           "#555555",
      usage: "Brand accent",
    }));

    const materials = (spatialData?.materialsAndMood || []).map((m: any) => ({
      material: m.material || "",
      feel: m.feel || "",
      application: m.use || "General",
    }));

    const layoutNotes = activeLayout
      ? `Strategy: ${activeLayout.name} — ${activeLayout.description}\nOptimized for: ${activeLayout.bestFor?.join(", ")}\nFlow efficiency target: ${activeLayout.score}%`
      : "";

    return {
      brandColors,
      materials,
      layoutNotes,
      styleNotes: `Architectural floor plan style. Technical drawing aesthetic with a light graph-paper background.`,
      customDirectives: pendingFeedback || "",
    };
  }, [brief, spatialData, activeLayout, pendingFeedback]);

  const handleOpenEditor = useCallback(() => {
    setPromptIngredients(buildDefaultIngredients());
    setFeedbackText(pendingFeedback);
    setShowIngredientsEditor(true);
  }, [buildDefaultIngredients, pendingFeedback]);

  const handleConfirmFromEditor = useCallback((ingredients: PromptIngredients, feedback: string) => {
    setPromptIngredients(ingredients);
    setPendingFeedback(feedback);
    setShowIngredientsEditor(false);
    handleGenerateFloorPlan(ingredients, feedback);
  }, [handleGenerateFloorPlan]);

  // Apply a layout variation's zones into the canonical config so the
  // top spatial canvas + bottom floor plan stay in sync. Without this
  // the user could pick "Hero-Centric" and the bottom panel would
  // reflow while the top spatial canvas kept its old positions —
  // exactly the divergence the user reported. The "balanced" variation
  // IS the current zones so applying it is a no-op (skip the write).
  const applyVariationZonesToConfig = useCallback(
    (variationId: string) => {
      const v = variations.find((x) => x.id === variationId);
      if (!v || !currentConfig || !spatialData) return;
      // Skip the balanced/identity case — same zones, would just
      // generate a redundant DB write.
      if (variationId === "balanced") return;
      // Merge: keep each zone's metadata (height, shape, override,
      // requirements, adjacencies, etc.) and only swap in the new
      // position from the variation's zone with the same id.
      const byId = new Map<string, NormalizedZone>(
        v.zones.map((z) => [z.id, z]),
      );
      const mergedLegacy = (currentConfig.zones ?? []).map((z: any) => {
        const variant = byId.get(z.id);
        if (!variant) return z;
        return {
          ...z,
          position: { ...variant.position },
          percentage: variant.percentage,
          sqft: variant.sqft,
        };
      });
      const updatedConfigs = [...(spatialData.configs ?? [])];
      updatedConfigs[activeFootprint] = {
        ...currentConfig,
        zones: mergedLegacy,
      };
      const updatedSpatial = { ...spatialData, configs: updatedConfigs };
      if (currentProject) {
        useProjectStore
          .getState()
          .setElementData("spatialStrategy", updatedSpatial);
      }
      if (projectId) {
        saveProjectField(projectId, "spatial_strategy", updatedSpatial);
      }
      toast({
        title: `Applied "${v.name}"`,
        description: "Spatial canvas updated. Drag any zone to refine.",
      });
    },
    [
      variations,
      currentConfig,
      spatialData,
      activeFootprint,
      currentProject,
      projectId,
      toast,
    ],
  );

  // Intercept layout variation change when in render mode
  const handleVariationSelect = useCallback((variationId: string) => {
    if (floorPlanView === "render" && floorPlanImage) {
      setPendingVariation(variationId);
      return;
    }
    // Reflow the canvas to match the picked layout. After applying we
    // snap activeVariation back to "balanced" so the bottom floor plan
    // mirrors the canvas (now the new baseline) instead of running the
    // strategy a SECOND time on top of itself — which would otherwise
    // compound each time the user clicked a variation.
    if (variationId === "balanced") {
      setActiveVariation("balanced");
      return;
    }
    applyVariationZonesToConfig(variationId);
    setActiveVariation("balanced");
  }, [floorPlanView, floorPlanImage, applyVariationZonesToConfig]);

  const handleLayoutChangeRender = useCallback(() => {
    if (!pendingVariation) return;
    setActiveVariation(pendingVariation);
    applyVariationZonesToConfig(pendingVariation);
    setPendingVariation(null);
    // open ingredients editor to generate with new layout
    setTimeout(() => handleOpenEditor(), 50);
  }, [pendingVariation, handleOpenEditor, applyVariationZonesToConfig]);

  const handleLayoutChangeZones = useCallback(() => {
    if (!pendingVariation) return;
    setActiveVariation(pendingVariation);
    applyVariationZonesToConfig(pendingVariation);
    setPendingVariation(null);
    setFloorPlanView("blocks");
  }, [pendingVariation, applyVariationZonesToConfig]);

  // ── Per-zone prompt builder ─────────────────────────────────────
  // Mirrors PromptGenerator.getZoneDefaultPrompt so the SpatialCanvas
  // "Edit prompt" button works in the Spatial step too. The Prompts
  // step layers an active style preset on top; here we show the base
  // prompt the model would receive, which is enough for the user to
  // see what's being said about a zone and override it. Edits save as
  // customPromptOverride and BOTH steps respect them.
  const clientId = currentProject?.clientId ?? null;
  const { data: brandIntelEntries } = useBrandIntelligence(clientId);
  const approvedBrandIntel = useMemo(
    () =>
      brandIntelEntries
        ?.filter((e) => e.is_approved)
        .map((e) => ({
          category: e.category,
          title: e.title,
          content: e.content,
          tags: e.tags,
        })),
    [brandIntelEntries],
  );
  const zoneInteriorAngles = useMemo(
    () => getZoneInteriorAngles(normalizedZones),
    [normalizedZones],
  );
  const elements = currentProject?.elements;
  const promptParams: GeneratePromptParams = useMemo(
    () => ({
      brief,
      bigIdea,
      elements,
      spatialData,
      boothDimensions,
      normalizedZones,
      zoneInteriorAngles,
      projectType: currentProject?.projectType ?? null,
      brandIntelligence: approvedBrandIntel,
    }),
    [
      brief,
      bigIdea,
      elements,
      spatialData,
      boothDimensions,
      normalizedZones,
      zoneInteriorAngles,
      currentProject?.projectType,
      approvedBrandIntel,
    ],
  );
  const getZoneDefaultPrompt = useCallback(
    (zoneId: string): string => {
      const angleId = `zone_interior_${zoneId}`;
      return generatePrompt(angleId, promptParams);
    },
    [promptParams],
  );

  // ── Spatial canvas integration ──────────────────────────────────
  // The interactive canvas operates on absolute-unit zones (ft / m).
  // We derive a BoothGeometry from the current normalized zones each
  // render; user edits flow back through onGeometryChange, get
  // round-tripped to the legacy NormalizedZone shape, and persist via
  // saveProjectField. Variations are unaffected — the canonical store
  // is currentConfig.zones.
  const { system: measurementSystem } = useMeasurementSystem(projectId, brief);
  const canvasGeometry: BoothGeometry = useMemo(() => {
    return boothGeometryFromLegacy(
      // Force the project-level measurement system over whatever the
      // footprint string happened to be parsed as. This is the same
      // override applied in PromptGenerator's render call.
      { ...boothDimensions, measurementSystem },
      normalizedZones,
    );
  }, [boothDimensions, normalizedZones, measurementSystem]);

  const handleCanvasGeometryChange = useCallback(
    (next: BoothGeometry) => {
      if (!currentConfig || !spatialData) return;
      // Convert each absolute zone back into the legacy NormalizedZone
      // shape used by spatialData.configs[].zones. Preserve any fields
      // (notes, requirements, adjacencies) that aren't represented in
      // the canvas model.
      const legacyZones = next.zones.map((abs: AbsoluteZone) => {
        const original = currentConfig.zones?.find((z: any) => z.id === abs.id);
        const normalized = normalizedFromAbsoluteZone(abs, next, boothDimensions.totalSqft);
        return {
          ...(original ?? {}),
          ...normalized,
          // Preserve fields the canvas owns
          customPromptOverride: abs.customPromptOverride,
          // Persist heightFt so re-deriving geometry later doesn't lose
          // user-edited heights.
          heightFt: abs.heightFt,
          // Persist shape fields too (rect / L / circle + L corner +
          // notch ratios) so a project save round-trip keeps the user's
          // shape edits intact.
          shape: abs.shape,
          shapeParams: abs.shapeParams,
        };
      });
      const updatedConfig = { ...currentConfig, zones: legacyZones };
      const updatedConfigs = [...(spatialData.configs ?? [])];
      updatedConfigs[activeFootprint] = updatedConfig;
      const updatedSpatial = {
        ...spatialData,
        configs: updatedConfigs,
        // Persist the booth-level fields the canvas may edit too
        // (ceiling height not currently surfaced in the canvas UI but
        // the field is reserved for it).
        ceilingHeightFt: next.ceilingHeightFt,
      };
      // Optimistic local update via project store + persist to DB.
      if (currentProject) {
        useProjectStore.getState().setElementData("spatialStrategy", updatedSpatial);
      }
      if (projectId) {
        saveProjectField(projectId, "spatial_strategy", updatedSpatial);
      }
    },
    [
      currentConfig,
      spatialData,
      boothDimensions.totalSqft,
      activeFootprint,
      currentProject,
      projectId,
    ],
  );

  // Annotation handlers
  // Annotation add/remove handlers were tied to the FloorPlanAnnotations
  // component inside the now-removed Floor Plan card. The state (above)
  // is preserved so re-adding the AI render flow elsewhere can reuse it
  // without losing the user's saved annotations.

  // Early return after all hooks
  if (!spatialData?.configs || !currentConfig || !activeLayout || !metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No spatial data available</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/generate")}>
          Generate Elements First
        </Button>
      </div>
    );
  }

  const handleContinue = () => {
    setActiveStep("prompts");
    navigate("/prompts");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Spatial Strategy</h2>
          <p className="text-muted-foreground">
            {boothDimensions.footprintLabel} {boothDimensions.scaleDescription} • {validation.totalPercentage}% zone coverage
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export SVG
          </Button>
          <Button onClick={handleContinue} className="btn-glow">
            Generate Prompts
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Validation Alert (if issues) */}
      {(!validation.valid || validation.warnings.length > 0) && (
        <ValidationPanel validation={validation} />
      )}

      {/* Footprint Selector. Flow + Heatmap toggles used to live to
          the right here as page-level chips, but they only affect the
          bottom Floor Plan card — they're now in that card's header,
          where the relationship is obvious. */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {spatialData.configs.map((config: any, index: number) => (
            <button
              key={config.footprintSize}
              onClick={() => setActiveFootprint(index)}
              className={cn(
                "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                activeFootprint === index
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/30"
              )}
            >
              {config.footprintSize}
              <span className="text-xs opacity-70 ml-2">
                ({config.totalSqft || calculateBoothDimensions(config.footprintSize).totalSqft} sq ft)
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Materials & Mood — surfaced ABOVE the canvas so the user sees
          the design language while authoring zones. Used to be buried
          at the bottom of the right rail. */}
      {spatialData.materialsAndMood && spatialData.materialsAndMood.length > 0 && (
        <Card className="element-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Materials &amp; Mood</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {spatialData.materialsAndMood.length} entries
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {spatialData.materialsAndMood.map((mat: any, i: number) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="font-medium">{mat.material}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {mat.use && <span className="block">{mat.use}</span>}
                    {mat.feel && <span className="block">{mat.feel}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive spatial canvas — primary editing surface for booth
          geometry. Edits flow through handleCanvasGeometryChange to
          spatialStrategy.configs[].zones, persisted via saveProjectField. */}
      <SpatialCanvas
        geometry={canvasGeometry}
        onGeometryChange={handleCanvasGeometryChange}
        getZoneDefaultPrompt={getZoneDefaultPrompt}
      />

      {/* Layout / Metrics / Validate / Costs tabs — used to live in the
          right rail of a 3-column grid alongside a now-eliminated Floor
          Plan card. With that card gone (the spatial canvas above
          handles top-down + iso + flow + heatmap directly), this panel
          fills the full width below the canvas. The TabsList grid keeps
          tabs evenly distributed regardless of viewport width. */}
      <div className="space-y-4">
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "layout" | "metrics" | "constraints" | "costs")}>
            <TabsList className="w-full grid grid-cols-4 max-w-md">
              <TabsTrigger value="layout">
                <Layers className="h-3.5 w-3.5 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="metrics">
                <TrendingUp className="h-3.5 w-3.5 mr-1" />
                Metrics
              </TabsTrigger>
              <TabsTrigger value="constraints" className="relative">
                {validation.errors.length > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-destructive" />
                ) : validation.warnings.length > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5 mr-1 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" />
                )}
                Validate
              </TabsTrigger>
              <TabsTrigger value="costs">
                <span className="mr-1 text-xs">$</span>
                Costs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="layout" className="space-y-4 mt-4">
              {/* Layout Variations */}
              <LayoutVariations
                variations={variations}
                activeVariation={activeVariation}
                onSelect={handleVariationSelect}
              />

              {/* Layout Reasoning */}
              <LayoutReasoning variation={activeLayout} />

              {/* Zone Legend */}
              <Card className="element-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Zone Allocation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeLayout.zones.map((zone: NormalizedZone, index: number) => {
                    const colors = getZoneColors(zone, index);
                    return (
                      <div key={zone.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded border"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                          />
                          <span className="text-sm">{zone.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{zone.sqft} sqft</span>
                          <Badge variant="secondary" className="text-xs">
                            {zone.percentage}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="text-sm font-medium">Total</span>
                    <Badge variant={validation.totalPercentage > 100 ? "destructive" : "default"} className="text-xs">
                      {validation.totalPercentage}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4 mt-4">
              <LayoutMetrics metrics={metrics} />
            </TabsContent>

            <TabsContent value="constraints" className="space-y-4 mt-4">
              {/* Full constraint panel with ADA, zone sizing, sightlines,
                  utilities — plus a one-click layout repair button that
                  clamps zones to bounds, snaps to grid, and redistributes
                  overlaps via the same heuristic as the canvas's
                  Auto-arrange button. */}
              <ConstraintPanel
                zones={activeLayout.zones}
                boothDimensions={boothDimensions}
                onAutoFix={() => {
                  const fixed = fixLayoutAutomatically(canvasGeometry);
                  handleCanvasGeometryChange(fixed);
                  toast({
                    title: "Layout repaired",
                    description: "Zones clamped to bounds, snapped to grid, and overlaps resolved.",
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 mt-4">
              {/* Cost estimator with tier selection, budget gauge, per-zone breakdown */}
              <CostEstimator
                zones={activeLayout.zones}
                boothDimensions={boothDimensions}
                budgetMax={budgetMax}
                onTierChange={setQualityTier}
              />
            </TabsContent>
          </Tabs>
          {/* Materials & Mood was here — moved above the canvas so it
              informs layout authoring rather than being buried below the
              fold of the right rail. */}
        </div>
      </div>

      {/* Zone Detail Panel */}
      <ZoneDetailPanel
        zone={selectedZone?.zone ?? null}
        open={!!selectedZone}
        onClose={() => setSelectedZone(null)}
        colors={selectedZone?.colors ?? { bg: "", border: "", text: "" }}
      />

      {/* Prompt Ingredients Editor */}
      <PromptIngredientsEditor
        open={showIngredientsEditor}
        onClose={() => setShowIngredientsEditor(false)}
        onConfirm={handleConfirmFromEditor}
        initialIngredients={promptIngredients || { brandColors: [], materials: [], layoutNotes: "", styleNotes: "", customDirectives: "" }}
        feedbackText={feedbackText}
        onFeedbackChange={setFeedbackText}
        isFirstRender={!floorPlanImage}
      />

      {/* Layout change confirmation dialog */}
      <Dialog open={!!pendingVariation} onOpenChange={(open) => { if (!open) setPendingVariation(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Layout Changed</DialogTitle>
            <DialogDescription>
              You switched layout options while viewing a render. Would you like to generate a new render based on this layout?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleLayoutChangeZones}>
              No, just show zones
            </Button>
            <Button onClick={handleLayoutChangeRender}>
              <Sparkles className="mr-2 h-4 w-4" />
              Yes, render this layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
