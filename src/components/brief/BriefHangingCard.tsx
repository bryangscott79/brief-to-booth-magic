// src/components/brief/BriefHangingCard.tsx
//
// Authoring UI for hanging elements (banners, rings, trusses, sails) on
// the Brief Review page. Emits NormalizedHangingElement[] via onChange;
// the host page maps that back into parsedBrief.hangingElements.
//
// Position fields are intentionally NOT edited here — that's the canvas
// layer (Task 5). This card just authors form/material/print metadata.

import { useState, type KeyboardEvent } from "react";
import { Plus, X, Wind } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NormalizedHangingElement, HangingShape } from "@/lib/normalizedBrief";

const SHAPES: { value: HangingShape; label: string }[] = [
  { value: "ring", label: "Ring" },
  { value: "rect", label: "Rectangle" },
  { value: "circle", label: "Circle" },
  { value: "oval", label: "Oval" },
  { value: "custom", label: "Custom" },
];

// ─── ChipList helper ──────────────────────────────────────────────────────────
// Renders chips with X-to-remove. Enter on the input below adds a chip
// (trimmed; empty adds skipped). Mirrors the TagList pattern in
// BriefReview.tsx but inlined here so the card is self-contained.

function ChipList({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };

  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <Badge
            key={`${v}-${i}`}
            variant="outline"
            className="text-xs pr-1 gap-1"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="hover:text-destructive"
              aria-label={`Delete chip ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </div>
  );
}

// ─── Sub-card for one element ─────────────────────────────────────────────────

function ElementSubCard({
  element,
  index,
  onChange,
  onRemove,
}: {
  element: NormalizedHangingElement;
  index: number;
  onChange: (next: NormalizedHangingElement) => void;
  onRemove: () => void;
}) {
  const patch = (p: Partial<NormalizedHangingElement>) =>
    onChange({ ...element, ...p });

  const patchDim = (
    key: keyof NormalizedHangingElement["dimensions"],
    value: number,
  ) =>
    onChange({
      ...element,
      dimensions: { ...element.dimensions, [key]: value },
    });

  return (
    <Card className="border-border/60">
      <CardContent className="p-3 space-y-3">
        {/* Name + remove */}
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Name (element #{index + 1})
            </Label>
            <Input
              value={element.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 mt-5 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove element ${index + 1}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Physical form */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Physical form (1-2 sentence description)
          </Label>
          <Textarea
            value={element.physicalForm}
            onChange={(e) => patch({ physicalForm: e.target.value })}
            placeholder="e.g. White LED-lit ring, 3ft diameter, internally backlit."
            className="min-h-[60px] text-sm"
          />
        </div>

        {/* Shape + drop */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Shape</Label>
            <Select
              value={element.shape}
              onValueChange={(v) => patch({ shape: v as HangingShape })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHAPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Suspension drop (ft below venue ceiling)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={element.suspensionDropFt}
              onChange={(e) =>
                patch({ suspensionDropFt: Number(e.target.value) })
              }
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Width (ft)</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={element.dimensions.width}
              onChange={(e) => patchDim("width", Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Depth (ft)</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={element.dimensions.depth}
              onChange={(e) => patchDim("depth", Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Thickness (ft)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={element.dimensions.thicknessFt}
              onChange={(e) => patchDim("thicknessFt", Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Chip groups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <ChipList
            label="Materials"
            values={element.materials}
            placeholder="e.g. brushed aluminum — press Enter"
            onChange={(next) => patch({ materials: next })}
          />
          <ChipList
            label="Surfaces"
            values={element.surfaces}
            placeholder="e.g. front: wordmark — press Enter"
            onChange={(next) => patch({ surfaces: next })}
          />
          <ChipList
            label="Lighting"
            values={element.lighting}
            placeholder="e.g. edge-lit perimeter — press Enter"
            onChange={(next) => patch({ lighting: next })}
          />
          <ChipList
            label="Printed graphics"
            values={element.printed}
            placeholder="e.g. front: logotype — press Enter"
            onChange={(next) => patch({ printed: next })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Default factory for a new element ────────────────────────────────────────

function makeDefaultElement(count: number): NormalizedHangingElement {
  return {
    id: `hang_${count}`,
    name: `Hanging element ${count + 1}`,
    physicalForm: "",
    shape: "ring",
    dimensions: { width: 3, depth: 3, thicknessFt: 1 },
    suspensionDropFt: 3,
    position: { x: 0, y: 0 },
    materials: [],
    surfaces: [],
    lighting: [],
    printed: [],
  };
}

// ─── Main card ────────────────────────────────────────────────────────────────

export interface BriefHangingCardProps {
  elements: NormalizedHangingElement[];
  onChange: (next: NormalizedHangingElement[]) => void;
}

export function BriefHangingCard({
  elements,
  onChange,
}: BriefHangingCardProps) {
  const handleAdd = () => {
    onChange([...elements, makeDefaultElement(elements.length)]);
  };

  const handleUpdate = (idx: number, next: NormalizedHangingElement) => {
    const updated = [...elements];
    updated[idx] = next;
    onChange(updated);
  };

  const handleRemove = (idx: number) => {
    onChange(elements.filter((_, i) => i !== idx));
  };

  return (
    <Card className="element-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wind className="h-4 w-4 text-primary" />
            Hanging Elements
            {elements.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {elements.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" /> Add hanging element
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {elements.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No hanging elements. The booth will render as floor-only. Click
            "Add hanging element" to author one.
          </p>
        ) : (
          <div className="space-y-3">
            {elements.map((el, idx) => (
              <ElementSubCard
                key={el.id || idx}
                element={el}
                index={idx}
                onChange={(next) => handleUpdate(idx, next)}
                onRemove={() => handleRemove(idx)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
