import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  IMAGE_MODELS,
  type ImageModelId,
  getImageModel,
} from "@/lib/imageModels";

interface ImageModelPickerProps {
  value: ImageModelId | string | null | undefined;
  onChange: (id: ImageModelId) => void;
  /** Compact = single-row select. Default = labeled card list. */
  variant?: "compact" | "cards";
  label?: string;
  helperText?: string;
  /** Shown next to the label, e.g. "Agency default: Nano Banana Pro". */
  inheritedFromLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function ImageModelPicker({
  value,
  onChange,
  variant = "compact",
  label = "Image model",
  helperText,
  inheritedFromLabel,
  disabled,
  className,
}: ImageModelPickerProps) {
  const current = getImageModel(value ?? undefined);

  if (variant === "cards") {
    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <div className="flex items-baseline justify-between">
            <Label className="text-sm">{label}</Label>
            {inheritedFromLabel && (
              <span className="text-xs text-muted-foreground">{inheritedFromLabel}</span>
            )}
          </div>
        )}
        {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
        <div className="grid gap-2">
          {IMAGE_MODELS.map((m) => {
            const selected = m.id === current.id;
            const isDisabled = disabled || !m.available;
            return (
              <button
                key={m.id}
                type="button"
                disabled={isDisabled}
                onClick={() => onChange(m.id)}
                className={cn(
                  "text-left rounded-md border p-3 transition-colors flex items-start gap-3",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                  isDisabled && "opacity-50 cursor-not-allowed hover:border-border",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {selected ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.label}</span>
                    {m.badge && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                        {m.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // compact
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-xs">{label}</Label>
          {inheritedFromLabel && (
            <span className="text-[10px] text-muted-foreground truncate">{inheritedFromLabel}</span>
          )}
        </div>
      )}
      <Select
        value={current.id}
        onValueChange={(v) => onChange(v as ImageModelId)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IMAGE_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id} disabled={!m.available}>
              <div className="flex items-center gap-2">
                <span>{m.label}</span>
                {m.badge && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                    {m.badge}
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helperText && <p className="text-[10px] text-muted-foreground">{helperText}</p>}
    </div>
  );
}
