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
import { KnowledgeHealthDashboard } from "@/components/admin/KnowledgeHealthDashboard";
import { PlatformImageModelManager } from "@/components/admin/PlatformImageModelManager";
import { AiUsageManager } from "@/components/admin/AiUsageManager";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { usePlatformOwner } from "@/contexts/PlatformOwnerContext";
import { Settings2, Users, Layers, UserCog, Shield, BookOpen, Zap, MapPin, Crown, LayoutGrid, Activity, Sparkles, TrendingUp } from "lucide-react";
import { PageHeader, IconWell } from "@/components/shell";

export default function AdminSettings() {
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { previewMode } = usePlatformOwner();

  // Two completely separate admin surfaces:
  //   1. Platform Admin (Super Admin, normal mode) → platform-level data only
  //   2. Agency Admin (or Super Admin in Preview Mode) → their own agency's data
  const isPlatformView = isSuperAdmin && !previewMode;

  const [tab, setTab] = useState(isPlatformView ? "accounts" : "project-types");

  return (
    <AppLayout>
      <div className="container max-w-7xl py-8">
        {/* Header */}
        <PageHeader
          className="mb-8"
          eyebrow={isPlatformView ? "Platform · Accounts &amp; defaults" : "Agency · Configuration"}
          title={isPlatformView ? "Platform Admin" : "Agency Settings"}
          subtitle={
            isPlatformView
              ? "Platform-wide accounts and shared defaults that every agency inherits."
              : "Configure project types, manage clients, and build brand intelligence."
          }
          leading={
            isPlatformView ? (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-square bg-amber-500">
                <Crown className="h-5 w-5 text-white" strokeWidth={1.5} />
              </div>
            ) : (
              <IconWell icon={Settings2} size={44} />
            )
          }
        />

        {isPlatformView ? (
          // ─── PLATFORM ADMIN VIEW ─────────────────────────────────────────
          // Super Admin only sees platform-level surfaces.
          // Agency-scoped data (clients, agency KB, KB health, team, project
          // types, brand intelligence) is intentionally NOT shown here —
          // use Preview Mode to enter a specific agency.
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-8 flex-wrap h-auto gap-1">
              <TabsTrigger value="accounts" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                All Accounts
              </TabsTrigger>
              <TabsTrigger value="activation-types" className="gap-2">
                <Zap className="h-4 w-4" />
                Activation Types
              </TabsTrigger>
              <TabsTrigger value="venues" className="gap-2">
                <MapPin className="h-4 w-4" />
                Venues &amp; Shows
              </TabsTrigger>
              <TabsTrigger value="image-models" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Image Models
              </TabsTrigger>
              <TabsTrigger value="ai-usage" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                AI Usage
              </TabsTrigger>
              <TabsTrigger value="invites" className="gap-2">
                <Shield className="h-4 w-4" />
                Invites &amp; Team
              </TabsTrigger>
            </TabsList>

            <TabsContent value="accounts">
              <UserAccountsManager />
            </TabsContent>
            <TabsContent value="activation-types">
              <ActivationTypeManager />
            </TabsContent>
            <TabsContent value="venues">
              <VenueIntelligenceManager />
            </TabsContent>
            <TabsContent value="image-models">
              <PlatformImageModelManager />
            </TabsContent>
            <TabsContent value="ai-usage">
              <AiUsageManager />
            </TabsContent>
            <TabsContent value="invites">
              <TeamManager />
            </TabsContent>
          </Tabs>
        ) : (
          // ─── AGENCY ADMIN VIEW ───────────────────────────────────────────
          // Agency Admins (and Super Admin in Preview Mode) see only their
          // own agency's data. No platform-level "All Accounts" tab here.
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-8 flex-wrap h-auto gap-1">
              <TabsTrigger value="project-types" className="gap-2">
                <Layers className="h-4 w-4" />
                Project Types
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2">
                <Users className="h-4 w-4" />
                Clients &amp; Brand Intelligence
              </TabsTrigger>
              <TabsTrigger value="agency-kb" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Agency Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="kb-health" className="gap-2">
                <Activity className="h-4 w-4" />
                KB Health
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
            <TabsContent value="agency-kb">
              <AgencyKnowledgeBase />
            </TabsContent>
            <TabsContent value="kb-health">
              <KnowledgeHealthDashboard />
            </TabsContent>
            <TabsContent value="team">
              <TeamManager />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
