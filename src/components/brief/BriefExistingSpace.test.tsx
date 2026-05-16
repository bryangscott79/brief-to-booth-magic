import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BriefExistingSpace } from "./BriefExistingSpace";
import type { ParsedBriefExistingSpace, Polygon } from "@/types/brief";

// Hoisted mock state so tests can override invoke behavior per-case.
const invokeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { success: true, analysis: {} }, error: null }),
);

// Hoisted upload mock — we assert on its first argument (the storage
// path) in the B2 RLS-shape regression below.
const uploadMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { path: "x" }, error: null }),
);

// Mock the supabase client so the upload codepath in the empty-state
// drop zone never tries to hit a real backend.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/uploaded.jpg" } }),
      }),
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

// Toast hook is read but never asserted on.
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const SAMPLE: ParsedBriefExistingSpace = {
  photoUrl: "https://example.com/room.jpg",
  annotations: { keep: [], change: [] },
  analysis: {
    estimatedDimensions: { width: 12, depth: 16, ceilingHeightFt: 9 },
    features: ["windows on north wall"],
    existingMaterials: { floors: "oak hardwood" },
    lighting: { naturalLightDirection: "north" },
    summary: "12 × 16 living room, north-facing windows.",
  },
};

describe("BriefExistingSpace", () => {
  it("shows an upload zone in the empty state", () => {
    render(<BriefExistingSpace value={null} onChange={() => {}} projectId="p1" />);
    // Look for the upload affordance — text varies; "upload" or "drop" should appear.
    expect(screen.getByText(/upload|drop/i)).toBeInTheDocument();
  });

  it("renders the photo + summary when populated", () => {
    render(<BriefExistingSpace value={SAMPLE} onChange={() => {}} projectId="p1" />);
    // The summary should be visible (in a textarea or read-only display).
    expect(screen.getByDisplayValue(/12 × 16/i)).toBeInTheDocument();
  });

  it("calls onChange when the user edits the summary", () => {
    const onChange = vi.fn();
    render(<BriefExistingSpace value={SAMPLE} onChange={onChange} projectId="p1" />);
    fireEvent.change(screen.getByDisplayValue(/12 × 16/i), {
      target: { value: "Updated summary" },
    });
    expect(onChange).toHaveBeenCalled();
    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0] as ParsedBriefExistingSpace;
    expect(latest.analysis.summary).toBe("Updated summary");
  });

  it("clears the block (passes null) when Replace photo is clicked", () => {
    const onChange = vi.fn();
    render(<BriefExistingSpace value={SAMPLE} onChange={onChange} projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /replace photo/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // B2 regression: project-images RLS requires
  // (storage.foldername(name))[1] == projectId. The earlier path
  // `existing-space/<projectId>/...` put the literal string
  // "existing-space" as the first segment, so every upload silently
  // failed with an RLS policy violation. This test pins the path
  // layout so we don't regress.
  it("uploads to a path whose first folder segment is the projectId", async () => {
    uploadMock.mockClear();
    const projectId = "11111111-2222-3333-4444-555555555555";
    render(<BriefExistingSpace value={null} onChange={() => {}} projectId={projectId} />);

    const file = new File(["fake-bytes"], "room.jpg", { type: "image/jpeg" });
    const dropInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(dropInput).not.toBeNull();
    await act(async () => {
      fireEvent.change(dropInput!, { target: { files: [file] } });
    });

    expect(uploadMock).toHaveBeenCalled();
    const [path] = uploadMock.mock.calls[0] as [string, ...unknown[]];
    // First folder segment must be the project id (RLS contract).
    expect(path.split("/")[0]).toBe(projectId);
    // The "existing-space" tag is still useful for browsing — it just
    // can't be first.
    expect(path).toMatch(/^[^/]+\/existing-space\/.+\.jpg$/);
  });

  // C1 regression: when the user uploads a photo, the analyze-existing-
  // space invoke takes ~5s. If the user draws a polygon during that
  // window the polygon lands on `value` via onChange. When analyze
  // returns, the merge must preserve those annotations rather than
  // spread a stale baseline that has empty arrays.
  it("preserves user-drawn polygons that land during the analyze window", async () => {
    // Make the invoke hang on a deferred promise we resolve manually.
    let resolveAnalyze: (value: { data: unknown; error: unknown }) => void = () => {};
    const pending = new Promise<{ data: unknown; error: unknown }>((res) => {
      resolveAnalyze = res;
    });
    invokeMock.mockReturnValueOnce(pending);

    // Controlled-component pattern: we own `current` and re-render
    // BriefExistingSpace whenever onChange fires so the ref inside the
    // component points at the latest committed value.
    let current: ParsedBriefExistingSpace | null = null;
    const onChange = vi.fn((next: ParsedBriefExistingSpace | null) => {
      current = next;
    });

    const { rerender } = render(
      <BriefExistingSpace value={current} onChange={onChange} projectId="p1" />,
    );

    // Trigger the drop directly via the dropzone hidden input — the
    // empty-state renders an <input type="file" /> from react-dropzone.
    const file = new File(["fake-bytes"], "room.jpg", { type: "image/jpeg" });
    const dropInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(dropInput).not.toBeNull();
    await act(async () => {
      fireEvent.change(dropInput!, { target: { files: [file] } });
    });

    // After upload completes the optimistic commit lands with empty
    // annotations. We can now re-render with that value so the ref
    // inside the component picks it up.
    expect(current).not.toBeNull();
    expect(current!.annotations.keep).toEqual([]);
    rerender(<BriefExistingSpace value={current} onChange={onChange} projectId="p1" />);

    // Simulate the user drawing a polygon while analyze is pending —
    // call onChange directly with the polygon in place.
    const drawn: Polygon = {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.4, y: 0.4 },
        { x: 0.1, y: 0.4 },
        { x: 0.1, y: 0.1 },
      ],
    };
    const withPolygon: ParsedBriefExistingSpace = {
      ...current!,
      annotations: { keep: [drawn], change: [] },
    };
    onChange(withPolygon);
    rerender(<BriefExistingSpace value={current} onChange={onChange} projectId="p1" />);
    expect(current!.annotations.keep).toHaveLength(1);

    // Now resolve the analyze invoke. The success branch merges the
    // returned analysis into the LATEST value (which contains the
    // polygon) — the polygon must survive.
    await act(async () => {
      resolveAnalyze({
        data: {
          success: true,
          analysis: { features: ["fireplace"], existingMaterials: {}, lighting: {} },
        },
        error: null,
      });
      await pending;
    });

    expect(current!.annotations.keep).toHaveLength(1);
    expect(current!.annotations.keep[0]).toEqual(drawn);
    expect(current!.analysis.features).toContain("fireplace");
  });
});
