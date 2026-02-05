import { AppLayout } from "@/components/layout/AppLayout";
import { BriefReview } from "@/components/brief/BriefReview";

export default function ReviewPage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <BriefReview />
      </div>
    </AppLayout>
  );
}
