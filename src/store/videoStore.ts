/**
 * Video Store — Zustand store for AI video generation state
 *
 * Tracks generated videos by source angle + camera motion,
 * generation status/progress, and video URLs.
 */

import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export type CameraMotion =
  | "walkthrough"
  | "flythrough"
  | "rotate"
  | "pan"
  | "zoom"
  | "dolly"
  | "detail_orbit";

export interface CameraMotionPreset {
  id: CameraMotion;
  name: string;
  description: string;
  defaultDuration: number;
  icon: string;
}

export const CAMERA_MOTION_PRESETS: CameraMotionPreset[] = [
  {
    id: "walkthrough",
    name: "Walkthrough",
    description: "Slow forward dolly through booth entrance, eye-level",
    defaultDuration: 8,
    icon: "🚶",
  },
  {
    id: "flythrough",
    name: "Flythrough",
    description: "Elevated camera sweeping over the booth from corner to corner",
    defaultDuration: 8,
    icon: "🦅",
  },
  {
    id: "rotate",
    name: "360° Rotate",
    description: "Camera orbits the booth at 45° elevation",
    defaultDuration: 10,
    icon: "🔄",
  },
  {
    id: "pan",
    name: "Pan",
    description: "Horizontal sweep across booth front, eye-level",
    defaultDuration: 6,
    icon: "↔️",
  },
  {
    id: "zoom",
    name: "Zoom In",
    description: "Slow push-in from wide shot to hero detail",
    defaultDuration: 6,
    icon: "🔍",
  },
  {
    id: "dolly",
    name: "Dolly",
    description: "Lateral tracking shot along the front aisle",
    defaultDuration: 6,
    icon: "🎥",
  },
  {
    id: "detail_orbit",
    name: "Detail Orbit",
    description: "Tight orbit around hero installation",
    defaultDuration: 6,
    icon: "🎯",
  },
];

export type VideoStatus = "idle" | "generating" | "processing" | "complete" | "error";

export interface GeneratedVideo {
  id: string; // `${sourceAngleId}_${cameraMotion}`
  sourceAngleId: string;
  sourceAngleName: string;
  sourceImageUrl: string;
  cameraMotion: CameraMotion;
  duration: number;
  status: VideoStatus;
  videoUrl: string | null;
  taskId?: string; // For async providers (Runway, Kling)
  provider?: string;
  error?: string;
  createdAt: Date;
}

interface VideoState {
  projectId: string | null;
  videos: Record<string, GeneratedVideo>;
  isGenerating: boolean;
  currentlyGenerating: string | null;
}

interface VideoActions {
  setProjectId: (id: string | null) => void;
  resetForProject: (projectId: string | null) => void;

  generateVideo: (params: {
    sourceAngleId: string;
    sourceAngleName: string;
    sourceImageUrl: string;
    cameraMotion: CameraMotion;
    duration: number;
    projectId: string;
    boothSize?: string;
  }) => Promise<void>;

  pollVideoStatus: (params: {
    videoId: string;
    taskId: string;
    provider: string;
    projectId: string;
  }) => Promise<void>;

  removeVideo: (videoId: string) => void;
  getVideosForAngle: (angleId: string) => GeneratedVideo[];
  getAllCompletedVideos: () => GeneratedVideo[];
}

type VideoStore = VideoState & VideoActions;

const initialState: VideoState = {
  projectId: null,
  videos: {},
  isGenerating: false,
  currentlyGenerating: null,
};

export const useVideoStore = create<VideoStore>((set, get) => ({
  ...initialState,

  setProjectId: (id) => {
    const current = get().projectId;
    if (current !== id) {
      set({ ...initialState, projectId: id });
    }
  },

  resetForProject: (projectId) => set({ ...initialState, projectId }),

  generateVideo: async ({ sourceAngleId, sourceAngleName, sourceImageUrl, cameraMotion, duration, projectId, boothSize }) => {
    const videoId = `${sourceAngleId}_${cameraMotion}`;

    // Set generating state
    set((s) => ({
      isGenerating: true,
      currentlyGenerating: videoId,
      videos: {
        ...s.videos,
        [videoId]: {
          id: videoId,
          sourceAngleId,
          sourceAngleName,
          sourceImageUrl,
          cameraMotion,
          duration,
          status: "generating",
          videoUrl: null,
          createdAt: new Date(),
        },
      },
    }));

    try {
      const { data, error } = await supabase.functions.invoke("generate-video", {
        body: {
          sourceImageUrl,
          cameraMotion,
          duration,
          sourceAngleName,
          boothSize: boothSize || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (get().projectId !== projectId) return;

      if (data.status === "complete" && data.videoUrl) {
        // Video generated synchronously (e.g., Lovable gateway)
        set((s) => ({
          isGenerating: false,
          currentlyGenerating: null,
          videos: {
            ...s.videos,
            [videoId]: {
              ...s.videos[videoId],
              status: "complete",
              videoUrl: data.videoUrl,
              provider: data.provider,
            },
          },
        }));
      } else if (data.status === "processing" && data.taskId) {
        // Video being processed asynchronously (Runway, Kling)
        set((s) => ({
          isGenerating: false,
          currentlyGenerating: null,
          videos: {
            ...s.videos,
            [videoId]: {
              ...s.videos[videoId],
              status: "processing",
              taskId: data.taskId,
              provider: data.provider,
            },
          },
        }));

        // Start polling
        get().pollVideoStatus({
          videoId,
          taskId: data.taskId,
          provider: data.provider,
          projectId,
        });
      } else {
        throw new Error("Unexpected response format from video generation");
      }
    } catch (error) {
      if (get().projectId !== projectId) return;
      set((s) => ({
        isGenerating: false,
        currentlyGenerating: null,
        videos: {
          ...s.videos,
          [videoId]: {
            ...s.videos[videoId],
            status: "error",
            error: error instanceof Error ? error.message : "Failed to generate video",
          },
        },
      }));
    }
  },

  pollVideoStatus: async ({ videoId, taskId, provider, projectId }) => {
    const maxAttempts = 60; // ~5 minutes with 5s interval
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      if (get().projectId !== projectId) return;

      const video = get().videos[videoId];
      if (!video || video.status !== "processing") return;

      try {
        // Poll the appropriate provider
        // Poll through the edge function to avoid exposing API keys client-side
        const { data, error } = await supabase.functions.invoke("generate-video", {
          body: {
            pollTaskId: taskId,
            provider,
          },
        });

        if (error) continue; // Retry on error

        if (data?.status === "complete" && data?.videoUrl) {
          set((s) => ({
            videos: {
              ...s.videos,
              [videoId]: {
                ...s.videos[videoId],
                status: "complete",
                videoUrl: data.videoUrl,
              },
            },
          }));
          return; // Done polling
        }

        if (data?.status === "failed") {
          set((s) => ({
            videos: {
              ...s.videos,
              [videoId]: {
                ...s.videos[videoId],
                status: "error",
                error: data.error || "Video generation failed",
              },
            },
          }));
          return;
        }

        // Still processing — continue polling
      } catch (_err) {
        // Continue polling on network errors
        console.error("Poll error:", _err);
      }
    }

    // Timeout
    set((s) => ({
      videos: {
        ...s.videos,
        [videoId]: {
          ...s.videos[videoId],
          status: "error",
          error: "Video generation timed out. Please try again.",
        },
      },
    }));
  },

  removeVideo: (videoId) => {
    set((s) => {
      const { [videoId]: _removed, ...remaining } = s.videos;
      return { videos: remaining };
    });
  },

  getVideosForAngle: (angleId) => {
    return Object.values(get().videos).filter((v) => v.sourceAngleId === angleId);
  },

  getAllCompletedVideos: () => {
    return Object.values(get().videos).filter((v) => v.status === "complete" && v.videoUrl);
  },
}));
