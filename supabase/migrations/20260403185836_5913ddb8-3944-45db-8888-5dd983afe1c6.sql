
ALTER TABLE public.knowledge_base_files
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'L3',
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'permanent',
  ADD COLUMN IF NOT EXISTS topics text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

ALTER TABLE public.activation_type_kb_files
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'L1',
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'activation_type',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'permanent',
  ADD COLUMN IF NOT EXISTS topics text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
