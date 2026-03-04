
-- Add brief_file_url column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brief_file_url TEXT;

-- Create storage bucket for original brief files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('briefs', 'briefs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for briefs bucket (user can only access their own folder)
CREATE POLICY "Users can upload their own briefs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own briefs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own briefs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);
