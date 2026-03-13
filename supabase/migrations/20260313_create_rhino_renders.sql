-- Phase 2: Rhino 3D Collaboration Round-Trip
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS rhino_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  original_storage_path text NOT NULL,
  original_public_url text NOT NULL,
  polished_storage_path text,
  polished_public_url text,
  polish_status text NOT NULL DEFAULT 'uploaded'
    CHECK (polish_status IN ('uploaded', 'processing', 'complete', 'error')),
  polish_prompt text,
  polish_feedback text,
  view_name text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE rhino_renders ENABLE ROW LEVEL SECURITY;

-- Users can manage their own rhino renders
CREATE POLICY "Users can manage own rhino renders"
  ON rhino_renders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for rhino renders (public for URL access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rhino-renders', 'rhino-renders', true)
ON CONFLICT DO NOTHING;

-- Storage policies: users can upload in their own folder
CREATE POLICY "Users can upload rhino renders"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'rhino-renders' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read rhino renders"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'rhino-renders');

CREATE POLICY "Users can delete own rhino renders"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'rhino-renders' AND (storage.foldername(name))[1] = auth.uid()::text);
