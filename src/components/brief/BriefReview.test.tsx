// BriefReview tests
//
// Coverage focus: the cross-section debounce-flush invariant. Multiple
// section commit paths in BriefReview (hanging-elements,
// existing-space) maintain their own debounce timers + "latest" refs.
// When one section issues an IMMEDIATE commit (e.g. replace-photo's
// next === null branch), it must first flush sibling sections' pending
// debounced commits — otherwise the immediate write re-reads the
// committed `brief` snapshot and overwrites still-debounced sibling
// edits with their pre-edit values.
//
// We mock all external deps (supabase, react-query useProject, useAgency,
// useProjectNavigate, the toast hook) and drive the component through
// its child onChange callbacks directly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { ParsedBrief, ParsedBriefExistingSpace } from "@/types/brief";
import type { NormalizedHangingElement } from "@/lib/normalizedBrief";

// ── Hoisted mocks so each test can inspect/override them ─────────────
const saveProjectFieldMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setParsedBriefMock = vi.hoisted(() => vi.fn());
const setActiveStepMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

// Capture the onChange callbacks that BriefReview passes into its
// child cards so a test can fire them directly without rendering deep
// into the cards (which require their own scaffolding).
const childCallbacks = vi.hoisted(() => ({
  hangingOnChange: null as ((next: NormalizedHangingElement[]) => void) | null,
  existingSpaceOnChange:
    null as ((next: ParsedBriefExistingSpace | null) => void) | null,
}));

// useProjectStore is set up as a vi.fn so each test can override its
// return value (via mockImplementation in beforeEach) to simulate a
// specific store snapshot. Default value is unused — beforeEach
// always overrides before render.
vi.mock("@/store/projectStore", () => ({
  useProjectStore: vi.fn(() => ({
    currentProject: null,
    setActiveStep: setActiveStepMock,
    setParsedBrief: setParsedBriefMock,
  })),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProject: () => ({ data: null }),
}));

vi.mock("@/hooks/useProjectSync", () => ({
  saveProjectField: saveProjectFieldMock,
}));

vi.mock("@/hooks/useProjectNavigate", () => ({
  useProjectNavigate: () => ({ navigate: navigateMock }),
}));

vi.mock("@/hooks/useAgency", () => ({
  useAgency: () => ({
    agency: { primary_industry: "interior_design" },
  }),
}));

// Stub out the heavy child cards: their job in this test is only to
// surface the onChange callback that BriefReview passes them. The
// real cards have lots of internal state we don't need.
vi.mock("./BriefHangingCard", () => ({
  BriefHangingCard: (props: {
    elements: NormalizedHangingElement[];
    onChange: (next: NormalizedHangingElement[]) => void;
  }) => {
    childCallbacks.hangingOnChange = props.onChange;
    return null;
  },
}));

vi.mock("./BriefExistingSpace", () => ({
  BriefExistingSpace: (props: {
    value: ParsedBriefExistingSpace | null;
    onChange: (next: ParsedBriefExistingSpace | null) => void;
    projectId: string;
  }) => {
    childCallbacks.existingSpaceOnChange = props.onChange;
    return null;
  },
}));

// Stubs for the rest of the page; these don't matter for the I3
// invariant we're testing.
vi.mock("./OriginalBrief", () => ({ OriginalBrief: () => null }));
vi.mock("@/components/prompts/BriefClarification", () => ({
  BriefClarification: () => null,
}));

// ── Sample data ──────────────────────────────────────────────────────
const SAMPLE_BRIEF_RESET_LATER: ParsedBrief = {
  brand: { name: "Acme", category: "tech", pov: "", personality: [] },
  objectives: { primary: "demo", secondary: [] },
  events: { shows: [], primaryShow: "" },
  audiences: [],
  spatial: { footprints: [] },
  budget: {},
  creative: { embrace: [], avoid: [] },
  requiredDeliverables: [],
} as unknown as ParsedBrief;

function makeBrief(): ParsedBrief {
  return JSON.parse(JSON.stringify(SAMPLE_BRIEF_RESET_LATER)) as ParsedBrief;
}

// Import AFTER the mocks above are registered so the module sees them.
import { useProjectStore } from "@/store/projectStore";
import { BriefReview } from "./BriefReview";

describe("BriefReview — cross-section flush invariant", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveProjectFieldMock.mockClear();
    setParsedBriefMock.mockClear();
    childCallbacks.hangingOnChange = null;
    childCallbacks.existingSpaceOnChange = null;

    // Default store impl: returns the brief and the setters. Tests
    // may override per-case to simulate state transitions.
    (useProjectStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        currentProject: { parsedBrief: makeBrief() },
        setActiveStep: setActiveStepMock,
        setParsedBrief: setParsedBriefMock,
      }),
    );
  });

  // I3 regression: when the user clicks "Replace photo" while a
  // hanging-elements edit is still in its 400ms debounce window, the
  // immediate existing-space commit must include the hanging edit —
  // not the pre-edit hanging value from `brief`.
  it("preserves pending hanging-elements edits when replace-photo fires", async () => {
    render(<BriefReview projectId="proj-1" />);

    // Sanity: child callbacks should be wired.
    expect(childCallbacks.hangingOnChange).not.toBeNull();
    expect(childCallbacks.existingSpaceOnChange).not.toBeNull();

    // 1. User edits a hanging element. This starts a debounced commit
    //    (400ms). Nothing has been written to setParsedBrief yet
    //    because the timer hasn't fired.
    const editedHanging: NormalizedHangingElement[] = [
      {
        id: "h1",
        name: "Identity ring",
        physicalForm: "edited form",
        shape: "ring",
        dimensions: { width: 3, depth: 3, thicknessFt: 1 },
        suspensionDropFt: 3,
        position: { x: 0, y: 0 },
        materials: ["aluminum"],
        surfaces: [],
        lighting: [],
        printed: [],
      },
    ];
    act(() => {
      childCallbacks.hangingOnChange!(editedHanging);
    });

    // Debounce hasn't fired yet — no commit.
    expect(setParsedBriefMock).not.toHaveBeenCalled();
    expect(saveProjectFieldMock).not.toHaveBeenCalled();

    // 2. User clicks Replace photo (immediate commit with null).
    await act(async () => {
      childCallbacks.existingSpaceOnChange!(null);
      // Allow any synchronous microtasks in commit to settle.
      await Promise.resolve();
    });

    // The immediate commit should have flushed the hanging edit first
    // and then written a merged brief containing BOTH the hanging
    // change AND the existing-space cleared field. So setParsedBrief
    // is called at least twice (once for the flushed hanging, once
    // for the existing-space).
    expect(setParsedBriefMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The LAST committed brief must contain the edited hanging
    // element's physicalForm — the bug being regressed would have
    // overwritten it with the pre-edit (default-derived) value.
    const lastCall = setParsedBriefMock.mock.calls[
      setParsedBriefMock.mock.calls.length - 1
    ][0] as ParsedBrief;
    const hangingArr = (lastCall.hangingElements ?? []) as Array<{
      physicalForm?: string;
    }>;
    expect(hangingArr.length).toBeGreaterThan(0);
    expect(hangingArr[0].physicalForm).toBe("edited form");
    // And the existing-space field should be cleared (the Replace
    // photo flow's whole point).
    expect(lastCall.existingSpace).toBeUndefined();
  });
});
