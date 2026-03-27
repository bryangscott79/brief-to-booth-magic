
-- Allow admins and super_admins to update ALL activation types (including built-in)
DROP POLICY IF EXISTS "Users can update their own activation types" ON public.activation_types;
CREATE POLICY "Users can update their own activation types"
  ON public.activation_types FOR UPDATE
  USING (
    (auth.uid() = user_id AND is_builtin = false)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Create activation type knowledge base table
CREATE TABLE public.activation_type_kb_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_type_id uuid NOT NULL REFERENCES public.activation_types(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  file_size_bytes bigint,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_type_kb_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activation type KB files"
  ON public.activation_type_kb_files FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert activation type KB files"
  ON public.activation_type_kb_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete activation type KB files"
  ON public.activation_type_kb_files FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));
