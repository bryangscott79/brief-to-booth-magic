import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectTypeManager } from "@/components/admin/ProjectTypeManager";
import { ClientsManager } from "@/components/admin/ClientsManager";
import { TeamManager } from "@/components/admin/TeamManager";
import { Settings2, Users, Layers, UserCog } from "lucide-react";

export default function AdminSettings() {
  const [tab, setTab] = useState("project-types");

  return (
    <AppLayout>
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agency Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure project types, manage clients, and build brand intelligence
              </p>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-8">
            <TabsTrigger value="project-types" className="gap-2">
              <Layers className="h-4 w-4" />
              Project Types
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Users className="h-4 w-4" />
              Clients & Brand Intelligence
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <UserCog className="h-4 w-4" />
              Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project-types">
            <ProjectTypeManager />
          </TabsContent>

          <TabsContent value="clients">
            <ClientsManager />
          </TabsContent>

          <TabsContent value="team">
            <TeamManager />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
