import { AppLayout } from "@/components/layout/AppLayout";
import { ElementDashboard } from "@/components/elements/ElementDashboard";

export default function GeneratePage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <ElementDashboard />
      </div>
    </AppLayout>
  );
}
