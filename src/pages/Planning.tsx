// Planning — the post-brief PLANNING CANVAS.
//
// After the brief is parsed there's a gap: the team knows the facts but
// hasn't decided what the thing IS. This step closes it. The right column
// is a conversation with a creative director (the `plan-concepts` edge
// function); the left is a concept board of everything that conversation
// has rendered.
//
// One chat turn → N images:
//   1. The turn is appended to the thread and sent to plan-concepts with
//      the parsed brief, the last 10 turns, and the prompts of the cards
//      already on the board.
//   2. The director replies and emits 0-4 complete renderer prompts
//      (# SCENE / # SPACE / # BRAND / # ENVIRONMENT grammar).
//   3. Each concept becomes a card immediately in "generating" state, then
//      gets its own generate-hero call IN PARALLEL. Cards fill in as their
//      images land, so nothing waits on the slowest render.
//
// Nothing here is destructive: clicking a card aims the next turn at it,
// and the resulting variant is a NEW card. A card only becomes a real
// project render when the user presses "Add to project renders", which
// goes through the normal save-render-image path.

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { WorkSheet, StatusChip } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ConceptBoard } from "@/components/planning/ConceptBoard";
import { ConceptCompare } from "@/components/planning/ConceptCompare";
import { PlanningChat } from "@/components/planning/PlanningChat";
import { RenderPromptDialog } from "@/components/common/RenderPromptDialog";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectStore } from "@/store/projectStore";
import { usePlanningCanvas, usePlanningCanvasActions } from "@/hooks/usePlanningCanvas";
import { useBrandLogo } from "@/hooks/useBrandLogo";
import { useAgencyImageModel } from "@/hooks/useAgencyImageModel";
import { useSaveRenderImage, type ProjectImage } from "@/hooks/useProjectImages";
import { useToast } from "@/hooks/use-toast";
import {
  historyForDirector,
  makeCard,
  makeMessage,
  starterPrompts,
  type PlanningCard,
  type PlanningMessage,
} from "@/lib/planningCanvas";
import {
  conceptAngleId,
  conceptPromptArtifacts,
  planConcepts,
  renderConcept,
} from "@/lib/planningConcepts";

export default function Planning() {
  const { projectId, isLoading } = useProjectSync();
  const currentProject = useProjectStore((s) => s.currentProject);
  const parsedBrief = currentProject?.parsedBrief ?? null;

  const { data: canvas, isLoading: canvasLoading } = usePlanningCanvas(projectId);
  const actions = usePlanningCanvasActions(projectId);
  const { activeLogo } = useBrandLogo(projectId);
  // Full model id — generate-hero attempts it first, then falls back.
  const { modelId: imageModel } = useAgencyImageModel();
  const saveImage = useSaveRenderImage(projectId);
  const { toast } = useToast();

  const [targetCardId, setTargetCardId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [promptCardId, setPromptCardId] = useState<string | null>(null);
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const [draftSeed, setDraftSeed] = useState<string | null>(null);

  // Memoized so the empty-array fallbacks don't churn hook deps every render.
  const messages = useMemo<PlanningMessage[]>(() => canvas?.messages ?? [], [canvas?.messages]);
  const cards = useMemo<PlanningCard[]>(() => canvas?.cards ?? [], [canvas?.cards]);
  const compareIds = useMemo<string[]>(
    () => canvas?.board.compareIds ?? [],
    [canvas?.board.compareIds],
  );
  const schemaReady = canvas?.schemaReady ?? true;

  const generatingCount = cards.filter((c) => c.status === "generating").length;
  const targetCard = targetCardId ? cards.find((c) => c.id === targetCardId) ?? null : null;

  // Footprint label from the brief — the Planning step runs before the
  // spatial canvas exists, so the brief's primary footprint is the only
  // size we can honestly quote.
  const boothSizeLabel = parsedBrief?.spatial?.footprints?.[0]?.size ?? undefined;

  const starters = useMemo(() => starterPrompts(parsedBrief), [parsedBrief]);

  const compareCards = useMemo(
    () =>
      compareIds
        .map((id) => cards.find((c) => c.id === id))
        .filter((c): c is PlanningCard => Boolean(c)),
    [compareIds, cards],
  );

  // ── The one real flow: a chat turn becomes N images ──────────────────────
  const handleSend = useCallback(
    async (text: string) => {
      if (!projectId) return;

      const aimedAt = targetCardId ? cards.find((c) => c.id === targetCardId) ?? null : null;
      actions.appendMessage(
        makeMessage("user", text, { targetCardId: aimedAt?.id ?? null }),
      );
      setTargetCardId(null);
      setPlanning(true);

      // A follow-up carries its target inline — the director gets the
      // card's own prompt in existingCards and changes only what was asked.
      const directorMessage = aimedAt
        ? `Feedback on the concept "${aimedAt.label}" (card id ${aimedAt.id}): ${text}`
        : text;

      let created: PlanningCard[] = [];
      try {
        const result = await planConcepts({
          brief: parsedBrief,
          history: historyForDirector(messages, 10),
          message: directorMessage,
          existingCards: cards.map((c) => ({ id: c.id, label: c.label, prompt: c.prompt })),
          boothSizeLabel,
        });

        created = result.concepts.map((concept) =>
          makeCard({
            label: concept.label,
            prompt: concept.prompt,
            rationale: concept.rationale,
            parentId: aimedAt?.id ?? null,
          }),
        );

        actions.appendMessage(
          makeMessage(
            "assistant",
            result.reply ||
              (created.length > 0
                ? `Rendering ${created.length} direction${created.length === 1 ? "" : "s"}.`
                : "Nothing to render yet."),
            { cardIds: created.map((c) => c.id) },
          ),
        );
        if (created.length > 0) actions.addCards(created);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Planning failed";
        actions.appendMessage(makeMessage("assistant", message, { error: true }));
        toast({ title: "Couldn't plan concepts", description: message, variant: "destructive" });
        return;
      } finally {
        setPlanning(false);
      }

      // Fan out: every concept renders independently so one slow or failed
      // image never holds up the rest of the board.
      await Promise.all(
        created.map(async (card) => {
          try {
            const render = await renderConcept({
              prompt: card.prompt,
              projectId,
              boothSize: boothSizeLabel,
              imageModel,
              brandLogoUrl: activeLogo?.publicUrl ?? null,
            });
            actions.updateCard(card.id, {
              status: "complete",
              imageUrl: render.imageUrl,
              modelUsed: render.modelUsed,
              negative: render.negative,
              prompt: render.promptUsed,
            });
          } catch (err) {
            actions.updateCard(card.id, {
              status: "error",
              error: err instanceof Error ? err.message : "Render failed",
            });
          }
        }),
      );
    },
    [
      projectId,
      targetCardId,
      cards,
      messages,
      parsedBrief,
      boothSizeLabel,
      imageModel,
      activeLogo?.publicUrl,
      actions,
      toast,
    ],
  );

  // ── Promote a card to a real project render ──────────────────────────────
  const handleAddToRenders = useCallback(
    async (cardId: string) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card || !card.imageUrl || card.status !== "complete") return;

      // cards are stored newest-first — index from the tail gives the
      // card's creation order, so concept_1 stays concept_1 forever.
      const idx = cards.findIndex((c) => c.id === cardId);
      const angleId = conceptAngleId(cards.length - 1 - idx);

      setSavingCardId(cardId);
      try {
        await saveImage.mutateAsync({
          angleId,
          angleName: card.label,
          imageDataUrl: card.imageUrl,
          modelUsed: card.modelUsed,
          promptArtifacts: conceptPromptArtifacts({
            prompt: card.prompt,
            negative: card.negative ?? "",
            label: card.label,
            rationale: card.rationale,
            model: card.modelUsed,
            brandLogoUrl: activeLogo?.publicUrl ?? null,
            generatedAt: card.createdAt,
          }),
        });
        actions.updateCard(cardId, { angleId });
        toast({
          title: "Added to project renders",
          description: `"${card.label}" is now in this project's Files as ${angleId}.`,
        });
      } catch (err) {
        toast({
          title: "Couldn't add to renders",
          description: err instanceof Error ? err.message : "Save failed",
          variant: "destructive",
        });
      } finally {
        setSavingCardId(null);
      }
    },
    [cards, saveImage, actions, activeLogo?.publicUrl, toast],
  );

  // The prompt dialog reads a ProjectImage; a board card isn't one yet, so
  // synthesize the shape it needs. Same dialog, same reading experience.
  const promptImage = useMemo<ProjectImage | null>(() => {
    const card = promptCardId ? cards.find((c) => c.id === promptCardId) ?? null : null;
    if (!card || !projectId) return null;
    return {
      id: card.id,
      project_id: projectId,
      user_id: "",
      angle_id: card.angleId ?? "planning_concept",
      angle_name: card.label,
      storage_path: "",
      public_url: card.imageUrl ?? "",
      is_current: false,
      created_at: card.createdAt,
      prompt_artifacts: conceptPromptArtifacts({
        prompt: card.prompt,
        negative: card.negative ?? "",
        label: card.label,
        rationale: card.rationale,
        model: card.modelUsed,
        brandLogoUrl: activeLogo?.publicUrl ?? null,
        generatedAt: card.createdAt,
      }) as ProjectImage["prompt_artifacts"],
    };
  }, [promptCardId, cards, projectId, activeLogo?.publicUrl]);

  if (isLoading || canvasLoading) {
    return (
      <AppLayout surface="light">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const favorites = cards.filter((c) => c.favorite).length;

  return (
    <AppLayout surface="light">
      <div className="px-5 py-5 md:px-10">
        <div className="flex flex-col gap-5 lg:flex-row">
          <WorkSheet
            className="min-w-0 flex-1"
            eyebrow="Planning · concept board"
            title="Plan the visuals"
            subtitle="Talk it through, render the directions worth seeing, and keep the ones that earn their place."
            headerRight={
              <>
                {cards.length > 0 && (
                  <StatusChip variant="neutral">
                    <span className="font-mono">{cards.length}</span> concept
                    {cards.length === 1 ? "" : "s"}
                  </StatusChip>
                )}
                {favorites > 0 && (
                  <StatusChip variant="attention">
                    <span className="font-mono">{favorites}</span> starred
                  </StatusChip>
                )}
              </>
            }
          >
            {!schemaReady && (
              <p className="mb-4 rounded-tag bg-amber-soft px-2.5 py-1.5 text-[12px] leading-[16px] text-warn">
                Saving to this browser only — the <span className="font-mono">planning_canvas</span>{" "}
                table isn't in the schema yet. Apply the migration to share this board across
                devices.
              </p>
            )}

            {!parsedBrief && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-square border border-cloud-line bg-cloud px-3.5 py-3">
                <p className="text-[12px] leading-[17px] text-slate">
                  No parsed brief yet. Canopy can still plan, but it won't know the brand,
                  objectives, budget tier, or footprint.
                </p>
                {projectId && (
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px]">
                    <Link to={`/upload?project=${projectId}`}>
                      Add the brief
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <ConceptBoard
              cards={cards}
              targetCardId={targetCardId}
              compareIds={compareIds}
              savingCardId={savingCardId}
              onTarget={(id) => setTargetCardId((cur) => (cur === id ? null : id))}
              onToggleCompare={actions.toggleCompare}
              onClearCompare={actions.clearCompare}
              onOpenCompare={() => setCompareOpen(true)}
              onToggleFlag={actions.toggleFlag}
              onNotesChange={actions.setNotes}
              onViewPrompt={setPromptCardId}
              onAddToRenders={(id) => void handleAddToRenders(id)}
              onRemove={(id) => {
                if (targetCardId === id) setTargetCardId(null);
                actions.removeCard(id);
              }}
              starters={starters}
              onStarter={setDraftSeed}
              busy={planning || generatingCount > 0}
            />
          </WorkSheet>

          <PlanningChat
            className="w-full shrink-0 self-start lg:w-[372px]"
            messages={messages}
            targetCardId={targetCardId}
            targetCardLabel={targetCard?.label ?? null}
            onClearTarget={() => setTargetCardId(null)}
            onSend={handleSend}
            planning={planning}
            generatingCount={generatingCount}
            disabled={!projectId}
            disabledReason={!projectId ? "Open a project to start planning." : undefined}
            draftSeed={draftSeed}
            onDraftSeedConsumed={() => setDraftSeed(null)}
          />
        </div>
      </div>

      <ConceptCompare
        cards={compareCards}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />
      <RenderPromptDialog image={promptImage} onClose={() => setPromptCardId(null)} />
    </AppLayout>
  );
}
