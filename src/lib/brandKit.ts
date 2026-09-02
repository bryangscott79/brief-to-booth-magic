// brandKit — the single brand-identity contract for every export surface.
//
// A deck (or proposal, or ZIP cover sheet) renders in one of three brand
// modes: the AGENCY's brand, the CLIENT's brand, or a BLEND (client palette
// leads, agency mark co-brands cover + footers). This module resolves those
// modes into one concrete BrandKit — logos, palette, fonts — from the data
// the platform already holds, and reports exactly which pieces are missing
// so the UI can prompt the user to fill them in before generating.
//
// Sources of truth (in precedence order):
//   Agency:  agencies.logo_url · agencies.brand_colors jsonb
//            { primary, secondary, heading_font, body_font }
//            (legacy fallback: the per-user company_profiles row)
//   Client:  clients.logo_url · clients.primary_color / secondary_color
//            brand_guidelines.typography (fonts, when the deep dive found them)

export type BrandMode = "agency" | "client" | "blend";

/** Curated font library — quality Google Fonts with PPTX-safe fallbacks.
 *  PPTX files reference fonts by NAME; if a recipient hasn't installed the
 *  face, PowerPoint substitutes the fallback metrics. Every entry here ships
 *  with a widely-installed fallback so decks degrade gracefully. */
export interface FontChoice {
  id: string;
  label: string;
  /** CSS/PPTX family name */
  family: string;
  category: "grotesk" | "serif" | "display" | "mono";
  /** Installed-everywhere fallback for PPTX substitution */
  pptxFallback: string;
  /** Google Fonts family query (for the on-screen preview) */
  googleQuery: string;
}

export const FONT_LIBRARY: FontChoice[] = [
  { id: "inter", label: "Inter", family: "Inter", category: "grotesk", pptxFallback: "Arial", googleQuery: "Inter:wght@400;600;700" },
  { id: "manrope", label: "Manrope", family: "Manrope", category: "grotesk", pptxFallback: "Arial", googleQuery: "Manrope:wght@400;600;800" },
  { id: "work-sans", label: "Work Sans", family: "Work Sans", category: "grotesk", pptxFallback: "Arial", googleQuery: "Work+Sans:wght@400;600;700" },
  { id: "archivo", label: "Archivo", family: "Archivo", category: "grotesk", pptxFallback: "Arial Narrow", googleQuery: "Archivo:wght@400;600;700" },
  { id: "space-grotesk", label: "Space Grotesk", family: "Space Grotesk", category: "display", pptxFallback: "Arial", googleQuery: "Space+Grotesk:wght@400;500;700" },
  { id: "sora", label: "Sora", family: "Sora", category: "display", pptxFallback: "Arial", googleQuery: "Sora:wght@400;600;700" },
  { id: "bricolage", label: "Bricolage Grotesque", family: "Bricolage Grotesque", category: "display", pptxFallback: "Arial", googleQuery: "Bricolage+Grotesque:wght@400;600;800" },
  { id: "outfit", label: "Outfit", family: "Outfit", category: "display", pptxFallback: "Century Gothic", googleQuery: "Outfit:wght@400;600;700" },
  { id: "poppins", label: "Poppins", family: "Poppins", category: "display", pptxFallback: "Century Gothic", googleQuery: "Poppins:wght@400;600;700" },
  { id: "dm-sans", label: "DM Sans", family: "DM Sans", category: "grotesk", pptxFallback: "Arial", googleQuery: "DM+Sans:wght@400;500;700" },
  { id: "source-serif", label: "Source Serif 4", family: "Source Serif 4", category: "serif", pptxFallback: "Georgia", googleQuery: "Source+Serif+4:wght@400;600;700" },
  { id: "fraunces", label: "Fraunces", family: "Fraunces", category: "serif", pptxFallback: "Georgia", googleQuery: "Fraunces:wght@400;600;700" },
  { id: "playfair", label: "Playfair Display", family: "Playfair Display", category: "serif", pptxFallback: "Georgia", googleQuery: "Playfair+Display:wght@400;600;700" },
  { id: "lora", label: "Lora", family: "Lora", category: "serif", pptxFallback: "Georgia", googleQuery: "Lora:wght@400;600" },
  { id: "libre-baskerville", label: "Libre Baskerville", family: "Libre Baskerville", category: "serif", pptxFallback: "Georgia", googleQuery: "Libre+Baskerville:wght@400;700" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", family: "IBM Plex Mono", category: "mono", pptxFallback: "Courier New", googleQuery: "IBM+Plex+Mono:wght@400;500;600" },
];

export const DEFAULT_HEADING_FONT = "space-grotesk";
export const DEFAULT_BODY_FONT = "inter";

export const fontById = (id: string | null | undefined): FontChoice =>
  FONT_LIBRARY.find((f) => f.id === id) ?? FONT_LIBRARY[0];

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface AgencyBrandSource {
  name: string | null;
  logoUrl: string | null;
  primary: string | null;
  secondary: string | null;
  headingFontId: string | null;
  bodyFontId: string | null;
}

export interface ClientBrandSource {
  name: string | null;
  logoUrl: string | null;
  primary: string | null;
  secondary: string | null;
  /** Free-text typeface names from brand_guidelines.typography (deep dive) */
  typographyNote: string | null;
}

/** Pull the agency brand from an agencies row (+ legacy company profile fallback). */
export function agencyBrandFromRow(
  agency: {
    name?: string | null;
    logo_url?: string | null;
    brand_colors?: unknown;
  } | null,
  legacyProfile?: { company_name?: string | null; logo_url?: string | null; brand_color?: string | null; secondary_color?: string | null } | null,
): AgencyBrandSource {
  const colors = (agency?.brand_colors ?? {}) as Record<string, unknown>;
  return {
    name: agency?.name ?? legacyProfile?.company_name ?? null,
    logoUrl: agency?.logo_url ?? legacyProfile?.logo_url ?? null,
    primary: (colors.primary as string) ?? legacyProfile?.brand_color ?? null,
    secondary: (colors.secondary as string) ?? legacyProfile?.secondary_color ?? null,
    headingFontId: (colors.heading_font as string) ?? null,
    bodyFontId: (colors.body_font as string) ?? null,
  };
}

export function clientBrandFromRow(
  client: {
    name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
  } | null,
  guidelines?: { typography?: unknown } | null,
): ClientBrandSource {
  const typography = guidelines?.typography as Record<string, unknown> | null | undefined;
  const typoNote =
    (typography?.primary_typeface as string) ??
    (typography?.heading as string) ??
    (typography?.primary as string) ??
    null;
  return {
    name: client?.name ?? null,
    logoUrl: client?.logo_url ?? null,
    primary: client?.primary_color ?? null,
    secondary: client?.secondary_color ?? null,
    typographyNote: typoNote,
  };
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface BrandKit {
  mode: BrandMode;
  /** Leading palette (drives covers, accents, section bars) */
  primary: string;
  secondary: string;
  /** Near-black ink + paper derived for slide grounds */
  ink: string;
  paper: string;
  heading: FontChoice;
  body: FontChoice;
  /** Logo shown large on the cover */
  leadLogoUrl: string | null;
  leadName: string | null;
  /** Co-brand mark (footers, closing slide); null when mode isn't blend */
  coLogoUrl: string | null;
  coName: string | null;
  agency: AgencyBrandSource;
  client: ClientBrandSource;
}

const FALLBACK_PRIMARY = "#0B1B2B";
const FALLBACK_SECONDARY = "#4F6BE8";

export function resolveBrandKit(
  mode: BrandMode,
  agency: AgencyBrandSource,
  client: ClientBrandSource,
): BrandKit {
  const heading = fontById(agency.headingFontId ?? DEFAULT_HEADING_FONT);
  const body = fontById(agency.bodyFontId ?? DEFAULT_BODY_FONT);

  const agencyPalette = {
    primary: agency.primary ?? FALLBACK_PRIMARY,
    secondary: agency.secondary ?? FALLBACK_SECONDARY,
  };
  const clientPalette = {
    primary: client.primary ?? agencyPalette.primary,
    secondary: client.secondary ?? agencyPalette.secondary,
  };

  const base = {
    ink: "#101418",
    paper: "#FFFFFF",
    heading,
    body,
    agency,
    client,
  };

  switch (mode) {
    case "agency":
      return {
        ...base,
        mode,
        ...agencyPalette,
        leadLogoUrl: agency.logoUrl,
        leadName: agency.name,
        coLogoUrl: null,
        coName: null,
      };
    case "client":
      return {
        ...base,
        mode,
        ...clientPalette,
        leadLogoUrl: client.logoUrl,
        leadName: client.name,
        coLogoUrl: null,
        coName: null,
      };
    case "blend":
    default:
      // Client palette leads (the pitch is TO them); agency co-brands.
      return {
        ...base,
        mode: "blend",
        ...clientPalette,
        leadLogoUrl: client.logoUrl,
        leadName: client.name,
        coLogoUrl: agency.logoUrl,
        coName: agency.name,
      };
  }
}

// ── Completeness ──────────────────────────────────────────────────────────────

export interface BrandGap {
  key:
    | "agency_logo"
    | "agency_primary"
    | "agency_secondary"
    | "agency_fonts"
    | "client_logo"
    | "client_primary"
    | "client_secondary";
  scope: "agency" | "client";
  label: string;
  /** required gaps block generation for the modes that need them */
  requiredFor: BrandMode[];
}

/** Everything missing across both brands. The UI filters by the chosen mode:
 *  a gap blocks only when the mode actually uses that side of the brand. */
export function computeBrandGaps(agency: AgencyBrandSource, client: ClientBrandSource): BrandGap[] {
  const gaps: BrandGap[] = [];
  if (!agency.logoUrl)
    gaps.push({ key: "agency_logo", scope: "agency", label: "Agency logo", requiredFor: ["agency", "blend"] });
  if (!agency.primary)
    gaps.push({ key: "agency_primary", scope: "agency", label: "Agency primary color", requiredFor: ["agency"] });
  if (!agency.secondary)
    gaps.push({ key: "agency_secondary", scope: "agency", label: "Agency secondary color", requiredFor: [] });
  if (!agency.headingFontId || !agency.bodyFontId)
    gaps.push({ key: "agency_fonts", scope: "agency", label: "Deck typefaces", requiredFor: [] });
  if (!client.logoUrl)
    gaps.push({ key: "client_logo", scope: "client", label: "Client logo", requiredFor: ["client", "blend"] });
  if (!client.primary)
    gaps.push({ key: "client_primary", scope: "client", label: "Client primary color", requiredFor: ["client", "blend"] });
  if (!client.secondary)
    gaps.push({ key: "client_secondary", scope: "client", label: "Client secondary color", requiredFor: [] });
  return gaps;
}

export const gapsBlockingMode = (gaps: BrandGap[], mode: BrandMode): BrandGap[] =>
  gaps.filter((g) => g.requiredFor.includes(mode));
