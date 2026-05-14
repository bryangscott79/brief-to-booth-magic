// src/components/prompts/PromptDebugPanel.tsx
//
// Collapsed-by-default panel on the Prompts step showing the 5
// composer output stages for the current hero composition:
//   A. Normalized Brief JSON
//   B. Geometry Summary
//   C. Renderer Prompt    ← this is what gets sent to gpt-image-2
//   D. Negative
//   E. Compliance Checklist
//
// Each stage has a copy-to-clipboard button. Useful for understanding
// what's actually being sent to the image model and why.

import { useState } from "react";
import type { ComposerOutput } from "@/lib/normalizedBrief";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";

export interface PromptDebugPanelProps {
  output: ComposerOutput | null;
}

export function PromptDebugPanel({ output }: PromptDebugPanelProps) {
  const [open, setOpen] = useState(false);
  if (!output) return null;

  const sections: Array<{ label: string; content: string }> = [
    { label: "A. Normalized Brief JSON", content: JSON.stringify(output.briefJson, null, 2) },
    { label: "B. Geometry Summary", content: output.geometrySummary },
    { label: "C. Renderer Prompt", content: output.renderer },
    { label: "D. Negative", content: output.negative },
    { label: "E. Compliance", content: JSON.stringify(output.compliance, null, 2) },
  ];

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Prompt Debug
        <span className="text-xs text-muted-foreground ml-2">(5 stages)</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t">
          {sections.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(s.content)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre className="text-xs bg-muted/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {s.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
