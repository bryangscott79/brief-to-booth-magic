// ProjectKnowledgeBase — thin wrapper around the new KnowledgeBasePanel.
// Scoped to the project level. Uploads go through the RAG pipeline
// (embed-document + auto-tag) instead of the legacy knowledge_base_files table.

import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

interface Props {
  projectId: string;
}

export function ProjectKnowledgeBase({ projectId }: Props) {
  return (
    <KnowledgeBasePanel
      scope="project"
      scopeId={projectId}
      title="Project Document Library"
      description="Upload briefs, inspiration, pricing, RFPs, materials specs, communications, images, or any other project-specific reference. Documents are automatically embedded and tagged so the AI can reference them during generation."
    />
  );
}
