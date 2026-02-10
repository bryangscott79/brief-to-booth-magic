
-- Create storage bucket for project render images
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', true);

-- Storage policies: users can manage files in their own project folders
CREATE POLICY "Users can upload project images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-images'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view project images"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-images');

CREATE POLICY "Users can delete their project images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-images'
  AND auth.uid() IS NOT NULL
);

-- Table to track all generated images with metadata
CREATE TABLE public.project_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  angle_id TEXT NOT NULL,
  angle_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own project images"
ON public.project_images FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project images"
ON public.project_images FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project images"
ON public.project_images FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project images"
ON public.project_images FOR DELETE
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_project_images_project ON public.project_images(project_id, angle_id);
