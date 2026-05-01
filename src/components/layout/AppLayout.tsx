import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProjectHeader } from "@/components/layout/ProjectHeader";
import { SuspensionBanner } from "@/components/access/SuspensionBanner";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  /**
   * Visual treatment for the working area inside <main>. Sidebar + header
   * always stay dark — only the content surface flips.
   *   - "dark" (default): standard navy/glass surface, matches the brand
   *     across landing/dashboard/marketing pages.
   *   - "light": near-white card surface for dense interactive editors
   *     (forms, BOMs, file lists, brief intake). Cards inside automatically
   *     pick up the light treatment via .canopy-surface-light.
   */
  surface?: "dark" | "light";
}

export function AppLayout({ children, surface = "dark" }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <SuspensionBanner />
          <ProjectHeader />
          <main
            className={cn(
              "flex-1 overflow-auto",
              surface === "light" && "canopy-surface-light bg-[hsl(var(--surface-bright))] text-[hsl(var(--surface-bright-foreground))]",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
