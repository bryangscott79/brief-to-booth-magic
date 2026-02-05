import { AppLayout } from "@/components/layout/AppLayout";
import { BriefUpload } from "@/components/brief/BriefUpload";

export default function UploadPage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Upload Your Brief</h1>
          <p className="text-muted-foreground">
            Start by uploading your trade show RFP or brief document
          </p>
        </div>
        <BriefUpload />
      </div>
    </AppLayout>
  );
}
