-- Add branding fields to company_profiles for proposals
ALTER TABLE public.company_profiles
  ADD COLUMN logo_url text,
  ADD COLUMN logo_dark_url text,
  ADD COLUMN brand_color text,
  ADD COLUMN secondary_color text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD COLUMN address text,
  ADD COLUMN website text,
  ADD COLUMN tagline text;