import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectTypeManager } from "@/components/admin/ProjectTypeManager";
import { ClientsManager } from "@/components/admin/ClientsManager";
import { TeamManager } from "@/components/admin/TeamManager";
import { UserAccountsManager } from "@/components/admin/UserAccountsManager";
import { AgencyKnowledgeBase } from "@/components/admin/AgencyKnowledgeBase";
import { ActivationTypeManager } from "@/components/admin/ActivationTypeManager";
import { VenueIntelligenceManager } from "@/components/admin/VenueIntelligenceManager";
import { useIsAdmin, useIsSuperAdmin } from "@/hooks/useAdminRole";
import { usePlatformOwner } from "@/contexts/PlatformOwnerContext";
import { Settings2, Users, Layers, UserCog, Shield, BookOpen, Zap, MapPin, Crown, LayoutGrid } from "lucide-react";

export default function AdminSettings() {
  const { data: isAdmin } = useIsAdmin();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { previewMode } = usePlatformOwner();

  // Platform owners default to Accounts; agency admins default to project types
  const [tab, setTab] = useState((isSuperAdmin && !previewMode) ? "accounts" : "project-types");

  return (
    <AppLayout>
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSuperAdmin ? "bg-amber-500/10" : "bg-primary/10"}`}>
              {isSuperAdmin
                ? <Crown className="h-5 w-5 text-amber-600" />
                : <Settings2 className="h-5 w-5 text-primary" />
              }
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isSuperAdmin ? "Platform Admin" : "Agency Settings"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSuperAdmin
                  ? "Manage all agency accounts and platform-level settings"
                  : "Configure project types, manage clients, and build brand intelligence"
                }
              </p>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-8 flex-wrap h-auto gap-1">
            {/* Platform owner sees Accounts first */}
            {isSuperAdmin && (
              <TabsTrigger value="accounts" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                All Accounts
              </TabsTrigger>
            )}

            {/* Agency admin tabs — visible to agency admins and super admins in preview mode */}
            {(isAdmin && !isSuperAdmin) || (isSuperAdmin && previewMode) ? (
              <>
                <TabsTrigger value="project-types" className="gap-2">
                  <Layers className="h-4 w-4" />
                  Project Types
                </TabsTrigger>
                <TabsTrigger value="activation-types" className="gap-2">
                  <Zap className="h-4 w-4" />
                  Activation Types
                </TabsTrigger>
                <TabsTrigger value="clients" className="gap-2">
                  <Users className="h-4 w-4" />
                  Clients & Brand Intelligence
                </TabsTrigger>
                <TabsTrigger value="venues" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  Venues
                </TabsTrigger>
                <TabsTrigger value="agency-kb" className="gap-2">
                  <BookOpen className="h-4 w-4" />
                  Agency Knowledge Base
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-2">
                  <UserCog className="h-4 w-4" />
                  Team
                </TabsTrigger>
              </>
            ) : null}

            {/* Super admin also has access to invite + user management */}
            {isSuperAdmin && (
              <TabsTrigger value="team" className="gap-2">
                <Shield className="h-4 w-4" />
                Invites & Team
              </TabsTrigger>
            )}
          </TabsList>

          {/* Platform owner: Accounts */}
          {isSuperAdmin && (
            <TabsContent value="accounts">
              <UserAccountsManager />
            </TabsContent>
          )}

          {/* Agency admin tabs */}
          <TabsContent value="project-types">
            <ProjectTypeManager />
          </TabsContent>
          <TabsContent value="activation-types">
            <ActivationTypeManager />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsManager />
          </TabsContent>
          <TabsContent value="venues">
            <VenueIntelligenceManager />
          </TabsContent>
          <TabsContent value="agency-kb">
            <AgencyKnowledgeBase />
          </TabsContent>
          <TabsContent value="team">
            <TeamManager />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
