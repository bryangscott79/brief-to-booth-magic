import { AppLayout } from "@/components/layout/AppLayout";
import { TeamManager } from "@/components/admin/TeamManager";
import { PageHeader, IconWell } from "@/components/shell";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <AppLayout>
      <div className="container max-w-4xl py-8">
        <PageHeader
          className="mb-8"
          eyebrow="Agency · Members &amp; roles"
          title="Team"
          subtitle="Manage your team members and their access levels."
          leading={<IconWell icon={Users} size={44} />}
        />
        <TeamManager />
      </div>
    </AppLayout>
  );
}
