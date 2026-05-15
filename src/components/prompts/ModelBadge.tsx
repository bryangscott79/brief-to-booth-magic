// ModelBadge — small chip shown under each rendered image so the user
// can tell at a glance which engine produced it.
//
// Naming is deliberately product-branded, not provider-branded:
//   - "Canopy 2.0"   → openai/gpt-image-2  (primary, higher fidelity)
//   - "Canopy Lite"  → google/gemini-3-pro-image-preview  (fallback,
//                       faster but lower fidelity, kicks in when
//                       gpt-image-2 errors)
//
// Hidden when the model is unknown (legacy renders saved before the
// edge functions started returning modelUsed). No badge is fine — the
// user just sees the image, same as before the badge existed.

import { Badge } from "@/components/ui/badge";
import { Sparkles, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelBadgeProps {
  /**
   * The canonical model id from the edge function response (e.g.
   * "openai/gpt-image-2", "google/gemini-3-pro-image-preview"). May be
   * null/undefined for older renders that pre-date the badge — in that
   * case the component renders nothing.
   */
  model?: string | null;
  className?: string;
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  if (!model) return null;
  const lower = model.toLowerCase();
  // Substring match — keeps the badge resilient to future model
  // version bumps (gpt-image-2.1, gemini-3.5-pro-image, etc.) without
  // needing a code change.
  const isCanopy20 = lower.includes("openai") || lower.includes("gpt-image");
  const isCanopyLite = lower.includes("gemini") || lower.includes("google");
  if (!isCanopy20 && !isCanopyLite) return null;

  if (isCanopy20) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] gap-1 border-primary/40 bg-primary/10 text-primary",
          className,
        )}
        title="Rendered with Canopy 2.0 (premium engine)"
      >
        <Sparkles className="h-2.5 w-2.5" />
        Canopy 2.0
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] gap-1 border-muted-foreground/30 bg-muted/40 text-muted-foreground",
        className,
      )}
      title="Rendered with Canopy Lite (fallback engine)"
    >
      <Wind className="h-2.5 w-2.5" />
      Canopy Lite
    </Badge>
  );
}
