import { ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Upload, 
  FileSearch, 
  Grid3X3, 
  FileText, 
  Download,
  Sparkles,
  FolderOpen,
  LogOut,
  User,
  ImageIcon,
  BookOpen,
  Building2,
} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/projects", label: "Projects", icon: FolderOpen },
  { path: "/upload", label: "Upload", icon: Upload },
  { path: "/knowledge-base", label: "KB", icon: BookOpen },
  { path: "/review", label: "Review", icon: FileSearch },
  { path: "/generate", label: "Generate", icon: Sparkles },
  { path: "/spatial", label: "Spatial", icon: Grid3X3 },
  { path: "/prompts", label: "Prompts", icon: FileText },
  { path: "/files", label: "Files", icon: ImageIcon },
  { path: "/export", label: "Export", icon: Download },
  { path: "/company", label: "Company", icon: Building2 },
];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const { user, signOut } = useAuth();

  const buildPath = (path: string) => {
    if (path === "/projects" || path === "/company") return path;
    return projectId ? `${path}?project=${projectId}` : path;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Grid3X3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              BriefEngine
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
              <Link
                  key={item.path}
                  to={buildPath(item.path)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  {user.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-[calc(100vh-4rem)]">
        {children}
      </main>
    </div>
  );
}
