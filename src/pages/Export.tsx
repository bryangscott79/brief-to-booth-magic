import { AppLayout } from "@/components/layout/AppLayout";
import { ExportPackage } from "@/components/export/ExportPackage";

export default function ExportPage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <ExportPackage />
      </div>
    </AppLayout>
  );
}
