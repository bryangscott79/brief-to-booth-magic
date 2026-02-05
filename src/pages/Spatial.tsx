import { AppLayout } from "@/components/layout/AppLayout";
import { SpatialPlanner } from "@/components/spatial/SpatialPlanner";

export default function SpatialPage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <SpatialPlanner />
      </div>
    </AppLayout>
  );
}
