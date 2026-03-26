import { useLocation, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  Grid3X3,
  FolderOpen,
  LogOut,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
  Shield,
  Crown,
  Mail,
  LayoutGrid,
  Eye,
  EyeOff,
  Compass,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
import { useIsAdmin, useIsSuperAdmin } from "@/hooks/useAdminRole";
import { usePlatformOwner } from "@/contexts/PlatformOwnerContext";
import { cn } from "@/lib/utils";

// ─── Nav sets ─────────────────────────────────────────────────────────────────
const agencyNavItems = [
  { path: "/projects", label: "All Projects", icon: FolderOpen },
  { path: "/explore",  label: "360° Explorer", icon: Compass },
  { path: "/company",  label: "Company Profile", icon: Building2 },
  { path: "/team",     label: "Team", icon: Users },
];

const platformOwnerNavItems = [
  { path: "/admin",    label: "Accounts", icon: LayoutGrid },
  { path: "/platform-invites", label: "Invites", icon: Mail },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { previewMode, setPreviewMode } = usePlatformOwner();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const NavItem = ({
    path,
    label,
    icon: Icon,
  }: {
    path: string;
    label: string;
    icon: React.ElementType;
  }) => {
    const active = isActive(path);
    const item = (
      <SidebarMenuItem key={path}>
        <SidebarMenuButton asChild isActive={active}>
          <Link
            to={path}
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
          <TooltipTrigger asChild>{item}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return item;
  };

  // Determine which nav to show
  // Super admin in normal mode → platform owner nav
  // Super admin in preview mode → agency nav (with exit button)
  // Regular admin/member → agency nav
  const showPlatformNav = isSuperAdmin && !previewMode;
  const navItems = showPlatformNav ? platformOwnerNavItems : agencyNavItems;

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Logo / Header */}
      <SidebarHeader className="flex flex-col border-b border-border">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <Link to={showPlatformNav ? "/admin" : "/projects"} className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              isSuperAdmin && !previewMode ? "bg-amber-500" : "bg-primary"
            )}>
              {isSuperAdmin && !previewMode
                ? <Crown className="h-5 w-5 text-white" />
                : <Grid3X3 className="h-5 w-5 text-primary-foreground" />
              }
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="text-lg font-semibold tracking-tight truncate block">
                  BriefEngine
                </span>
                {isSuperAdmin && !previewMode && (
                  <span className="text-[10px] font-medium text-amber-600 uppercase tracking-widest">
                    Platform Admin
                  </span>
                )}
              </div>
            )}
          </Link>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto mb-2 h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={toggleSidebar}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent className="py-3 gap-0">
        {/* Preview mode banner */}
        {previewMode && isSuperAdmin && !collapsed && (
          <div className="mx-2 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-[11px] font-medium text-amber-700">Preview Mode</span>
              </div>
              <button
                onClick={() => { setPreviewMode(false); navigate("/admin"); }}
                className="text-[10px] text-amber-600 hover:text-amber-800 font-medium flex items-center gap-0.5"
              >
                <EyeOff className="h-3 w-3" />
                Exit
              </button>
            </div>
            <p className="text-[10px] text-amber-600/70 mt-0.5">Read-only agency view</p>
          </div>
        )}

        {/* Collapsed preview badge */}
        {previewMode && isSuperAdmin && collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setPreviewMode(false); navigate("/admin"); }}
                className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Exit Preview Mode</TooltipContent>
          </Tooltip>
        )}

        <SidebarGroup className="px-2 pb-4">
          {/* Section label for platform owner */}
          {showPlatformNav && !collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Platform
            </p>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <NavItem key={item.path} {...item} />
              ))}
              {/* Agency admins still get admin settings */}
              {isAdmin && !isSuperAdmin && (
                <NavItem
                  path="/admin"
                  label="Admin Settings"
                  icon={Shield}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Platform owner: toggle to preview agency view */}
        {isSuperAdmin && !previewMode && (
          <div className="px-2 mt-auto mb-2">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setPreviewMode(true); navigate("/projects"); }}
                    className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Preview as Agency Admin</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={() => { setPreviewMode(true); navigate("/projects"); }}
                className="w-full flex items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-muted/40 transition-colors"
              >
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span>Preview as Agency Admin</span>
              </button>
            )}
          </div>
        )}
      </SidebarContent>

      {/* Footer: user info + sign out */}
      <SidebarFooter className="border-t border-border px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  isSuperAdmin ? "bg-amber-500/20" : "bg-primary/10"
                )}>
                {isSuperAdmin
                  ? <Crown className="h-3.5 w-3.5 text-amber-600" />
                  : <span className="text-xs font-semibold text-primary">{user?.email?.[0]?.toUpperCase() ?? "?"}</span>
                }
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
