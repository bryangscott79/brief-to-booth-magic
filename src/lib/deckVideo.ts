// deckVideo — durable persistence for a walkthrough clip the deck embeds.
//
// Generated videos live only in memory (videoStore) and their provider URLs
// expire within hours, so a deck can't reference them directly. When the
// user chooses "Embed walkthrough", the mp4 is fetched once and copied into
// the PUBLIC project-images bucket under `{projectId}/walkthrough_{ts}.mp4`
// (the bucket's RLS keys ownership off the first path segment, exactly like
// renders), and the resulting public URL is what project_decks.content.video
// stores. No signing needed — project-images stays public.

import { supabase } from "@/integrations/supabase/client";
import { CAMERA_MOTION_PRESETS, type GeneratedVideo } from "@/store/videoStore";
import type { DeckVideoContent } from "@/hooks/useProjectDeck";

export const WALKTHROUGH_BUCKET = "project-images";

export const walkthroughStoragePath = (projectId: string, ts: number = Date.now()): string =>
  `${projectId}/walkthrough_${ts}.mp4`;

export const walkthroughLabel = (video: Pick<GeneratedVideo, "sourceAngleName" | "cameraMotion">): string => {
  const motion = CAMERA_MOTION_PRESETS.find((p) => p.id === video.cameraMotion)?.name ?? "Walkthrough";
  return video.sourceAngleName ? `${video.sourceAngleName} — ${motion}` : motion;
};

/** Copy a completed video into project storage and describe it for the deck.
 *  Throws with a readable message when the provider URL can't be fetched
 *  (expired / no CORS) or the upload is rejected. */
export async function persistWalkthroughVideo(
  projectId: string,
  video: GeneratedVideo,
  posterUrl?: string | null,
): Promise<DeckVideoContent> {
  if (!video.videoUrl) throw new Error("This video has no playable URL yet.");

  let blob: Blob;
  try {
    const res = await fetch(video.videoUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch (err) {
    throw new Error(
      `Couldn't fetch the video from the provider (${err instanceof Error ? err.message : "network error"}). ` +
        "Provider links expire — regenerate it in Files → Video and embed again.",
    );
  }
  if (!blob.size) throw new Error("The provider returned an empty video file.");

  const path = walkthroughStoragePath(projectId);
  const { error: uploadError } = await supabase.storage
    .from(WALKTHROUGH_BUCKET)
    .upload(path, blob, { contentType: blob.type || "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from(WALKTHROUGH_BUCKET).getPublicUrl(path);

  return {
    url: data.publicUrl,
    path,
    posterUrl: posterUrl ?? video.sourceImageUrl ?? undefined,
    label: walkthroughLabel(video),
    durationSec: video.duration,
    sourceVideoId: video.id,
  };
}

/** Best-effort removal of a previously persisted clip (never throws). */
export async function removeWalkthroughVideo(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(WALKTHROUGH_BUCKET).remove([path]);
  } catch {
    // Orphaned file at worst — the deck row no longer references it.
  }
}
