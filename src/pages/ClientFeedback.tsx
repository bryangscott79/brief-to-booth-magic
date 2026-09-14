// ClientFeedback — the post-export loop.
//
// The deck went out, the client replied. This page takes their reply
// (pasted verbatim, plus any marked-up screenshots) and turns it into
// per-image revisions that ITERATE ON THE ORIGINAL RENDERS rather than
// regenerating them: every revision is an EDIT of the current image
// (generate-hero EDIT MODE), saved back under the same angle id so it
// becomes the new current render everywhere the project already shows it
// — gallery, Files, deck, export ZIP.
//
// Flow: paste + drop → "Read the feedback" (parse-client-feedback) →
// review table (edit / include / exclude) → "Apply to renders" (batch of
// 3, live progress) → before/after strip. Every round is kept.

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageSquareQuote, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  EmptyState,
  InkRail,
  RailRow,
  RailSection,
  RailTitle,
  SectionLabel,
  SpecMono,
  StatusChip,
  WorkSheet,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectImages, useSaveRenderImage } from "@/hooks/useProjectImages";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import {
  useClientFeedbackRounds,
  useCreateFeedbackRound,
  useParseClientFeedback,
  useUpdateFeedbackRound,
  useUploadFeedbackAttachments,
  type ClientFeedbackRound,
  type FeedbackRoundAttachment,
} from "@/hooks/useClientFeedback";
import {
  applyFeedbackRound,
  selectCurrentRenders,
  summarizeRoundProgress,
  type FeedbackRevisionItem,
} from "@/lib/feedbackRevision";
import { FeedbackIntake } from "@/components/feedback/FeedbackIntake";
import { RevisionReviewTable } from "@/components/feedback/RevisionReviewTable";
import { BeforeAfterStrip } from "@/components/feedback/BeforeAfterStrip";
import { RoundHistory } from "@/components/feedback/RoundHistory";

// ─── rail ────────────────────────────────────────────────────────────────────

function FeedbackRail({
  renderCount,
  configLabel,
  roundCount,
  lastRoundAt,
  schemaReady,
  summary,
}: {
  renderCount: number;
  configLabel: string | null;
  roundCount: number;
  lastRoundAt: string | null;
  schemaReady: boolean;
  summary: string | null;
}) {
  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Revisions edit the existing render — booth, camera, lighting and everything the
          client did not mention stay locked.
        </p>
      }
    >
      <RailTitle
        label="Reference · Client feedback"
        hint="What this round can touch, and what it has already changed."
      />

      <RailSection label="In scope" accent="sky">
        <RailRow
          label="Booth size"
          mono
          tone={configLabel ? "pass" : "default"}
          value={configLabel ?? "All"}
        />
        <RailRow
          label="Current renders"
          mono
          tone={renderCount > 0 ? "pass" : "attention"}
          value={String(renderCount)}
        />
      </RailSection>

      <RailSection label="History" accent="violet">
        <RailRow label="Rounds" mono value={String(roundCount)} />
        <RailRow label="Last round" mono value={lastRoundAt ?? "—"} />
        <RailRow
          label="Storage"
          tone={schemaReady ? "pass" : "warn"}
          value={schemaReady ? "Database" : "This browser"}
        />
      </RailSection>

      {summary ? (
        <RailSection label="Not an image change" accent="pink">
          <p className="text-[12px] leading-[18px]" style={{ color: "rgba(255,255,255,0.78)" }}>
            {summary}
          </p>
        </RailSection>
      ) : null}
    </InkRail>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function ClientFeedback() {
  const { toast } = useToast();
  const { projectId, isLoading, dbProject } = useProjectSync();

  const { data: images } = useProjectImages(projectId);
  const { activeConfigKey, activeConfigLabel, defaultConfigKey } = useActiveSpatialConfig(projectId);
  const saveImage = useSaveRenderImage(projectId);

  const { data: feedbackState } = useClientFeedbackRounds(projectId);
  const createRound = useCreateFeedbackRound(projectId);
  const updateRound = useUpdateFeedbackRound(projectId);
  const uploadAttachments = useUploadFeedbackAttachments(projectId);
  const parseFeedback = useParseClientFeedback();

  const rounds = feedbackState?.rounds ?? [];
  const schemaReady = feedbackState?.schemaReady ?? true;

  const [rawFeedback, setRawFeedback] = useState("");
  const [attachments, setAttachments] = useState<FeedbackRoundAttachment[]>([]);
  const [activeRound, setActiveRound] = useState<ClientFeedbackRound | null>(null);
  const [items, setItems] = useState<FeedbackRevisionItem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // The render set a round operates on: every current render of the ACTIVE
  // footprint config.
  const renders = useMemo(
    () => selectCurrentRenders(images, activeConfigKey, defaultConfigKey),
    [images, activeConfigKey, defaultConfigKey],
  );

  const progress = useMemo(() => summarizeRoundProgress(items), [items]);
  const includedCount = items.filter((i) => i.include).length;

  const briefText =
    typeof (dbProject as { brief_text?: unknown } | null | undefined)?.brief_text === "string"
      ? ((dbProject as { brief_text?: string }).brief_text ?? "").slice(0, 4000)
      : undefined;

  // ── intake ────────────────────────────────────────────────────────────────

  const handleDropFiles = useCallback(
    async (files: File[]) => {
      try {
        const uploaded = await uploadAttachments.mutateAsync(files);
        setAttachments((prev) => [...prev, ...uploaded]);
      } catch (err) {
        toast({
          title: "Couldn't attach those files",
          description: err instanceof Error ? err.message : "Upload failed",
          variant: "destructive",
        });
      }
    },
    [uploadAttachments, toast],
  );

  const handleRemoveAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  // ── parse ─────────────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!projectId || renders.length === 0) return;
    try {
      const label = `Round ${rounds.length + 1} · ${new Date().toLocaleDateString()}`;
      const round = await createRound.mutateAsync({
        label,
        rawFeedback,
        attachments,
        status: "new",
      });

      const parsed = await parseFeedback.mutateAsync({
        feedback: rawFeedback,
        images: renders.map((r) => ({ angleId: r.baseAngleId, angleName: r.angleName })),
        boothSizeLabel: activeConfigLabel,
        brief: briefText,
        projectId,
      });

      await updateRound.mutateAsync({
        id: round.id,
        items: parsed.items,
        summary: parsed.summary,
        status: "parsed",
      });

      setActiveRound({ ...round, items: parsed.items, summary: parsed.summary, status: "parsed" });
      setItems(parsed.items);
      setSummary(parsed.summary || null);

      if (parsed.items.length === 0) {
        toast({
          title: "Nothing to render from these notes",
          description: parsed.summary || "No note mapped to an image change.",
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't read the feedback",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [
    projectId,
    renders,
    rounds.length,
    rawFeedback,
    attachments,
    activeConfigLabel,
    briefText,
    createRound,
    parseFeedback,
    updateRound,
    toast,
  ]);

  // ── apply ─────────────────────────────────────────────────────────────────

  const handleChangeItem = useCallback((id: string, patch: Partial<FeedbackRevisionItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const handleApply = useCallback(async () => {
    if (!projectId || !activeRound || includedCount === 0) return;
    setApplying(true);
    try {
      await updateRound.mutateAsync({
        id: activeRound.id,
        items,
        summary,
        status: "applying",
      });

      const final = await applyFeedbackRound({
        projectId,
        items,
        renders,
        boothSizeLabel: activeConfigLabel,
        configKey: activeConfigKey,
        configLabel: activeConfigLabel,
        onItemsChange: setItems,
        save: (input) => saveImage.mutateAsync(input),
      });

      const finalProgress = summarizeRoundProgress(final);
      await updateRound.mutateAsync({
        id: activeRound.id,
        items: final,
        summary,
        status: finalProgress.status,
      });

      toast({
        title:
          finalProgress.failed > 0
            ? `Applied with ${finalProgress.failed} failure${finalProgress.failed === 1 ? "" : "s"}`
            : "Revisions applied",
        description: `${finalProgress.imagesDone} of ${finalProgress.imagesTotal} renders updated.`,
        variant: finalProgress.failed > 0 ? "destructive" : undefined,
      });
    } catch (err) {
      toast({
        title: "Couldn't apply the revisions",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  }, [
    projectId,
    activeRound,
    includedCount,
    items,
    summary,
    renders,
    activeConfigLabel,
    activeConfigKey,
    saveImage,
    updateRound,
    toast,
  ]);

  // ── history ───────────────────────────────────────────────────────────────

  const handleSelectRound = useCallback((round: ClientFeedbackRound) => {
    setActiveRound(round);
    setItems(round.items);
    setSummary(round.summary);
    setRawFeedback(round.raw_feedback ?? "");
    setAttachments(round.attachments);
  }, []);

  const handleNewRound = useCallback(() => {
    setActiveRound(null);
    setItems([]);
    setSummary(null);
    setRawFeedback("");
    setAttachments([]);
  }, []);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const parsing = parseFeedback.isPending || createRound.isPending;
  const lastRoundAt = rounds[0]?.created_at
    ? new Date(rounds[0].created_at).toLocaleDateString()
    : null;

  return (
    <AppLayout>
      <div className="px-5 py-5 md:px-10">
        <div className="flex flex-col gap-5 lg:flex-row">
          <WorkSheet
            className="min-w-0 flex-1"
            eyebrow="After export"
            title="Client feedback"
            subtitle="Paste what the client sent — we revise the renders you already have."
            headerRight={
              <>
                {activeConfigLabel && <SpecMono className="text-slate">{activeConfigLabel}</SpecMono>}
                {activeRound && (
                  <Button variant="outline" size="sm" onClick={handleNewRound} disabled={applying}>
                    New round
                  </Button>
                )}
              </>
            }
          >
            {renders.length === 0 ? (
              <EmptyState
                icon={MessageSquareQuote}
                title="No renders to revise yet"
                body="Generate the render set first — client feedback iterates on images that already exist."
                action={
                  <Button asChild>
                    <Link to="/prompts">Go to renders</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-8">
                <FeedbackIntake
                  value={rawFeedback}
                  onChange={setRawFeedback}
                  attachments={attachments}
                  onDropFiles={handleDropFiles}
                  onRemoveAttachment={handleRemoveAttachment}
                  uploading={uploadAttachments.isPending}
                  onParse={handleParse}
                  parsing={parsing}
                  renderCount={renders.length}
                  disabled={applying}
                />

                {summary && (
                  <div className="space-y-2 rounded-square bg-pink-soft px-4 py-3">
                    <SectionLabel accent="pink">What we read</SectionLabel>
                    <p className="text-[13px] leading-[19px] text-charcoal">{summary}</p>
                  </div>
                )}

                {items.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionLabel accent="blue">Proposed revisions</SectionLabel>
                      <div className="flex items-center gap-2">
                        <StatusChip variant={applying ? "generating" : "attention"}>
                          {includedCount} included
                        </StatusChip>
                        {progress.imagesTotal > 0 && (
                          <SpecMono className="text-slate">
                            {progress.imagesTotal} {progress.imagesTotal === 1 ? "edit" : "edits"}
                          </SpecMono>
                        )}
                      </div>
                    </div>

                    <RevisionReviewTable
                      items={items}
                      renders={renders}
                      onChangeItem={handleChangeItem}
                      locked={applying}
                    />

                    {applying && progress.imagesTotal > 0 && (
                      <div className="space-y-1.5">
                        <Progress
                          value={(progress.imagesDone / progress.imagesTotal) * 100}
                          className="h-1.5"
                        />
                        <SpecMono className="text-slate">
                          {progress.imagesDone}/{progress.imagesTotal} renders revised
                        </SpecMono>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 border-t border-cloud-line pt-4">
                      <Button onClick={handleApply} disabled={applying || includedCount === 0}>
                        {applying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Apply to renders
                          </>
                        )}
                      </Button>
                      <p className="text-[12px] leading-[17px] text-slate">
                        Each revision edits the existing render and replaces it as the current
                        image for that view.
                      </p>
                    </div>
                  </div>
                )}

                <BeforeAfterStrip items={items} />

                <div className="space-y-3">
                  <SectionLabel accent="purple">Round history</SectionLabel>
                  <RoundHistory
                    rounds={rounds}
                    activeRoundId={activeRound?.id ?? null}
                    onSelect={handleSelectRound}
                  />
                </div>
              </div>
            )}
          </WorkSheet>

          <FeedbackRail
            renderCount={renders.length}
            configLabel={activeConfigLabel}
            roundCount={rounds.length}
            lastRoundAt={lastRoundAt}
            schemaReady={schemaReady}
            summary={summary}
          />
        </div>
      </div>
    </AppLayout>
  );
}
