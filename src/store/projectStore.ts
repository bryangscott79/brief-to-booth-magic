import { create } from "zustand";
import type {
  Project,
  ParsedBrief,
  ElementType,
  ElementState,
  RenderPromptSet
} from "@/types/brief";

interface ProjectStore {
  // State
  currentProject: Project | null;
  projects: Project[];
  isLoading: boolean;
  activeStep: "upload" | "review" | "generate" | "spatial" | "prompts" | "export";
  
  // Actions
  createProject: (name: string) => void;
  loadFromDb: (data: { id: string; name: string; rawBrief: string; parsedBrief: ParsedBrief | null; elements: Record<ElementType, ElementState>; renderPrompts: RenderPromptSet | null }) => void;
  setRawBrief: (brief: string) => void;
  setParsedBrief: (brief: ParsedBrief) => void;
  setElementStatus: (type: ElementType, status: ElementState["status"]) => void;
  setElementData: (type: ElementType, data: any) => void;
  setRenderPrompts: (prompts: RenderPromptSet) => void;
  setActiveStep: (step: ProjectStore["activeStep"]) => void;
  setIsLoading: (loading: boolean) => void;
  resetProject: () => void;
}

const createInitialElements = (): Record<ElementType, ElementState> => ({
  bigIdea: { type: "bigIdea", status: "pending", data: null },
  experienceFramework: { type: "experienceFramework", status: "pending", data: null },
  interactiveMechanics: { type: "interactiveMechanics", status: "pending", data: null },
  digitalStorytelling: { type: "digitalStorytelling", status: "pending", data: null },
  humanConnection: { type: "humanConnection", status: "pending", data: null },
  adjacentActivations: { type: "adjacentActivations", status: "pending", data: null },
  spatialStrategy: { type: "spatialStrategy", status: "pending", data: null },
  budgetLogic: { type: "budgetLogic", status: "pending", data: null },
});

export const useProjectStore = create<ProjectStore>((set, get) => ({
  currentProject: null,
  projects: [],
  isLoading: false,
  activeStep: "upload",

  createProject: (name: string) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      rawBrief: "",
      parsedBrief: null,
      elements: createInitialElements(),
      renderPrompts: null,
    };
    set({ currentProject: newProject, activeStep: "upload" });
  },

  loadFromDb: (data) => {
    const project: Project = {
      id: data.id,
      name: data.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      rawBrief: data.rawBrief,
      parsedBrief: data.parsedBrief,
      elements: data.elements as Record<ElementType, ElementState>,
      renderPrompts: data.renderPrompts,
    };
    // Determine active step from data
    const hasElements = Object.values(data.elements).some(e => e.status === "complete");
    const hasBrief = !!data.parsedBrief;
    let activeStep: ProjectStore["activeStep"] = "upload";
    if (hasBrief) activeStep = "review";
    if (hasElements) activeStep = "generate";
    if (data.renderPrompts) activeStep = "prompts";
    set({ currentProject: project, activeStep });
  },

  setRawBrief: (brief: string) => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({
      currentProject: {
        ...currentProject,
        rawBrief: brief,
        updatedAt: new Date(),
      },
    });
  },

  setParsedBrief: (brief: ParsedBrief) => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({
      currentProject: {
        ...currentProject,
        parsedBrief: brief,
        updatedAt: new Date(),
      },
      activeStep: "review",
    });
  },

  setElementStatus: (type: ElementType, status: ElementState["status"]) => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({
      currentProject: {
        ...currentProject,
        elements: {
          ...currentProject.elements,
          [type]: {
            ...currentProject.elements[type],
            status,
          },
        },
        updatedAt: new Date(),
      },
    });
  },

  setElementData: (type: ElementType, data: any) => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({
      currentProject: {
        ...currentProject,
        elements: {
          ...currentProject.elements,
          [type]: {
            ...currentProject.elements[type],
            status: "complete",
            data,
          },
        },
        updatedAt: new Date(),
      },
    });
  },

  setRenderPrompts: (prompts: RenderPromptSet) => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({
      currentProject: {
        ...currentProject,
        renderPrompts: prompts,
        updatedAt: new Date(),
      },
    });
  },

  setActiveStep: (step) => set({ activeStep: step }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),

  resetProject: () => set({ 
    currentProject: null, 
    activeStep: "upload",
    isLoading: false 
  }),
}));

// Element metadata for UI
export const ELEMENT_META: Record<ElementType, { 
  title: string; 
  description: string; 
  icon: string;
  color: string;
}> = {
  bigIdea: {
    title: "Big Idea",
    description: "Core concept and strategic positioning",
    icon: "💡",
    color: "amber",
  },
  experienceFramework: {
    title: "Experience Framework",
    description: "Visitor journey and design principles",
    icon: "🎯",
    color: "blue",
  },
  interactiveMechanics: {
    title: "Interactive Mechanics",
    description: "Hero installation and engagement systems",
    icon: "⚡",
    color: "purple",
  },
  digitalStorytelling: {
    title: "Digital Storytelling",
    description: "Content strategy and audience tracks",
    icon: "📱",
    color: "cyan",
  },
  humanConnection: {
    title: "Human Connection",
    description: "Meeting zones and conversation spaces",
    icon: "🤝",
    color: "green",
  },
  adjacentActivations: {
    title: "Adjacent Activations",
    description: "Off-booth experiences and events",
    icon: "🎪",
    color: "rose",
  },
  spatialStrategy: {
    title: "Spatial Strategy",
    description: "Floor plans and zone allocations",
    icon: "📐",
    color: "slate",
  },
  budgetLogic: {
    title: "Budget Logic",
    description: "Cost allocation and ROI analysis",
    icon: "💰",
    color: "emerald",
  },
};
