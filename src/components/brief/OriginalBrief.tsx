import { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface OriginalBriefProps {
  briefText: string | null;
  briefFileName: string | null;
  briefFileUrl?: string | null;
}

export function OriginalBrief({ briefText, briefFileName, briefFileUrl }: OriginalBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!briefText && !briefFileUrl) return null;

  return (
    <Card className="element-card">
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Original Brief
            {briefFileName && (
              <span className="text-xs font-normal text-muted-foreground truncate max-w-[200px]">
                — {briefFileName}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {briefFileUrl && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(briefFileUrl, "_blank");
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    const a = document.createElement("a");
                    a.href = briefFileUrl;
                    a.download = briefFileName || "brief";
                    a.click();
                  }}
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </>
            )}
            {isExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </div>
      </CardHeader>

      <div className={cn("overflow-hidden transition-all duration-300", isExpanded ? "max-h-[600px]" : "max-h-0")}>
        <CardContent className="pt-0">
          {briefText ? (
            <ScrollArea className="h-[500px] rounded-md border bg-muted/30 p-4">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {briefText}
              </pre>
            </ScrollArea>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-6">
              Original file stored — use Open or Download to view.
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
