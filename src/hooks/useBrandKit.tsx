// useBrandKit — data layer for the export brand-identity UX.
//
// Loads both sides of the brand (agency row + legacy company profile,
// client row + brand_guidelines), folds them through the brandKit contract
// (src/lib/brandKit.ts), and exposes the mutations the preflight UI needs
// to fix gaps inline: patch agency brand fields, patch client brand fields,
// and upload logo images to storage.

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useClient } from "@/hooks/useClients";
import { useBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import {
  agencyBrandFromRow,
  clientBrandFromRow,
  computeBrandGaps,
  FONT_LIBRARY,
  type AgencyBrandSource,
  type BrandGap,
  type ClientBrandSource,
} from "@/lib/brandKit";

// ─── SOURCES ─────────────────────────────────────────────────────────────────

export interface BrandSources {
  agency: AgencyBrandSource;
  client: ClientBrandSource;
  gaps: BrandGap[];
  isLoading: boolean;
}

/** Everything the brand preflight needs, resolved through the brandKit
 *  contract. `clientId` may be null (project without a client) — the client
 *  side then reports its gaps but the agency side still resolves. */
export function useBrandSources(clientId: string | null | undefined): BrandSources {
  const { agency, isLoading: agencyLoading } = useAgency();
  const { profile, isLoading: profileLoading } = useCompanyProfile();
  const clientQuery = useClient(clientId);
  const guidelinesQuery = useBrandGuidelines(clientId);

  const agencySource = agencyBrandFromRow(
    agency
      ? { name: agency.name, logo_url: agency.logo_url, brand_colors: agency.brand_colors }
      : null,
    profile ?? null,
  );

  const clientSource = clientBrandFromRow(
    clientQuery.data ?? null,
    guidelinesQuery.data ? { typography: guidelinesQuery.data.typography } : null,
  );

  return {
    agency: agencySource,
    client: clientSource,
    gaps: computeBrandGaps(agencySource, clientSource),
    isLoading:
      agencyLoading ||
      profileLoading ||
      (!!clientId && (clientQuery.isLoading || guidelinesQuery.isLoading)),
  };
}

// ─── MUTATION: PATCH AGENCY BRAND ────────────────────────────────────────────

export interface AgencyBrandPatch {
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
  headingFontId?: string | null;
  bodyFontId?: string | null;
}

/** Patches agencies.logo_url and/or the brand_colors jsonb (merged — other
 *  keys in the blob survive). Invalidates ["agency"]. */
export function useUpdateAgencyBrand() {
  const { agency } = useAgency();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: AgencyBrandPatch) => {
      if (!agency?.id) throw new Error("No active agency");

      const updates: Record<string, unknown> = {};
      if (patch.logoUrl !== undefined) updates.logo_url = patch.logoUrl;

      const touchesColors =
        patch.primary !== undefined ||
        patch.secondary !== undefined ||
        patch.headingFontId !== undefined ||
        patch.bodyFontId !== undefined;

      if (touchesColors) {
        const existing =
          agency.brand_colors && typeof agency.brand_colors === "object" && !Array.isArray(agency.brand_colors)
            ? (agency.brand_colors as Record<string, unknown>)
            : {};
        const merged: Record<string, unknown> = { ...existing };
        if (patch.primary !== undefined) merged.primary = patch.primary;
        if (patch.secondary !== undefined) merged.secondary = patch.secondary;
        if (patch.headingFontId !== undefined) merged.heading_font = patch.headingFontId;
        if (patch.bodyFontId !== undefined) merged.body_font = patch.bodyFontId;
        updates.brand_colors = merged;
      }

      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase.from("agencies").update(updates).eq("id", agency.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency"] });
    },
  });
}

// ─── MUTATION: UPLOAD LOGO ───────────────────────────────────────────────────

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

export type BrandLogoUploadInput =
  | { scope: "agency"; file: File }
  | { scope: "client"; file: File; clientId: string };

/** Uploads a logo image to storage and returns its public URL. Does NOT patch
 *  any row — pair with useUpdateAgencyBrand / useUpdateClientBrand.
 *    agency → bucket "company-assets", path agency/{agencyId}/logo_{ts}.{ext}
 *    client → bucket "brand-assets",  path {userId}/{clientId}/logo_{ts}.{ext}
 *  (matching the existing CompanyProfile + useBrandAssets conventions). */
export function useUploadBrandLogo() {
  const { user } = useAuth();
  const { agency } = useAgency();

  return useMutation({
    mutationFn: async (input: BrandLogoUploadInput): Promise<string> => {
      const { file } = input;
      if (!user) throw new Error("Not authenticated");
      if (!file.type.startsWith("image/")) throw new Error("Logo must be an image file");
      if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be 2MB or smaller");

      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const ts = Date.now();

      let bucket: string;
      let path: string;
      if (input.scope === "agency") {
        if (!agency?.id) throw new Error("No active agency");
        bucket = "company-assets";
        path = `agency/${agency.id}/logo_${ts}.${ext}`;
      } else {
        bucket = "brand-assets";
        path = `${user.id}/${input.clientId}/logo_${ts}.${ext}`;
      }

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    },
  });
}

// ─── MUTATION: PATCH CLIENT BRAND ────────────────────────────────────────────

export interface ClientBrandPatch {
  clientId: string;
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
}

/** Patches clients.logo_url / primary_color / secondary_color directly.
 *  Invalidates ["clients"] and ["client", id]. */
export function useUpdateClientBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, logoUrl, primary, secondary }: ClientBrandPatch) => {
      const updates: Record<string, unknown> = {};
      if (logoUrl !== undefined) updates.logo_url = logoUrl;
      if (primary !== undefined) updates.primary_color = primary;
      if (secondary !== undefined) updates.secondary_color = secondary;
      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from("clients")
        .update(updates as never)
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

// ─── FONT PREVIEW STYLESHEET ─────────────────────────────────────────────────

const FONT_LINK_ID = "canopy-brandkit-font-preview";

/** One <link> for the whole FONT_LIBRARY so Select options and "Aa" samples
 *  render in their actual faces. Injected once, kept for the session. */
export function useFontLibraryPreview() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const families = FONT_LIBRARY.map((f) => `family=${f.googleQuery}`).join("&");
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
  }, []);
}
