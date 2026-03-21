import { useLocation, useSearchParams, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileSearch,
  Grid3X3,
  FileText,
  Download,
  Sparkles,
  FolderOpen,
  LogOut,
  ImageIcon,
  BookOpen,
  Building2,
  Settings2,
  Users,
  Box,
  ChevronLeft,
  ChevronRight,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { cn } from "@/lib/utils";

const projectNavItems = [
  { path: "/upload", label: "New Project", icon: Upload },
  { path: "/review", label: "Brief Review", icon: FileSearch },
  { path: "/generate", label: "Generate", icon: Sparkles },
  { path: "/spatial", label: "Spatial", icon: Grid3X3 },
  { path: "/prompts", label: "Prompts", icon: FileText },
  { path: "/rhino", label: "3D Upload", icon: Box },
  { path: "/files", label: "Files", icon: ImageIcon },
  { path: "/export", label: "Export", icon: Download },
  { path: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
];

const workspaceNavItems = [
  { path: "/projects", label: "All Projects", icon: FolderOpen },
  { path: "/company", label: "Company Profile", icon: Building2 },
  { path: "/team", label: "Team", icon: Users },
];

const noProjectPaths = ["/projects", "/company", "/team", "/admin"];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  const buildPath = (path: string) => {
    if (noProjectPaths.includes(path)) return path;
    return projectId ? `${path}?project=${projectId}` : path;
  };

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const NavItem = ({ path, label, icon: Icon }: { path: string; label: string; icon: React.ElementType }) => {
    const active = isActive(path);
    const item = (
      <SidebarMenuItem key={path}>
        <SidebarMenuButton asChild isActive={active}>
          <Link
            to={buildPath(path)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {item}
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return item;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Logo / Header */}
      <SidebarHeader className="h-16 flex items-center justify-between px-3 border-b border-border">
        <Link to="/projects" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Grid3X3 className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight truncate">
              BriefEngine
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </SidebarHeader>

      <SidebarContent className="py-3 gap-0">
        {/* Project tools */}
        <SidebarGroup className="px-2 pb-4">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-1 mb-1">
              Project
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {projectNavItems.map((item) => (
                <NavItem key={item.path} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Workspace */}
        <SidebarGroup className="px-2 pb-4">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-1 mb-1">
              Workspace
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNavItems.map((item) => (
                <NavItem key={item.path} {...item} />
              ))}

              {/* Admin — only shown to admins */}
              {isAdmin && (
                <NavItem path="/admin" label="Admin" icon={Shield} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user info + sign out */}
      <SidebarFooter className="border-t border-border px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="text-xs font-semibold text-primary">
                  {user?.email?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
