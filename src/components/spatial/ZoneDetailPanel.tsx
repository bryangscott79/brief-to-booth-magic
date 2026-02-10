import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/store/projectStore";
import { Sparkles, Users, Monitor, Layers, MapPin, Zap } from "lucide-react";

interface ZoneDetailPanelProps {
  zone: any | null;
  open: boolean;
  onClose: () => void;
  colors: { bg: string; border: string; text: string };
}

/** Maps spatial zone names/ids to relevant strategic element data */
function useZoneContent(zone: any | null) {
  const { currentProject } = useProjectStore();
  if (!zone || !currentProject) return [];

  const elements = currentProject.elements;
  const zoneName = (zone.name || "").toLowerCase();
  const sections: Array<{
    icon: React.ReactNode;
    title: string;
    elementSource: string;
    items: Array<{ label: string; detail: string }>;
  }> = [];

  // Hero Experience Zone → Interactive Mechanics
  if (zoneName.includes("hero") || zoneName.includes("experience zone")) {
    const im = elements.interactiveMechanics?.data;
    if (im?.hero) {
      const hero = im.hero;
      sections.push({
        icon: <Zap className="h-4 w-4" />,
        title: "Hero Installation",
        elementSource: "Interactive Mechanics",
        items: [
          { label: hero.name, detail: hero.concept },
          ...(hero.physicalForm ? [
            { label: "Structure", detail: hero.physicalForm.structure },
            { label: "Materials", detail: hero.physicalForm.materials?.join(", ") || "" },
            { label: "Dimensions", detail: hero.physicalForm.dimensions },
          ] : []),
          ...(hero.technicalSpecs ? [
            { label: "Display Tech", detail: hero.technicalSpecs.displayTechnology },
            { label: "Capacity", detail: hero.technicalSpecs.simultaneousUsers },
          ] : []),
        ].filter(i => i.detail),
      });
    }
    if (im?.secondary?.length) {
      const heroSecondary = im.secondary.filter((s: any) =>
        s.location?.toLowerCase().includes("hero") || s.location?.toLowerCase().includes("central")
      );
      if (heroSecondary.length) {
        sections.push({
          icon: <Sparkles className="h-4 w-4" />,
          title: "Secondary Interactions",
          elementSource: "Interactive Mechanics",
          items: heroSecondary.map((s: any) => ({ label: s.name, detail: s.description })),
        });
      }
    }
  }

  // Storytelling Theatre → Digital Storytelling
  if (zoneName.includes("storytelling") || zoneName.includes("theatre") || zoneName.includes("theater") || zoneName.includes("digital")) {
    const ds = elements.digitalStorytelling?.data;
    if (ds) {
      if (ds.audienceTracks?.length) {
        sections.push({
          icon: <Monitor className="h-4 w-4" />,
          title: "Audience Content Tracks",
          elementSource: "Digital Storytelling",
          items: ds.audienceTracks.map((t: any) => ({
            label: t.trackName,
            detail: `${t.format} — ${t.contentFocus} (${t.tone})`,
          })),
        });
      }
      if (ds.contentModules?.length) {
        sections.push({
          icon: <Layers className="h-4 w-4" />,
          title: "Content Modules",
          elementSource: "Digital Storytelling",
          items: ds.contentModules.map((m: any) => ({
            label: m.title,
            detail: `${m.description} (${m.duration})`,
          })),
        });
      }
    }
  }

  // Meeting Pods → Human Connection
  if (zoneName.includes("meeting") || zoneName.includes("pod") || zoneName.includes("lounge") || zoneName.includes("connection")) {
    const hc = elements.humanConnection?.data;
    if (hc?.configs?.[0]?.zones) {
      sections.push({
        icon: <Users className="h-4 w-4" />,
        title: "Meeting Configurations",
        elementSource: "Human Connection",
        items: hc.configs[0].zones.map((z: any) => ({
          label: `${z.name} (${z.capacity})`,
          detail: z.description,
        })),
      });
    }
    if (hc?.operational) {
      sections.push({
        icon: <Users className="h-4 w-4" />,
        title: "Operational Details",
        elementSource: "Human Connection",
        items: [
          { label: "Booking", detail: hc.operational.booking },
          { label: "Content Support", detail: hc.operational.contentSupport },
          { label: "Transitions", detail: hc.operational.transitionDesign },
        ].filter(i => i.detail),
      });
    }
  }

  // Adjacent Activations / VIP Lounge → Adjacent Activations
  if (zoneName.includes("adjacent") || zoneName.includes("vip") || zoneName.includes("activation")) {
    const aa = elements.adjacentActivations?.data;
    if (aa?.activations?.length) {
      sections.push({
        icon: <MapPin className="h-4 w-4" />,
        title: "Adjacent Activations",
        elementSource: "Adjacent Activations",
        items: aa.activations.map((a: any) => ({
          label: `${a.name} (${a.type})`,
          detail: `${a.format} — Capacity: ${a.capacity}`,
        })),
      });
    }
  }

  // Open Engagement / Welcome → Experience Framework visitor journey
  if (zoneName.includes("engagement") || zoneName.includes("open") || zoneName.includes("welcome") || zoneName.includes("desk") || zoneName.includes("info")) {
    const ef = elements.experienceFramework?.data;
    if (ef?.visitorJourney?.length) {
      sections.push({
        icon: <Sparkles className="h-4 w-4" />,
        title: "Visitor Journey Stages",
        elementSource: "Experience Framework",
        items: ef.visitorJourney.map((s: any) => ({
          label: s.stage,
          detail: `${s.description} — Touchpoints: ${s.touchpoints?.join(", ")}`,
        })),
      });
    }
    if (ef?.audienceRouting?.length) {
      sections.push({
        icon: <Users className="h-4 w-4" />,
        title: "Audience Routing",
        elementSource: "Experience Framework",
        items: ef.audienceRouting.map((r: any) => ({
          label: r.persona,
          detail: `Path: ${r.pathway?.join(" → ")} (${r.timing})`,
        })),
      });
    }
  }

  // If no specific match, show zone requirements and notes
  if (sections.length === 0) {
    const items: Array<{ label: string; detail: string }> = [];
    if (zone.requirements?.length) {
      zone.requirements.forEach((r: string) => items.push({ label: "Requirement", detail: r }));
    }
    if (zone.notes) {
      items.push({ label: "Notes", detail: zone.notes });
    }
    if (zone.adjacencies?.length) {
      items.push({ label: "Adjacencies", detail: zone.adjacencies.join(", ") });
    }
    if (items.length) {
      sections.push({
        icon: <Layers className="h-4 w-4" />,
        title: "Zone Details",
        elementSource: "Spatial Strategy",
        items,
      });
    }
  }

  return sections;
}

export function ZoneDetailPanel({ zone, open, onClose, colors }: ZoneDetailPanelProps) {
  const sections = useZoneContent(zone);

  if (!zone) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded border-2"
              style={{ backgroundColor: colors.bg, borderColor: colors.border }}
            />
            <SheetTitle className="text-lg">{zone.name}</SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="secondary">{zone.sqft} sq ft</Badge>
            <Badge variant="outline">{zone.percentage}% of floor</Badge>
          </SheetDescription>
        </SheetHeader>

        {/* Zone requirements */}
        {zone.notes && (
          <p className="text-sm text-muted-foreground mb-4">{zone.notes}</p>
        )}

        {zone.requirements?.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Requirements</h4>
            <div className="flex flex-wrap gap-1.5">
              {zone.requirements.map((req: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{req}</Badge>
              ))}
            </div>
          </div>
        )}

        <Separator className="my-4" />

        {/* Content strategy sections */}
        {sections.length > 0 ? (
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Content Strategy for this Zone
            </h4>
            {sections.map((section, sIdx) => (
              <Card key={sIdx} className="border-border/50">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {section.icon}
                      {section.title}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {section.elementSource}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2.5">
                  {section.items.map((item, iIdx) => (
                    <div key={iIdx} className="text-sm">
                      <span className="font-medium">{item.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No content strategy items mapped to this zone yet.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
