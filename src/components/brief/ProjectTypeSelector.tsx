import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_PROJECT_TYPES, type ProjectTypeId } from "@/lib/projectTypes";
import type { CustomProjectType } from "@/hooks/useCustomProjectTypes";
import { CheckCircle2, Sparkles, Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ProjectTypeSelectorProps {
  selected: ProjectTypeId | string | null;
  onSelect: (id: string) => void;
  customTypes?: CustomProjectType[];
  aiSuggestion?: AiTypeSuggestion | null;
  onConfirmAiSuggestion?: (suggestion: AiTypeSuggestion) => void;
  onDismissAiSuggestion?: () => void;
  onAddCustomType?: (type: NewCustomType) => void;
  isDetecting?: boolean;
}

export interface AiTypeSuggestion {
  type_id: string;
  label: string;
  tagline: string;
  description: string;
  render_context: string;
  icon: string;
  confidence: number;
}

export interface NewCustomType {
  type_id: string;
  label: string;
  short_label?: string;
  tagline?: string;
  description?: string;
  icon?: string;
  render_context?: string;
}

export function ProjectTypeSelector({
  selected,
  onSelect,
  customTypes = [],
  aiSuggestion,
  onConfirmAiSuggestion,
  onDismissAiSuggestion,
  onAddCustomType,
  isDetecting = false,
}: ProjectTypeSelectorProps) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showAllBuiltIn, setShowAllBuiltIn] = useState(false);
  const [newType, setNewType] = useState<NewCustomType>({
    type_id: "",
    label: "",
    icon: "🏷️",
  });

  const confirmedCustomTypes = customTypes.filter((t) => t.confirmed_by_user);
  const pendingCustomTypes = customTypes.filter((t) => t.is_ai_detected && !t.confirmed_by_user);
  const builtInTypes = showAllBuiltIn ? ALL_PROJECT_TYPES : ALL_PROJECT_TYPES.slice(0, 3);

  const slugify = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleAddCustom = () => {
    if (!newType.label.trim()) return;
    const type_id = newType.type_id || slugify(newType.label);
    onAddCustomType?.({ ...newType, type_id });
    setNewType({ type_id: "", label: "", icon: "🏷️" });
    setShowCustomForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">What are you designing?</h2>
        <p className="text-muted-foreground text-sm">
          Choose a type, or upload your brief first and let AI suggest the right category.
        </p>
      </div>

      {/* AI detection status */}
      {isDetecting && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          Analyzing brief to detect project type…
        </div>
      )}

      {/* AI suggestion banner */}
      {aiSuggestion && (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">AI-detected project type</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on your brief, this looks like:
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {Math.round(aiSuggestion.confidence * 100)}% confidence
            </Badge>
          </div>

          <div className="flex items-start gap-3 bg-background/60 rounded-lg p-3">
            <span className="text-2xl leading-none">{aiSuggestion.icon}</span>
            <div>
              <p className="font-bold text-sm">{aiSuggestion.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{aiSuggestion.tagline}</p>
              <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                {aiSuggestion.description}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-9"
              onClick={() => {
                onConfirmAiSuggestion?.(aiSuggestion);
                onSelect(aiSuggestion.type_id);
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Use this type
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={onDismissAiSuggestion}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Custom / saved types */}
      {confirmedCustomTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Your saved types
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {confirmedCustomTypes.map((type) => {
              const isSelected = selected === type.type_id;
              return (
                <TypeCard
                  key={type.id}
                  id={type.type_id}
                  label={type.label}
                  tagline={type.tagline ?? ""}
                  description={type.description ?? ""}
                  icon={type.icon ?? "🏷️"}
                  accentColor={type.accent_color ?? "hsl(220 70% 55%)"}
                  elementCount={8}
                  isSelected={isSelected}
                  onSelect={onSelect}
                  badge="Custom"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Pending AI-detected types waiting for confirmation */}
      {pendingCustomTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Previously detected (awaiting confirmation)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingCustomTypes.map((type) => (
              <div key={type.id} className="relative">
                <TypeCard
                  id={type.type_id}
                  label={type.label}
                  tagline={type.tagline ?? ""}
                  description={type.description ?? ""}
                  icon={type.icon ?? "🏷️"}
                  accentColor="hsl(220 70% 55%)"
                  elementCount={8}
                  isSelected={selected === type.type_id}
                  onSelect={onSelect}
                  badge="Unconfirmed"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in types */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Standard types
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInTypes.map((type) => (
            <TypeCard
              key={type.id}
              id={type.id}
              label={type.label}
              tagline={type.tagline}
              description={type.description}
              icon={type.icon}
              accentColor={type.accentColor}
              elementCount={type.elements.length}
              isSelected={selected === type.id}
              onSelect={onSelect}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5 mt-1"
          onClick={() => setShowAllBuiltIn((v) => !v)}
        >
          {showAllBuiltIn ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show fewer types
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show {ALL_PROJECT_TYPES.length - 3} more standard types
            </>
          )}
        </Button>
      </div>

      {/* Add custom type */}
      {onAddCustomType && (
        <div className="pt-2">
          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-2"
            >
              <Plus className="h-4 w-4" />
              Add a custom project type
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5 space-y-4">
              <p className="text-sm font-semibold">New project type</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-xs">Icon (emoji)</Label>
                  <Input
                    value={newType.icon}
                    onChange={(e) => setNewType((p) => ({ ...p, icon: e.target.value }))}
                    className="h-9 w-16"
                    maxLength={4}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Type name *</Label>
                  <Input
                    placeholder="e.g. Festival Stage Design"
                    value={newType.label}
                    onChange={(e) =>
                      setNewType((p) => ({
                        ...p,
                        label: e.target.value,
                        type_id: slugify(e.target.value),
                      }))
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Tagline</Label>
                  <Input
                    placeholder="One-line description..."
                    value={newType.tagline ?? ""}
                    onChange={(e) => setNewType((p) => ({ ...p, tagline: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="Describe what this project type covers..."
                    value={newType.description ?? ""}
                    onChange={(e) => setNewType((p) => ({ ...p, description: e.target.value }))}
                    className="resize-none text-sm"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Render context (for AI)</Label>
                  <Input
                    placeholder="e.g. outdoor festival main stage with crowd..."
                    value={newType.render_context ?? ""}
                    onChange={(e) => setNewType((p) => ({ ...p, render_context: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddCustom}
                  disabled={!newType.label.trim()}
                  className="h-9"
                >
                  Save type
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCustomForm(false)}
                  className="h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border px-5 py-4 text-sm animate-fade-in bg-muted/30">
          <span className="font-semibold text-foreground">Selected: </span>
          <span className="text-muted-foreground">
            {[...ALL_PROJECT_TYPES, ...confirmedCustomTypes.map(t => ({
              id: t.type_id,
              tagline: t.tagline ?? "",
            }))].find(
              (t) => ("id" in t ? t.id : (t as any).type_id) === selected
            )?.tagline ?? selected}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Shared card component ────────────────────────────────────────────────────
function TypeCard({
  id,
  label,
  tagline,
  description,
  icon,
  accentColor,
  elementCount,
  isSelected,
  onSelect,
  badge,
}: {
  id: string;
  label: string;
  tagline: string;
  description: string;
  icon: string;
  accentColor: string;
  elementCount: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  badge?: string;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={cn(
        "relative text-left rounded-2xl border-2 p-5 transition-all duration-200 group",
        "hover:-translate-y-0.5 hover:shadow-lg",
        isSelected
          ? "border-primary bg-primary/8 shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
          : "border-border bg-card hover:border-primary/40"
      )}
    >
      {isSelected && (
        <div className="absolute top-3 right-3">
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
      )}
      {badge && !isSelected && (
        <div className="absolute top-3 right-3">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{badge}</Badge>
        </div>
      )}

      <div
        className="absolute top-0 left-5 right-5 h-0.5 rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: accentColor, ...(isSelected ? { opacity: 1 } : {}) }}
      />

      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none mt-0.5">{icon}</span>
        <div className="min-w-0">
          <div className="font-bold text-sm leading-tight">{label}</div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 opacity-70"
            style={{ color: accentColor }}
          >
            {elementCount} strategic elements
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {description || tagline}
      </p>
    </button>
  );
}
