// /onboarding/create-agency — mandatory step for users without an agency.
//
// Reached from ProtectedRoute when useOnboardingState().needsOnboarding is
// true. Lets the user name their agency, optionally upload a logo + pick
// brand colors, and become its owner. Backfills any orphaned data (existing
// projects/clients/KB docs the user owned before creating the agency).

import { useState, FormEvent, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2,
  Building2,
  ArrowRight,
  LogOut,
  ChevronRight,
  Mail,
  Sparkles,
  TreePine,
  Film,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CanopyLogo, CanopyAmbientGlow, CanopyPanel } from "@/components/canopy";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCreateMyAgency, useOnboardingState } from "@/hooks/useOnboarding";
import { useMyPendingInvites, useAcceptInvite } from "@/hooks/useAgencyTeam";
import { useIndustries } from "@/hooks/useIndustries";
import { formatDistanceToNow } from "date-fns";

const INDUSTRY_ICONS: Record<string, typeof Sparkles> = {
  experiential: Sparkles,
  architecture: Building2,
  landscape: TreePine,
  entertainment: Film,
};

export default function OnboardingCreateAgency() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { hasAgency, isLoading } = useOnboardingState();
  const { data: pendingInvites = [], isLoading: invitesLoading } = useMyPendingInvites();
  const { data: industries = [], isLoading: industriesLoading } = useIndustries();
  const createAgency = useCreateMyAgency();
  const acceptInvite = useAcceptInvite();

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#A78BFA");
  const [secondaryColor, setSecondaryColor] = useState("#0B1B2B");
  const [primaryIndustry, setPrimaryIndustry] = useState<string>("experiential");
  const [extraIndustries, setExtraIndustries] = useState<string[]>([]);

  const toggleExtraIndustry = (slug: string) => {
    if (slug === primaryIndustry) return; // primary is implicit
    setExtraIndustries((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  // If the user got here but already has an agency, bounce home.
  useEffect(() => {
    if (!isLoading && hasAgency) {
      navigate("/projects", { replace: true });
    }
  }, [hasAgency, isLoading, navigate]);

  const agencyInvites = pendingInvites.filter((i) => i.invite_type === "agency_member");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({
        title: "Name too short",
        description: "Your agency needs at least a 2-character name.",
        variant: "destructive",
      });
      return;
    }

    try {
      const allIndustries = Array.from(new Set([primaryIndustry, ...extraIndustries]));
      await createAgency.mutateAsync({
        name: trimmed,
        logo_url: logoUrl.trim() || null,
        brand_colors:
          primaryColor || secondaryColor
            ? { primary: primaryColor, secondary: secondaryColor }
            : null,
        primary_industry: primaryIndustry,
        industries: allIndustries,
      });
      toast({
        title: "Agency created",
        description: `Welcome to Canopy, ${trimmed}.`,
      });
      navigate("/projects", { replace: true });
    } catch (err) {
      toast({
        title: "Could not create agency",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleAcceptInvite = async (inviteId: string, agencyName: string | null) => {
    try {
      await acceptInvite.mutateAsync(inviteId);
      toast({
        title: "Invitation accepted",
        description: agencyName ? `Welcome to ${agencyName}.` : "Welcome aboard.",
      });
      navigate("/projects", { replace: true });
    } catch (err) {
      toast({
        title: "Could not accept invitation",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background">
      {/* Background ambient */}
      <div className="absolute inset-0 canopy-grid-pattern opacity-50" aria-hidden />
      <CanopyAmbientGlow
        position="top-1/4 -left-32"
        size={520}
        tone="violet"
        opacity={0.28}
        animate
      />
      <CanopyAmbientGlow
        position="bottom-0 right-0 translate-x-1/3 translate-y-1/3"
        size={520}
        tone="pink"
        opacity={0.22}
        animate
      />

      <div className="w-full max-w-xl relative z-10">
        <Link to="/" className="flex items-center justify-center mb-8" aria-label="Canopy home">
          <CanopyLogo variant="stacked" size="md" />
        </Link>

        {/* Pending invites first — accept these instead of creating a new agency */}
        {agencyInvites.length > 0 && (
          <CanopyPanel className="p-6 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-[#6FA8FF]" />
              <h2 className="text-base font-semibold">
                You have {agencyInvites.length === 1 ? "an invitation" : `${agencyInvites.length} invitations`}
              </h2>
            </div>
            <p className="text-sm text-foreground/65 mb-4">
              Accept an invitation to join an existing agency, or create your own below.
            </p>
            <div className="space-y-2">
              {agencyInvites.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => handleAcceptInvite(inv.id, inv.agency_name)}
                  disabled={acceptInvite.isPending}
                  className="w-full text-left rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-colors p-3 flex items-center gap-3"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 border border-white/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {inv.agency_name ?? "Unnamed agency"}
                    </div>
                    <div className="text-xs text-foreground/55">
                      {inv.role && `Joining as ${inv.role}`}
                      {inv.role && " · "}
                      Invited {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
          </CanopyPanel>
        )}

        {/* Create agency form */}
        <CanopyPanel className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#F472B6]/20 border border-white/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-[#A78BFA]" />
            </div>
            <span className="text-xs uppercase tracking-widest text-foreground/60">
              {agencyInvites.length > 0 ? "Or start fresh" : "One last step"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold mb-2">Create your agency</h1>
          <p className="text-sm text-foreground/65 mb-6">
            Every Canopy account belongs to an agency. Name yours below. You'll be the owner —
            you can rename it, change the logo, and invite teammates anytime.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="agency-name">Agency name</Label>
              <Input
                id="agency-name"
                placeholder="Exhibitus, Acme Experiential, …"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createAgency.isPending}
                autoFocus
                required
                minLength={2}
                maxLength={80}
              />
              <p className="text-xs text-foreground/50">
                You can change this later in agency settings.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency-logo">Logo URL (optional)</Label>
              <Input
                id="agency-logo"
                type="url"
                placeholder="https://your-domain.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={createAgency.isPending}
              />
            </div>

            {/* ─── Industry picker ──────────────────────────────────────── */}
            <div className="space-y-3">
              <div>
                <Label>Industry</Label>
                <p className="text-xs text-foreground/55 mt-0.5">
                  Drives the platform vocabulary and which project types you see.
                  <span className="text-amber-300/90"> This is locked once your agency is created — contact platform support to change later.</span>
                </p>
              </div>
              {industriesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {industries.map((ind) => {
                    const Icon = INDUSTRY_ICONS[ind.slug] ?? Building2;
                    const isPrimary = primaryIndustry === ind.slug;
                    return (
                      <button
                        key={ind.slug}
                        type="button"
                        onClick={() => {
                          setPrimaryIndustry(ind.slug);
                          // Drop from extras if it was there
                          setExtraIndustries((prev) => prev.filter((s) => s !== ind.slug));
                        }}
                        disabled={createAgency.isPending}
                        className={cn(
                          "relative text-left rounded-lg border p-3 transition-all",
                          isPrimary
                            ? "border-[#A78BFA]/60 bg-[#A78BFA]/[0.08] shadow-[0_0_0_1px_rgba(167,139,250,0.4)]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                              isPrimary
                                ? "bg-canopy-gradient text-background"
                                : "bg-white/[0.06] text-foreground/70",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm leading-tight">{ind.label}</div>
                            <div className="text-[11px] text-foreground/55 mt-0.5 leading-snug line-clamp-2">
                              {ind.description}
                            </div>
                          </div>
                          {isPrimary && (
                            <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-canopy-gradient flex items-center justify-center">
                              <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Extra industries (multi-select chips) — for genuinely cross-vertical agencies */}
              {industries.length > 1 && (
                <div className="pt-2">
                  <Label className="text-xs text-foreground/65">
                    Cross-vertical work? Add other industries (rare)
                  </Label>
                  <p className="text-[11px] text-foreground/45 mt-0.5 mb-2">
                    Most agencies only need one. Pick additional industries only if you genuinely
                    work across multiple verticals — these are also locked after onboarding.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {industries
                      .filter((i) => i.slug !== primaryIndustry)
                      .map((ind) => {
                        const checked = extraIndustries.includes(ind.slug);
                        return (
                          <button
                            key={ind.slug}
                            type="button"
                            onClick={() => toggleExtraIndustry(ind.slug)}
                            disabled={createAgency.isPending}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-full border transition-colors",
                              checked
                                ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-foreground"
                                : "border-white/10 bg-white/[0.02] text-foreground/65 hover:border-white/20 hover:text-foreground",
                            )}
                          >
                            {checked && <Check className="inline h-3 w-3 mr-1" />}
                            {ind.label}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="primary-color">Primary brand color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="primary-color"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    disabled={createAgency.isPending}
                    className="h-10 w-12 rounded-md border border-white/10 bg-transparent cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    disabled={createAgency.isPending}
                    className="font-mono text-xs flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary-color">Secondary brand color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="secondary-color"
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    disabled={createAgency.isPending}
                    className="h-10 w-12 rounded-md border border-white/10 bg-transparent cursor-pointer"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    disabled={createAgency.isPending}
                    className="font-mono text-xs flex-1"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full canopy-button-primary h-12"
              disabled={createAgency.isPending || invitesLoading}
            >
              {createAgency.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create agency
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
        </CanopyPanel>

        <div className="mt-6 flex items-center justify-between text-xs text-foreground/55">
          <div>
            Signed in as <span className="text-foreground/75">{user?.email}</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
