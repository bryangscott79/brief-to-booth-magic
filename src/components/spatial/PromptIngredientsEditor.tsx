import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, X, Palette, Layers, FileText, Wand2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromptIngredients {
  brandColors: { name: string; hex: string; usage: string }[];
  materials: { material: string; feel: string; application: string }[];
  layoutNotes: string;
  customDirectives: string;
  styleNotes: string;
}

interface PromptIngredientsEditorProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (ingredients: PromptIngredients, feedback: string) => void;
  initialIngredients: PromptIngredients;
  feedbackText: string;
  onFeedbackChange: (v: string) => void;
  isFirstRender: boolean;
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-sm border border-border flex-shrink-0"
      style={{ backgroundColor: hex }}
    />
  );
}

export function PromptIngredientsEditor({
  open,
  onClose,
  onConfirm,
  initialIngredients,
  feedbackText,
  onFeedbackChange,
  isFirstRender,
}: PromptIngredientsEditorProps) {
  const [ingredients, setIngredients] = useState<PromptIngredients>(initialIngredients);
  const [activeSection, setActiveSection] = useState<"colors" | "materials" | "layout" | "directives">("colors");
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#000000");
  const [newColorUsage, setNewColorUsage] = useState("");

  // Reset when opened with new initial values
  const handleOpen = () => {
    setIngredients(initialIngredients);
    setActiveSection("colors");
  };

  const updateMaterial = (idx: number, field: keyof PromptIngredients["materials"][0], value: string) => {
    setIngredients(prev => ({
      ...prev,
      materials: prev.materials.map((m, i) => i === idx ? { ...m, [field]: value } : m),
    }));
  };

  const removeMaterial = (idx: number) => {
    setIngredients(prev => ({ ...prev, materials: prev.materials.filter((_, i) => i !== idx) }));
  };

  const addMaterial = () => {
    setIngredients(prev => ({
      ...prev,
      materials: [...prev.materials, { material: "New Material", feel: "Clean", application: "Walls" }],
    }));
  };

  const removeColor = (idx: number) => {
    setIngredients(prev => ({ ...prev, brandColors: prev.brandColors.filter((_, i) => i !== idx) }));
  };

  const addColor = () => {
    if (!newColorName.trim()) return;
    setIngredients(prev => ({
      ...prev,
      brandColors: [...prev.brandColors, { name: newColorName, hex: newColorHex, usage: newColorUsage || "Accent" }],
    }));
    setNewColorName("");
    setNewColorHex("#000000");
    setNewColorUsage("");
  };

  const sections = [
    { id: "colors" as const, label: "Brand Colors", icon: Palette, count: ingredients.brandColors.length },
    { id: "materials" as const, label: "Materials", icon: Layers, count: ingredients.materials.length },
    { id: "layout" as const, label: "Layout Notes", icon: FileText, count: undefined },
    { id: "directives" as const, label: "Custom Directives", icon: Wand2, count: undefined },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {isFirstRender ? "Review Prompt Ingredients" : "Edit & Regenerate"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Review and edit the content that will be compiled into your floor plan render prompt.
          </p>
        </DialogHeader>

        <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
          {/* Section nav */}
          <div className="flex flex-col gap-1 w-44 flex-shrink-0">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                  activeSection === s.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <s.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1">{s.label}</span>
                {s.count !== undefined && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                    {s.count}
                  </Badge>
                )}
              </button>
            ))}
            <div className="border-t border-border my-2" />
            <button
              onClick={() => setActiveSection("directives")}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs">All sections reviewed</span>
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
            {activeSection === "colors" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Brand colors will be used in the floor plan key and zone fills. At least one color is recommended.
                </p>
                <div className="space-y-2">
                  {ingredients.brandColors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                      <ColorSwatch hex={c.hex} />
                      <input
                        type="color"
                        value={c.hex}
                        onChange={e => setIngredients(prev => ({
                          ...prev,
                          brandColors: prev.brandColors.map((col, ci) => ci === i ? { ...col, hex: e.target.value } : col),
                        }))}
                        className="w-7 h-7 rounded border cursor-pointer"
                        title="Pick color"
                      />
                      <input
                        className="flex-1 text-sm bg-transparent border-none outline-none font-medium"
                        value={c.name}
                        onChange={e => setIngredients(prev => ({
                          ...prev,
                          brandColors: prev.brandColors.map((col, ci) => ci === i ? { ...col, name: e.target.value } : col),
                        }))}
                        placeholder="Color name"
                      />
                      <input
                        className="w-28 text-xs bg-transparent border-none outline-none text-muted-foreground"
                        value={c.usage}
                        onChange={e => setIngredients(prev => ({
                          ...prev,
                          brandColors: prev.brandColors.map((col, ci) => ci === i ? { ...col, usage: e.target.value } : col),
                        }))}
                        placeholder="Usage (e.g. Accent)"
                      />
                      <button onClick={() => removeColor(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 items-center p-2 rounded-md border border-dashed">
                  <input
                    type="color"
                    value={newColorHex}
                    onChange={e => setNewColorHex(e.target.value)}
                    className="w-7 h-7 rounded border cursor-pointer"
                  />
                  <Input
                    className="flex-1 h-7 text-sm"
                    placeholder="Color name (e.g. Samsung Blue)"
                    value={newColorName}
                    onChange={e => setNewColorName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addColor()}
                  />
                  <Input
                    className="w-28 h-7 text-xs"
                    placeholder="Usage"
                    value={newColorUsage}
                    onChange={e => setNewColorUsage(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addColor()}
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={addColor}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {activeSection === "materials" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Materials define the hatching and legend in the floor plan. Edit or add materials to update the key.
                </p>
                <div className="space-y-2">
                  {ingredients.materials.map((m, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 p-2 rounded-md border bg-muted/30 items-start">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Material</label>
                        <Input
                          className="h-7 text-xs"
                          value={m.material}
                          onChange={e => updateMaterial(i, "material", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Feel / Finish</label>
                        <Input
                          className="h-7 text-xs"
                          value={m.feel}
                          onChange={e => updateMaterial(i, "feel", e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground mb-1 block">Application</label>
                          <Input
                            className="h-7 text-xs"
                            value={m.application}
                            onChange={e => updateMaterial(i, "application", e.target.value)}
                          />
                        </div>
                        <button onClick={() => removeMaterial(i)} className="mt-5 text-muted-foreground hover:text-destructive flex-shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addMaterial} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Material
                </Button>
              </div>
            )}

            {activeSection === "layout" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Layout notes describe structural requirements and flow priorities. These are included verbatim in the render prompt.
                </p>
                <Textarea
                  rows={8}
                  className="resize-none text-sm font-mono"
                  value={ingredients.layoutNotes}
                  onChange={e => setIngredients(prev => ({ ...prev, layoutNotes: e.target.value }))}
                  placeholder="e.g. Meeting rooms must be fully enclosed. Entry from south aisle only. Hero installation at center..."
                />
              </div>
            )}

            {activeSection === "directives" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Style Overrides</label>
                  <Textarea
                    rows={3}
                    className="resize-none text-sm"
                    value={ingredients.styleNotes}
                    onChange={e => setIngredients(prev => ({ ...prev, styleNotes: e.target.value }))}
                    placeholder="e.g. Use clean Scandinavian aesthetic, emphasize negative space, avoid clutter..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {isFirstRender ? "Additional Instructions" : "Regeneration Feedback"}
                  </label>
                  <Textarea
                    rows={4}
                    className="resize-none text-sm"
                    value={feedbackText}
                    onChange={e => onFeedbackChange(e.target.value)}
                    placeholder={
                      isFirstRender
                        ? "Any specific instructions for this render..."
                        : "What should change in the next version? e.g. Larger meeting rooms, more aisle clearance..."
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-4 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(ingredients, feedbackText)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {isFirstRender ? "Generate Floor Plan" : "Regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
