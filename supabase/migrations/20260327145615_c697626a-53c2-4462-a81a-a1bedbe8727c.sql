
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'general';
ALTER TABLE public.activation_type_kb_files ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'general';
