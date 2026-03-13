import { useState } from "react";
import { ChevronDown, ChevronRight, Brain, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BrandIntelligenceEntry } from "@/hooks/useClients";

interface IntelligenceSelectorProps {
  entries: BrandIntelligenceEntry[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (enabled: boolean) => void;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  visual_identity: { label: "Visual Identity", color: "bg-pink-100 text-pink-800" },
  strategic_voice: { label: "Strategic Voice", color: "bg-blue-100 text-blue-800" },
  vendor_material: { label: "Vendor & Material", color: "bg-amber-100 text-amber-800" },
  process_procedure: { label: "Process", color: "bg-green-100 text-green-800" },
  cost_benchmark: { label: "Cost Benchmark", color: "bg-emerald-100 text-emerald-800" },
  past_learning: { label: "Past Learning", color: "bg-purple-100 text-purple-800" },
};

export function IntelligenceSelector({
  entries,
  selectedIds,
  onToggle,
  onToggleAll,
}: IntelligenceSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (entries.length === 0) return null;

  const allSelected = entries.every((e) => selectedIds.has(e.id));
  const noneSelected = entries.every((e) => !selectedIds.has(e.id));
  const selectedCount = entries.filter((e) => selectedIds.has(e.id)).length;

  // Group entries by category
  const grouped: Record<string, BrandIntelligenceEntry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Brand Intelligence</span>
          <Badge variant="secondary" className="text-xs">
            {selectedCount}/{entries.length} active
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Toggle all */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Toggle which intelligence entries are used during generation
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => onToggleAll(noneSelected || !allSelected)}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          </div>

          {/* Entries grouped by category */}
          {Object.entries(grouped).map(([category, items]) => {
            const meta = CATEGORY_LABELS[category] || {
              label: category,
              color: "bg-gray-100 text-gray-800",
            };

            return (
              <div key={category} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px] font-normal", meta.color)}>
                    {meta.label}
                  </Badge>
                </div>
                {items.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => onToggle(entry.id)}
                      className={cn(
                        "flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-md transition-colors text-xs",
                        isSelected
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "bg-muted/30 hover:bg-muted/50 opacity-60"
                      )}
                    >
                      {isSelected ? (
                        <ToggleRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium">{entry.title}</span>
                        <span className="text-muted-foreground ml-1">
                          {entry.content.length > 80
                            ? entry.content.slice(0, 80) + "..."
                            : entry.content}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
