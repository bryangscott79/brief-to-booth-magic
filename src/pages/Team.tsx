import { AppLayout } from "@/components/layout/AppLayout";
import { TeamManager } from "@/components/admin/TeamManager";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <AppLayout>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Team</h1>
              <p className="text-sm text-muted-foreground">
                Manage your team members and their access levels
              </p>
            </div>
          </div>
        </div>
        <TeamManager />
      </div>
    </AppLayout>
  );
}
