import { useState, useEffect } from "react";
import {
  useBrandGuidelines,
  useUpsertBrandGuidelines,
} from "@/hooks/useBrandGuidelines";
import type { BrandGuidelines } from "@/types/brief";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Save,
  Palette,
  Type,
  Image,
  MessageSquare,
  Gem,
  FileImage,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type ColorEntry = { hex: string; name: string; usage: string };
type ForbiddenColor = { hex: string; name: string };

interface FormState {
  colorSystem: {
    primary: ColorEntry[];
    secondary: ColorEntry[];
    accent: ColorEntry[];
    forbidden: ForbiddenColor[];
  };
  typography: {
    primaryTypeface: string;
    secondaryTypeface: string;
    sizeScale: string;
    usageRules: string;
  };
  logoRules: {
    clearSpace: string;
    minSize: string;
    forbiddenTreatments: string[];
    usageNotes: string;
  };
  photographyStyle: {
    style: string;
    dos: string[];
    donts: string[];
  };
  toneOfVoice: {
    description: string;
    messagingPillars: string[];
    taglines: string[];
  };
  materialsFinishes: {
    preferred: string[];
    forbidden: string[];
    finishNotes: string;
  };
}

function getDefaultForm(): FormState {
  return {
    colorSystem: { primary: [], secondary: [], accent: [], forbidden: [] },
    typography: {
      primaryTypeface: "",
      secondaryTypeface: "",
      sizeScale: "",
      usageRules: "",
    },
    logoRules: {
      clearSpace: "",
      minSize: "",
      forbiddenTreatments: [],
      usageNotes: "",
    },
    photographyStyle: { style: "", dos: [], donts: [] },
    toneOfVoice: { description: "", messagingPillars: [], taglines: [] },
    materialsFinishes: { preferred: [], forbidden: [], finishNotes: "" },
  };
}

function guidelinesToForm(g: BrandGuidelines): FormState {
  return {
    colorSystem: g.colorSystem ?? {
      primary: [],
      secondary: [],
      accent: [],
      forbidden: [],
    },
    typography: g.typography ?? {
      primaryTypeface: "",
      secondaryTypeface: "",
      sizeScale: "",
      usageRules: "",
    },
    logoRules: g.logoRules ?? {
      clearSpace: "",
      minSize: "",
      forbiddenTreatments: [],
      usageNotes: "",
    },
    photographyStyle: g.photographyStyle ?? {
      style: "",
      dos: [],
      donts: [],
    },
    toneOfVoice: g.toneOfVoice ?? {
      description: "",
      messagingPillars: [],
      taglines: [],
    },
    materialsFinishes: g.materialsFinishes ?? {
      preferred: [],
      forbidden: [],
      finishNotes: "",
    },
  };
}

// ─── List Manager ────────────────────────────────────────────────────────────

function StringList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setNewItem("");
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
          placeholder={placeholder ?? "Add item..."}
          className="text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          disabled={!newItem.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Color Row Manager ───────────────────────────────────────────────────────

function ColorList({
  label,
  items,
  onChange,
  showUsage,
}: {
  label: string;
  items: ColorEntry[] | ForbiddenColor[];
  onChange: (items: ColorEntry[] | ForbiddenColor[]) => void;
  showUsage?: boolean;
}) {
  const addColor = () => {
    const newColor = showUsage
      ? { hex: "#000000", name: "", usage: "" }
      : { hex: "#000000", name: "" };
    onChange([...items, newColor as ColorEntry & ForbiddenColor]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={addColor}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      {items.map((color, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="color"
            value={color.hex}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = { ...updated[i], hex: e.target.value };
              onChange(updated);
            }}
            className="w-10 h-9 p-1 cursor-pointer"
          />
          <Input
            value={color.hex}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = { ...updated[i], hex: e.target.value };
              onChange(updated);
            }}
            className="w-24 font-mono text-xs"
            placeholder="#000000"
          />
          <Input
            value={color.name}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = { ...updated[i], name: e.target.value };
              onChange(updated);
            }}
            className="flex-1 text-sm"
            placeholder="Color name"
          />
          {showUsage && "usage" in color && (
            <Input
              value={(color as ColorEntry).usage}
              onChange={(e) => {
                const updated = [...items] as ColorEntry[];
                updated[i] = { ...updated[i], usage: e.target.value };
                onChange(updated);
              }}
              className="flex-1 text-sm"
              placeholder="Usage notes"
            />
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                {title}
              </CardTitle>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function BrandGuidelinesEditor({
  clientId,
}: {
  clientId: string;
}) {
  const { data: guidelines, isLoading } = useBrandGuidelines(clientId);
  const upsert = useUpsertBrandGuidelines();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(getDefaultForm());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (guidelines && !initialized) {
      setForm(guidelinesToForm(guidelines));
      setInitialized(true);
    } else if (!isLoading && !guidelines && !initialized) {
      setForm(getDefaultForm());
      setInitialized(true);
    }
  }, [guidelines, isLoading, initialized]);

  // Reset when clientId changes
  useEffect(() => {
    setInitialized(false);
  }, [clientId]);

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        clientId,
        colorSystem: form.colorSystem,
        typography: form.typography,
        logoRules: form.logoRules,
        photographyStyle: form.photographyStyle,
        toneOfVoice: form.toneOfVoice,
        materialsFinishes: form.materialsFinishes,
      });
      toast({ title: "Brand guidelines saved" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Brand Guidelines</h3>
          <p className="text-xs text-muted-foreground">
            Structured brand rules that feed into AI rendering prompts
          </p>
        </div>
      </div>

      {/* 1. Color System */}
      <Section title="Color System" icon={Palette} defaultOpen>
        <ColorList
          label="Primary Colors"
          items={form.colorSystem.primary}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              colorSystem: {
                ...f.colorSystem,
                primary: items as ColorEntry[],
              },
            }))
          }
          showUsage
        />
        <ColorList
          label="Secondary Colors"
          items={form.colorSystem.secondary}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              colorSystem: {
                ...f.colorSystem,
                secondary: items as ColorEntry[],
              },
            }))
          }
          showUsage
        />
        <ColorList
          label="Accent Colors"
          items={form.colorSystem.accent}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              colorSystem: {
                ...f.colorSystem,
                accent: items as ColorEntry[],
              },
            }))
          }
          showUsage
        />
        <ColorList
          label="Forbidden Colors"
          items={form.colorSystem.forbidden}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              colorSystem: {
                ...f.colorSystem,
                forbidden: items as ForbiddenColor[],
              },
            }))
          }
        />
      </Section>

      {/* 2. Typography */}
      <Section title="Typography" icon={Type}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Primary Typeface</Label>
            <Input
              value={form.typography.primaryTypeface}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  typography: {
                    ...f.typography,
                    primaryTypeface: e.target.value,
                  },
                }))
              }
              placeholder="e.g. Helvetica Neue"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Secondary Typeface</Label>
            <Input
              value={form.typography.secondaryTypeface}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  typography: {
                    ...f.typography,
                    secondaryTypeface: e.target.value,
                  },
                }))
              }
              placeholder="e.g. Georgia"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Size Scale</Label>
          <Textarea
            value={form.typography.sizeScale}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                typography: {
                  ...f.typography,
                  sizeScale: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="e.g. H1: 48px, H2: 36px, Body: 16px..."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Usage Rules</Label>
          <Textarea
            value={form.typography.usageRules}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                typography: {
                  ...f.typography,
                  usageRules: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="Typography usage rules and guidelines..."
          />
        </div>
      </Section>

      {/* 3. Logo Rules */}
      <Section title="Logo Rules" icon={FileImage}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Clear Space</Label>
            <Input
              value={form.logoRules.clearSpace}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  logoRules: {
                    ...f.logoRules,
                    clearSpace: e.target.value,
                  },
                }))
              }
              placeholder="e.g. 1x height of logo mark"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Minimum Size</Label>
            <Input
              value={form.logoRules.minSize}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  logoRules: {
                    ...f.logoRules,
                    minSize: e.target.value,
                  },
                }))
              }
              placeholder="e.g. 24px / 0.5 inches"
            />
          </div>
        </div>
        <StringList
          label="Forbidden Treatments"
          items={form.logoRules.forbiddenTreatments}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              logoRules: {
                ...f.logoRules,
                forbiddenTreatments: items,
              },
            }))
          }
          placeholder="e.g. Do not rotate, no drop shadow..."
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Usage Notes</Label>
          <Textarea
            value={form.logoRules.usageNotes}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                logoRules: {
                  ...f.logoRules,
                  usageNotes: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="Additional logo usage guidelines..."
          />
        </div>
      </Section>

      {/* 4. Photography Style */}
      <Section title="Photography Style" icon={Image}>
        <div className="space-y-1.5">
          <Label className="text-xs">Style Description</Label>
          <Textarea
            value={form.photographyStyle.style}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                photographyStyle: {
                  ...f.photographyStyle,
                  style: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="Describe the overall photography style..."
          />
        </div>
        <StringList
          label="Dos"
          items={form.photographyStyle.dos}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              photographyStyle: {
                ...f.photographyStyle,
                dos: items,
              },
            }))
          }
          placeholder="e.g. Use natural lighting..."
        />
        <StringList
          label="Don'ts"
          items={form.photographyStyle.donts}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              photographyStyle: {
                ...f.photographyStyle,
                donts: items,
              },
            }))
          }
          placeholder="e.g. No stock photos with watermarks..."
        />
      </Section>

      {/* 5. Tone of Voice */}
      <Section title="Tone of Voice" icon={MessageSquare}>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea
            value={form.toneOfVoice.description}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                toneOfVoice: {
                  ...f.toneOfVoice,
                  description: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="Describe the brand's tone of voice..."
          />
        </div>
        <StringList
          label="Messaging Pillars"
          items={form.toneOfVoice.messagingPillars}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              toneOfVoice: {
                ...f.toneOfVoice,
                messagingPillars: items,
              },
            }))
          }
          placeholder="e.g. Innovation, Trust, Sustainability..."
        />
        <StringList
          label="Taglines"
          items={form.toneOfVoice.taglines}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              toneOfVoice: {
                ...f.toneOfVoice,
                taglines: items,
              },
            }))
          }
          placeholder="e.g. Think Different..."
        />
      </Section>

      {/* 6. Materials & Finishes */}
      <Section title="Materials & Finishes" icon={Gem}>
        <StringList
          label="Preferred Materials"
          items={form.materialsFinishes.preferred}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              materialsFinishes: {
                ...f.materialsFinishes,
                preferred: items,
              },
            }))
          }
          placeholder="e.g. Brushed aluminum, Bamboo..."
        />
        <StringList
          label="Forbidden Materials"
          items={form.materialsFinishes.forbidden}
          onChange={(items) =>
            setForm((f) => ({
              ...f,
              materialsFinishes: {
                ...f.materialsFinishes,
                forbidden: items,
              },
            }))
          }
          placeholder="e.g. Cheap vinyl, Styrofoam..."
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Finish Notes</Label>
          <Textarea
            value={form.materialsFinishes.finishNotes}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                materialsFinishes: {
                  ...f.materialsFinishes,
                  finishNotes: e.target.value,
                },
              }))
            }
            rows={3}
            placeholder="Additional notes about finish preferences..."
          />
        </div>
      </Section>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save Brand Guidelines
        </Button>
      </div>
    </div>
  );
}
