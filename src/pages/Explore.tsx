import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProjectHeader } from "@/components/layout/ProjectHeader";
import { BoothExplorer } from "@/components/explore/BoothExplorer";

export default function Explore() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <ProjectHeader />
          <div className="flex-1 p-6">
            <BoothExplorer />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
