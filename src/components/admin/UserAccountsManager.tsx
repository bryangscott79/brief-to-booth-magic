import { useState } from "react";
import { useAdminUsers } from "@/hooks/useAdminRole";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search,
  Eye,
  Calendar,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  reviewed: "bg-blue-500/10 text-blue-500",
  generating: "bg-amber-500/10 text-amber-500",
  complete: "bg-emerald-500/10 text-emerald-500",
};

export function UserAccountsManager() {
  const { data: userProjects, isLoading } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const toggleUser = (uid: string) => {
    setOpenUsers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const entries = Object.entries(userProjects ?? {});
  const filtered = entries.filter(([uid, projects]) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      uid.toLowerCase().includes(q) ||
      projects.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.project_type.toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by user ID or project name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-2xl font-bold">{entries.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-2xl font-bold">
              {entries.reduce((acc, [, p]) => acc + p.length, 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Total projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-2xl font-bold">
              {entries.reduce(
                (acc, [, p]) => acc + p.filter((x) => x.status === "complete").length,
                0
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Completed projects</p>
          </CardContent>
        </Card>
      </div>

      {/* User list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No accounts found</p>
          </div>
        )}

        {filtered.map(([uid, projects]) => {
          const isOpen = openUsers.has(uid);
          return (
            <Collapsible key={uid} open={isOpen} onOpenChange={() => toggleUser(uid)}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-xs font-semibold text-primary">
                            {uid.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            {uid}
                          </p>
                          <p className="text-sm font-medium">
                            {projects.length} project{projects.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">
                          {projects.filter((p) => p.status !== "draft").length} active
                        </Badge>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-4 pl-4 border-l-2 border-border space-y-2 mt-1 mb-3">
                  {projects.map((project) => (
                    <Card key={project.id} className="bg-muted/30">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {project.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge
                                  className={cn(
                                    "text-[10px] px-1.5 py-0",
                                    STATUS_COLORS[project.status] ??
                                      "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {project.status}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {project.project_type.replace(/_/g, " ")}
                                </span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(project.updated_at), "MMM d, yyyy")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 h-7 text-xs gap-1"
                            onClick={() => navigate(`/review?project=${project.id}`)}
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
