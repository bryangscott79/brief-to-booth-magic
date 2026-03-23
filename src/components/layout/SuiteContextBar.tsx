import { useNavigate } from "react-router-dom";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectStore } from "@/store/projectStore";
import { useProjectSuite } from "@/hooks/useProjectSuite";

export function SuiteContextBar() {
  const navigate = useNavigate();
  const currentProject = useProjectStore((s) => s.currentProject);
  const parentId = currentProject?.hierarchy?.parentId ?? null;
  const projectId = currentProject?.id ?? null;

  const { data: suiteData } = useProjectSuite(
    projectId,
    parentId
  );

  // Only render if project is part of a suite
  const hasParent = !!parentId;
  const hasChildren = (suiteData?.children?.length ?? 0) > 0;
  if (!hasParent && !hasChildren) return null;

  const suiteParentId = parentId ?? projectId;
  const parentName = suiteData?.parent?.name ?? currentProject?.name ?? "Suite";
  const siblings = suiteData?.siblings ?? [];
  const childCount = suiteData?.children?.length ?? 0;

  const handleSiblingChange = (siblingId: string) => {
    navigate(`/review?project=${siblingId}`);
  };

  return (
    <div className="flex items-center gap-2 px-3 h-8 bg-muted/50 border-b border-border/50 text-xs">
      {hasParent ? (
        <>
          {/* Breadcrumb: Parent > Current */}
          <button
            onClick={() => navigate(`/suite?project=${parentId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]"
          >
            {parentName}
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="font-medium text-foreground truncate max-w-[150px]">
            {currentProject?.name}
          </span>

          {/* Sibling navigation */}
          {siblings.length > 0 && (
            <Select onValueChange={handleSiblingChange}>
              <SelectTrigger className="h-6 w-auto min-w-[120px] max-w-[180px] text-xs border-none bg-transparent shadow-none ml-2">
                <SelectValue placeholder="Switch activation..." />
              </SelectTrigger>
              <SelectContent>
                {siblings.map((sib) => (
                  <SelectItem key={sib.id} value={sib.id} className="text-xs">
                    {sib.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      ) : (
        <>
          {/* This IS the parent */}
          <span className="font-medium text-foreground truncate max-w-[200px]">
            {currentProject?.name}
          </span>
          <span className="text-muted-foreground">
            + {childCount} activation{childCount !== 1 ? "s" : ""}
          </span>
        </>
      )}

      {/* Suite Overview link */}
      <div className="ml-auto shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/suite?project=${suiteParentId}`)}
        >
          <LayoutGrid className="h-3 w-3 mr-1" />
          Suite Overview
        </Button>
      </div>
    </div>
  );
}
