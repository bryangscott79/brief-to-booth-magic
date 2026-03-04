/**
 * SlideEditor — Pre-export slide customization UI
 *
 * Allows users to reorder, toggle, and edit slide titles before
 * generating the final presentation. Works with PresentationTemplates.
 */

import { useState, useCallback } from "react";
import {
  GripVertical,
  Eye,
  EyeOff,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Lock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRESENTATION_TEMPLATES,
  getTemplate,
  type PresentationTemplate,
  type SlideConfig,
} from "@/lib/presentationTemplates";

// ============================================
// PROPS
// ============================================

interface SlideEditorProps {
  /** Callback when user confirms template and customizations */
  onConfirm: (template: PresentationTemplate) => void;
  /** Callback to cancel */
  onCancel: () => void;
  /** Available section IDs (based on what data exists in the project) */
  availableSections?: string[];
}

// ============================================
// COMPONENT
// ============================================

export function SlideEditor({ onConfirm, onCancel, availableSections }: SlideEditorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("full-proposal");
  const [customSlides, setCustomSlides] = useState<SlideConfig[]>(
    () => getTemplate("full-proposal")?.slides || []
  );
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Switch template
  const handleTemplateSelect = (templateId: string) => {
    const template = getTemplate(templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setCustomSlides(template.slides);
    setEditingSlideId(null);
  };

  // Toggle slide inclusion
  const toggleSlide = (sectionId: string) => {
    setCustomSlides((prev) =>
      prev.map((s) =>
        s.sectionId === sectionId && !s.required ? { ...s, included: !s.included } : s
      )
    );
  };

  // Start editing a slide title
  const startEditing = (slide: SlideConfig) => {
    setEditingSlideId(slide.sectionId);
    setEditTitle(slide.title);
  };

  // Commit title edit
  const commitEdit = () => {
    if (editingSlideId && editTitle.trim()) {
      setCustomSlides((prev) =>
        prev.map((s) =>
          s.sectionId === editingSlideId ? { ...s, title: editTitle.trim() } : s
        )
      );
    }
    setEditingSlideId(null);
    setEditTitle("");
  };

  // Cancel title edit
  const cancelEdit = () => {
    setEditingSlideId(null);
    setEditTitle("");
  };

  // Move slide up/down
  const moveSlide = useCallback((sectionId: string, direction: "up" | "down") => {
    setCustomSlides((prev) => {
      const idx = prev.findIndex((s) => s.sectionId === sectionId);
      if (idx === -1) return prev;

      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const newSlides = [...prev];
      [newSlides[idx], newSlides[targetIdx]] = [newSlides[targetIdx], newSlides[idx]];
      return newSlides;
    });
  }, []);

  // Build and return the customized template
  const handleConfirm = () => {
    const baseTemplate = getTemplate(selectedTemplateId);
    if (!baseTemplate) return;
    const customized: PresentationTemplate = { ...baseTemplate, slides: customSlides };
    onConfirm(customized);
  };

  const activeCount = customSlides.filter((s) => s.included).length;
  const selectedTemplate = PRESENTATION_TEMPLATES.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      <div>
        <label className="text-sm font-medium mb-3 block">Presentation Template</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESENTATION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={cn(
                "p-4 rounded-lg border text-left transition-all",
                selectedTemplateId === template.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{template.icon}</span>
                <span className="font-medium text-sm">{template.name}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
              <div className="mt-2">
                <Badge variant="outline" className="text-xs">
                  {template.slideRange.min}-{template.slideRange.max} slides
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Slide List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Customize Slides
            </span>
            <Badge variant="secondary">{activeCount} slides active</Badge>
          </CardTitle>
          <CardDescription>
            Reorder, rename, or toggle slides. Required slides cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {customSlides.map((slide, index) => {
              const isAvailable = !availableSections || availableSections.includes(slide.sectionId);
              const isEditing = editingSlideId === slide.sectionId;

              return (
                <div
                  key={slide.sectionId}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg transition-colors group",
                    slide.included ? "bg-card" : "bg-muted/30 opacity-60",
                    !isAvailable && "opacity-40"
                  )}
                >
                  {/* Drag handle (visual only — real DnD would need react-dnd) */}
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                  {/* Slide number */}
                  <span className="text-xs text-muted-foreground w-6 text-center shrink-0">
                    {slide.included ? customSlides.filter((s, i) => s.included && i <= index).length : "–"}
                  </span>

                  {/* Title (editable) */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={commitEdit}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cancelEdit}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{slide.title}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startEditing(slide)}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Type badge */}
                  <Badge variant="outline" className="text-xs shrink-0">
                    {slide.type}
                  </Badge>

                  {/* Move buttons */}
                  <div className="flex flex-col shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => moveSlide(slide.sectionId, "up")}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => moveSlide(slide.sectionId, "down")}
                      disabled={index === customSlides.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Toggle / Lock */}
                  {slide.required ? (
                    <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => toggleSlide(slide.sectionId)}
                    >
                      {slide.included ? (
                        <Eye className="h-4 w-4 text-primary" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Confirm / Cancel */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {activeCount} slides using {selectedTemplate?.name} template
          </span>
          <Button onClick={handleConfirm} className="btn-glow">
            Generate Presentation
          </Button>
        </div>
      </div>
    </div>
  );
}
