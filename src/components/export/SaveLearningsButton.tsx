import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Brain, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBatchCreateIntelligence } from "@/hooks/useClients";
import { useProjectStore, ELEMENT_META } from "@/store/projectStore";
import type { ElementType } from "@/types/brief";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  visual_identity: "bg-pink-100 text-pink-800",
  strategic_voice: "bg-blue-100 text-blue-800",
  vendor_material: "bg-amber-100 text-amber-800",
  process_procedure: "bg-green-100 text-green-800",
  cost_benchmark: "bg-emerald-100 text-emerald-800",
  past_learning: "bg-purple-100 text-purple-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  visual_identity: "Visual Identity",
  strategic_voice: "Strategic Voice",
  vendor_material: "Vendor & Material",
  process_procedure: "Process",
  cost_benchmark: "Cost Benchmark",
  past_learning: "Past Learning",
};

interface ExtractedEntry {
  category: string;
  title: string;
  content: string;
  tags: string[];
}

interface SaveLearningsButtonProps {
  clientId: string | null;
  projectId: string | null;
}

export function SaveLearningsButton({ clientId, projectId }: SaveLearningsButtonProps) {
  const { currentProject } = useProjectStore();
  const { toast } = useToast();
  const batchCreate = useBatchCreateIntelligence();

  const [isExtracting, setIsExtracting] = useState(false);
  const [entries, setEntries] = useState<ExtractedEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isSaved, setIsSaved] = useState(false);

  if (!clientId) return null;

  const brief = currentProject?.parsedBrief;
  const elements = currentProject?.elements;

  const handleExtract = async () => {
    if (!brief || !elements || !projectId) return;

    setIsExtracting(true);
    setEntries([]);
    setIsSaved(false);

    try {
      // Build element summaries
      const elementSummaries = (Object.entries(elements) as [ElementType, any][])
        .filter(([_, el]) => el?.status === "complete" && el.data)
        .map(([type, el]) => {
          const meta = ELEMENT_META[type];
          const data = el.data;
          let dataSummary = "";
          if (data.title) dataSummary += data.title;
          if (data.description) dataSummary += ` — ${data.description.slice(0, 150)}`;
          return {
            type: meta?.title ?? type,
            title: data.title || undefined,
            dataSummary: dataSummary || undefined,
          };
        });

      // Collect feedback from past_learning entries already created by Phase 1E
      // We pass them to the extraction so it can factor them in
      const feedbackLog: Array<{ elementType: string; feedback: string }> = [];
      // (In future, could query brand_intelligence for source_project_id === projectId + source === 'feedback')

      const primarySize = brief.spatial?.footprints?.[0]?.size;
      const briefSummary = [
        brief.brand?.name && `Brand: ${brief.brand.name}`,
        brief.brand?.category && `Category: ${brief.brand.category}`,
        brief.objectives?.primary && `Objective: ${brief.objectives.primary}`,
        primarySize && `Size: ${primarySize}`,
        brief.creative?.coreStrategy && `Strategy: ${brief.creative.coreStrategy}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { data, error } = await supabase.functions.invoke("extract-learnings", {
        body: {
          clientName: brief.brand?.name || "Unknown Client",
          projectName: currentProject?.name || "Untitled Project",
          projectType: currentProject?.projectType || "trade_show_booth",
          boothSize: primarySize,
          briefSummary,
          elements: elementSummaries,
          feedbackLog,
        },
      });

      if (error) throw error;
      if (!data?.entries || !Array.isArray(data.entries)) {
        throw new Error("No entries returned");
      }

      setEntries(data.entries);
      // Select all by default
      setSelected(new Set(data.entries.map((_: ExtractedEntry, i: number) => i)));
    } catch (err: any) {
      console.error("Failed to extract learnings:", err);
      toast({
        title: "Failed to extract learnings",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleToggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSave = () => {
    if (!clientId || selected.size === 0) return;

    const toSave = entries
      .filter((_, i) => selected.has(i))
      .map((e) => ({
        client_id: clientId,
        category: e.category as any,
        title: e.title,
        content: e.content,
        tags: e.tags,
        source: "ai_extracted" as const,
        confidence_score: null,
        source_project_id: projectId,
        is_approved: false,
        approved_at: null,
      }));

    batchCreate.mutate(toSave, {
      onSuccess: () => {
        setIsSaved(true);
        toast({
          title: "Learnings saved",
          description: `${toSave.length} entries added to client intelligence (pending approval).`,
        });
      },
    });
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Save Learnings to Client Profile
          </CardTitle>
          {entries.length === 0 && !isSaved && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExtract}
              disabled={isExtracting || !brief || !elements}
            >
              {isExtracting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {isExtracting ? "Analyzing..." : "Extract Learnings"}
            </Button>
          )}
          {isSaved && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </Badge>
          )}
        </div>
      </CardHeader>

      {entries.length > 0 && !isSaved && (
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select which learnings to save. They'll be added as unapproved intelligence entries for review in the Clients panel.
          </p>

          <div className="space-y-2">
            {entries.map((entry, i) => (
              <label
                key={i}
                className={cn(
                  "flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors",
                  selected.has(i)
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "bg-muted/30 hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={selected.has(i)}
                  onCheckedChange={() => handleToggle(i)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge
                      className={cn(
                        "text-[10px] font-normal",
                        CATEGORY_COLORS[entry.category] || "bg-gray-100 text-gray-800"
                      )}
                    >
                      {CATEGORY_LABELS[entry.category] || entry.category}
                    </Badge>
                    <span className="text-sm font-medium">{entry.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.content}</p>
                  {entry.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} of {entries.length} selected
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={selected.size === 0 || batchCreate.isPending}
            >
              {batchCreate.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}
              Save {selected.size} Entries
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
