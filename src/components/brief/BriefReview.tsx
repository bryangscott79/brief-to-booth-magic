import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Check, Edit2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { OriginalBrief } from "./OriginalBrief";
import { useProject } from "@/hooks/useProjects";

export function BriefReview({ projectId }: { projectId: string | null }) {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { data: dbProject } = useProject(projectId ?? undefined);
  const brief = currentProject?.parsedBrief;

  if (!brief) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No brief data to review</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/upload")}>
          Upload a Brief
        </Button>
      </div>
    );
  }

  const handleConfirm = () => {
    setActiveStep("generate");
    navigate(projectId ? `/generate?project=${projectId}` : "/generate");
  };

  const sections = [
    {
      title: "Brand Information",
      confidence: "high",
      content: (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg">{brief.brand.name}</span>
            <Badge variant="secondary">{brief.brand.category}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{brief.brand.pov}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {brief.brand.personality.map((trait) => (
              <Badge key={trait} variant="outline" className="text-xs">
                {trait}
              </Badge>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Business Objectives",
      confidence: "high",
      content: (
        <div className="space-y-2">
          <p className="font-medium">{brief.objectives.primary}</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {brief.objectives.secondary.map((obj, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
                {obj}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: "Events & Shows",
      confidence: "high",
      content: (
        <div className="space-y-2">
          {brief.events.shows.map((show, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <span className="font-medium">{show.name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {show.location}
                </span>
              </div>
              {brief.events.primaryShow === show.name && (
                <Badge className="bg-primary/10 text-primary border-0">Primary</Badge>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Footprints",
      confidence: "high",
      content: (
        <div className="flex gap-3">
          {brief.spatial.footprints.map((fp, i) => (
            <div 
              key={i}
              className={cn(
                "px-4 py-3 rounded-lg border",
                fp.priority === "primary" 
                  ? "border-primary bg-primary/5" 
                  : "border-border"
              )}
            >
              <span className="font-semibold">{fp.size}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({fp.sqft} sq ft)
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Target Audiences",
      confidence: "high",
      content: (
        <div className="space-y-2">
          {brief.audiences.map((aud, i) => (
            <div key={i} className="flex items-start justify-between">
              <div>
                <span className="font-medium">{aud.name}</span>
                <p className="text-sm text-muted-foreground">{aud.description}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                P{aud.priority}
              </Badge>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Budget",
      confidence: brief.budget?.range?.min || brief.budget?.range?.max || brief.budget?.perShow ? "high" : "medium",
      content: (
        <div className="space-y-2">
          {/* Show range if available, otherwise fall back to perShow */}
          {brief.budget?.range?.min || brief.budget?.range?.max ? (
            <div className="text-2xl font-semibold">
              ${brief.budget.range!.min!.toLocaleString()}
              <span className="text-muted-foreground font-normal mx-2">–</span>
              ${brief.budget.range!.max!.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-2">total budget</span>
            </div>
          ) : brief.budget?.perShow ? (
            <div className="text-2xl font-semibold">
              ${brief.budget.perShow.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-2">per show</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No budget specified in brief</p>
          )}
          {brief.budget?.efficiencyNotes && (
            <p className="text-sm text-muted-foreground">{brief.budget.efficiencyNotes}</p>
          )}
          {(brief.budget?.inclusions?.length > 0 || brief.budget?.exclusions?.length > 0) && (
            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
              {brief.budget.inclusions?.length > 0 && (
                <span className="text-emerald-600">✓ {brief.budget.inclusions.join(", ")}</span>
              )}
              {brief.budget.exclusions?.length > 0 && (
                <span className="text-destructive">✗ {brief.budget.exclusions.join(", ")}</span>
              )}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Review Parsed Brief</h2>
          <p className="text-muted-foreground">
            Verify the extracted data before generating elements
          </p>
        </div>
        <Button onClick={handleConfirm} className="btn-glow">
          Confirm & Generate Elements
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Sections Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="element-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {section.confidence === "high" ? (
                    <Check className="h-4 w-4 text-status-complete" />
                  ) : (
                    <span className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-xs text-amber-600">!</span>
                    </span>
                  )}
                  {section.title}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>{section.content}</CardContent>
          </Card>
        ))}
      </div>

      {/* Creative Constraints */}
      <Card className="element-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="h-4 w-4 text-status-complete" />
            Creative Direction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">Embrace</h4>
              <div className="flex flex-wrap gap-1">
                {brief.creative.embrace.map((item) => (
                  <Badge key={item} variant="outline" className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-destructive mb-2">Avoid</h4>
              <div className="flex flex-wrap gap-1">
                {brief.creative.avoid.map((item) => (
                  <Badge key={item} variant="outline" className="bg-destructive/5 text-destructive border-destructive/20">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Deliverables */}
      {brief.requiredDeliverables?.length > 0 && (
        <Card className="element-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="h-4 w-4 text-status-complete" />
              Required Deliverables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1">
              {brief.requiredDeliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Timeline & Contacts */}
      {((brief as any).timeline?.proposalDue || (brief as any).contacts?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {(brief as any).timeline?.proposalDue && (
            <Card className="element-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-complete" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1 text-sm">
                  {(brief as any).timeline.proposalDue && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Proposal Due</dt>
                      <dd className="font-medium">{(brief as any).timeline.proposalDue}</dd>
                    </div>
                  )}
                  {(brief as any).timeline.deliveryDate && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Delivery</dt>
                      <dd className="font-medium">{(brief as any).timeline.deliveryDate}</dd>
                    </div>
                  )}
                  {(brief as any).timeline.notes && (
                    <p className="text-muted-foreground pt-1">{(brief as any).timeline.notes}</p>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {(brief as any).contacts?.length > 0 && (
            <Card className="element-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-complete" />
                  Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(brief as any).contacts.map((c: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{c.name}</span>
                      {c.title && <span className="text-muted-foreground ml-2">{c.title}</span>}
                      {c.email && <p className="text-muted-foreground text-xs">{c.email}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Original Brief */}
      <OriginalBrief
        briefText={currentProject?.rawBrief ?? dbProject?.brief_text ?? null}
        briefFileName={dbProject?.brief_file_name ?? null}
        briefFileUrl={(dbProject as any)?.brief_file_url ?? null}
      />
    </div>
  );
}
