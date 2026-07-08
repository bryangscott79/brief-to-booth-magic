import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProjectHeader } from "@/components/layout/ProjectHeader";
import { SuspensionBanner } from "@/components/access/SuspensionBanner";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  /**
   * Legacy prop from the dark-first era. The app is now Flow C light
   * everywhere: white sheets on a cloud ground. Kept so existing call
   * sites (`surface="light"`) keep compiling — both values render the
   * same light shell.
   */
  surface?: "dark" | "light";
}

export function AppLayout({ children, surface: _surface = "light" }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-cloud">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <SuspensionBanner />
          <ProjectHeader />
          {/* Flow C ground: cloud page background; pages lay white sheets on it */}
          <main className={cn("flex-1 overflow-auto bg-cloud text-foreground")}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
