// ConceptFocus smoke coverage — the wiring the pure helpers can't pin:
// a mark becomes an annotation with the user's comment, the prompt editor
// runs what's in the box, and the version filmstrip is non-destructive.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConceptFocus } from "@/components/planning/ConceptFocus";
import { makeCard, makeVersion, type ConceptAnnotation, type PlanningCard } from "@/lib/planningCanvas";
import { annotationPolygons } from "@/lib/conceptAnnotations";

const v1 = makeVersion({
  id: "ver_1",
  imageUrl: "https://cdn/one.png",
  prompt: "# SCENE\nthe original",
  source: "initial",
});
const v2 = makeVersion({
  id: "ver_2",
  imageUrl: "https://cdn/two.png",
  prompt: "# SCENE\nthe original",
  source: "annotated",
  note: "1 mark · move this",
});

const card = (): PlanningCard => ({
  ...makeCard({ label: "Atrium", prompt: "# SCENE\nthe original" }),
  status: "complete",
  imageUrl: "https://cdn/one.png",
  versions: [v1, v2],
  currentVersionId: "ver_2",
});

const props = () => ({
  card: card(),
  index: 1,
  total: 3,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onClose: vi.fn(),
  onRunAnnotations: vi.fn(),
  onRunPrompt: vi.fn(),
  onSelectVersion: vi.fn(),
  onMakeHero: vi.fn(),
  onAddToRenders: vi.fn(),
  carried: false,
  onCarryForward: vi.fn(),
  busy: false,
  savingRender: false,
});

const stage = () => screen.getByRole("application", { name: /annotation surface/i });

// jsdom has no PointerEvent, and fireEvent.pointerDown drops clientX/clientY
// on the plain Event it falls back to — dispatch a MouseEvent under the
// pointer type instead so real coordinates reach the handler.
function pointer(type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) {
  const el = stage();
  act(() => {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }),
    );
  });
}

describe("ConceptFocus", () => {
  beforeEach(() => {
    // jsdom has no layout — give the annotation surface a real box so
    // normalized coordinates come out of the middle of the image.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      top: 0,
      left: 0,
      right: 400,
      bottom: 200,
      toJSON: () => ({}),
    } as DOMRect);
  });

  it("shows the current version's image and prompt, and the whole stack", () => {
    render(<ConceptFocus {...props()} />);
    expect(screen.getByAltText("Atrium")).toHaveAttribute("src", "https://cdn/two.png");
    expect(screen.getByLabelText(/concept prompt/i)).toHaveValue("# SCENE\nthe original");
    expect(screen.getByText(/v1 · Original/)).toBeInTheDocument();
    expect(screen.getByText(/v2 · Marked up/)).toBeInTheDocument();
    expect(screen.getByText("1 mark · move this")).toBeInTheDocument();
  });

  it("carries the direction forward from the version footer, and reads back as carried", () => {
    const p = props();
    const { rerender } = render(<ConceptFocus {...p} />);

    fireEvent.click(screen.getByRole("button", { name: /^carry forward$/i }));
    expect(p.onCarryForward).toHaveBeenCalledTimes(1);

    rerender(<ConceptFocus {...p} carried />);
    const pressed = screen.getByRole("button", { name: /carried forward/i });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/this direction is carried forward/i)).toBeInTheDocument();
  });

  it("a pin click plus a comment runs as one normalized annotation", () => {
    const p = props();
    render(<ConceptFocus {...p} />);

    pointer("pointerdown", 100, 150);
    pointer("pointerup", 100, 150);

    const comment = screen.getByLabelText(/comment on mark 1/i);
    fireEvent.change(comment, { target: { value: "move this" } });

    fireEvent.click(screen.getByRole("button", { name: /run with 1 mark/i }));
    expect(p.onRunAnnotations).toHaveBeenCalledTimes(1);
    const [annotations] = p.onRunAnnotations.mock.calls[0] as [
      Array<{ kind: string; x: number; y: number; comment: string }>,
    ];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]!.kind).toBe("pin");
    expect(annotations[0]!.comment).toBe("move this");
    expect(annotations[0]!.x).toBeCloseTo(0.25);
    expect(annotations[0]!.y).toBeCloseTo(0.75);
  });

  it("a box drag becomes a region annotation, and a region is what feeds the mask", () => {
    const p = props();
    render(<ConceptFocus {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /drag a rectangle/i }));

    pointer("pointerdown", 40, 20);
    pointer("pointermove", 200, 120);
    pointer("pointerup", 200, 120);

    fireEvent.change(screen.getByLabelText(/comment on mark 1/i), {
      target: { value: "this isn't buildable" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run with 1 mark/i }));

    const [annotations] = p.onRunAnnotations.mock.calls[0] as [ConceptAnnotation[]];
    expect(annotations[0]!.kind).toBe("region");
    expect(annotations[0]!.x).toBeCloseTo(0.1);
    expect(annotations[0]!.y).toBeCloseTo(0.1);
    expect(annotations[0]!.w).toBeCloseTo(0.4);
    expect(annotations[0]!.h).toBeCloseTo(0.5);
    // Only regions rasterize into the edit mask.
    expect(annotationPolygons(annotations)).toHaveLength(1);
  });

  it("won't run marks that have no comment", () => {
    const p = props();
    render(<ConceptFocus {...p} />);
    pointer("pointerdown", 10, 10);
    pointer("pointerup", 10, 10);
    expect(screen.getByRole("button", { name: /run with no marks/i })).toBeDisabled();
    expect(p.onRunAnnotations).not.toHaveBeenCalled();
  });

  it("deletes a mark before it runs", () => {
    render(<ConceptFocus {...props()} />);
    pointer("pointerdown", 10, 10);
    pointer("pointerup", 10, 10);
    expect(screen.getByLabelText(/comment on mark 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete mark 1/i }));
    expect(screen.queryByLabelText(/comment on mark 1/i)).not.toBeInTheDocument();
  });

  it("runs the edited prompt as a fresh generation", () => {
    const p = props();
    render(<ConceptFocus {...p} />);
    fireEvent.change(screen.getByLabelText(/concept prompt/i), {
      target: { value: "# SCENE\na rounder canopy over the bar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run this prompt/i }));
    expect(p.onRunPrompt).toHaveBeenCalledWith("# SCENE\na rounder canopy over the bar");
  });

  it("switching versions and making one the hero go through their own callbacks", () => {
    const p = props();
    render(<ConceptFocus {...p} />);
    fireEvent.click(screen.getByText(/v1 · Original/));
    expect(p.onSelectVersion).toHaveBeenCalledWith("ver_1");

    fireEvent.click(screen.getByRole("button", { name: /make hero/i }));
    expect(p.onMakeHero).toHaveBeenCalledWith("ver_2");

    fireEvent.click(screen.getByRole("button", { name: /add to project renders/i }));
    expect(p.onAddToRenders).toHaveBeenCalledWith("ver_2");
  });

  it("← → step between concepts", () => {
    const p = props();
    render(<ConceptFocus {...p} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(p.onNext).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(p.onPrev).toHaveBeenCalled();
  });
});
