import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefExistingSpace } from "./BriefExistingSpace";
import type { ParsedBriefExistingSpace } from "@/types/brief";

// Mock the supabase client so the upload codepath in the empty-state
// drop zone never tries to hit a real backend. None of the four tests
// exercise the drop path — they cover empty + populated rendering and
// onChange — so a stub is sufficient.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "x" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/uploaded.jpg" } }),
      }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true, analysis: {} }, error: null }),
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
});
