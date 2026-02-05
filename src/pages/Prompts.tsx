import { AppLayout } from "@/components/layout/AppLayout";
import { PromptGenerator } from "@/components/prompts/PromptGenerator";

export default function PromptsPage() {
  return (
    <AppLayout>
      <div className="container py-12">
        <PromptGenerator />
      </div>
    </AppLayout>
  );
}
