import { describe, expect, it } from "vitest";
import {
  annotationAnchor,
  annotationNoteLines,
  annotationPolygons,
  boundsOfPoints,
  buildAnnotationEditInstruction,
  describeFramePoint,
  describeSceneDepth,
  describeAnnotationLocation,
  regionFromDrag,
  summarizeAnnotations,
} from "@/lib/conceptAnnotations";
import type { ConceptAnnotation } from "@/lib/planningCanvas";

const pin = (x: number, y: number, comment: string): ConceptAnnotation => ({
  id: `pin_${x}_${y}`,
  kind: "pin",
  x,
  y,
  comment,
});

const box = (
  x: number,
  y: number,
  w: number,
  h: number,
  comment: string,
): ConceptAnnotation => ({ id: `box_${x}_${y}`, kind: "region", x, y, w, h, comment });

describe("coordinate → prose", () => {
  it("maps the frame into named thirds", () => {
    expect(describeFramePoint(0.1, 0.9)).toBe("the lower-left of the frame");
    expect(describeFramePoint(0.9, 0.1)).toBe("the upper-right of the frame");
    expect(describeFramePoint(0.5, 0.5)).toBe("the center of the frame");
    expect(describeFramePoint(0.5, 0.1)).toBe("the upper-center of the frame");
    expect(describeFramePoint(0.05, 0.5)).toBe("the middle-left of the frame");
  });

  it("reads height as scene depth — low in the frame is the foreground", () => {
    expect(describeSceneDepth(0.95)).toContain("foreground");
    expect(describeSceneDepth(0.5)).toContain("mid-ground");
    expect(describeSceneDepth(0.05)).toContain("back of the scene");
  });

  it("anchors a pin on itself and a region on its centre", () => {
    expect(annotationAnchor(pin(0.25, 0.75, "x"))).toEqual({ x: 0.25, y: 0.75 });
    const center = annotationAnchor(box(0.2, 0.4, 0.4, 0.2, "x"));
    expect(center.x).toBeCloseTo(0.4);
    expect(center.y).toBeCloseTo(0.5);
  });

  it("anchors a lasso on its bounding-box centre", () => {
    const lasso: ConceptAnnotation = {
      id: "l1",
      kind: "region",
      x: 0,
      y: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.3 },
        { x: 0.4, y: 0.6 },
      ],
      comment: "round it",
    };
    const bounds = boundsOfPoints(lasso.points!);
    expect(bounds.x).toBeCloseTo(0.2);
    expect(bounds.y).toBeCloseTo(0.2);
    expect(bounds.w).toBeCloseTo(0.4);
    expect(bounds.h).toBeCloseTo(0.4);
    const anchor = annotationAnchor(lasso);
    expect(anchor.x).toBeCloseTo(0.4);
    expect(anchor.y).toBeCloseTo(0.4);
  });

  it("describes a region with its coverage so a detail mark reads differently from half the booth", () => {
    const text = describeAnnotationLocation(box(0.1, 0.7, 0.25, 0.2, "this isn't buildable"));
    expect(text).toContain("Region centered on");
    expect(text).toContain("25% of the frame width");
    expect(text).toContain("20% of its height");
  });

  it("normalizes a drag in any direction and clamps to the image", () => {
    const up = regionFromDrag({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.3 });
    expect(up.x).toBeCloseTo(0.2);
    expect(up.y).toBeCloseTo(0.3);
    expect(up.w).toBeCloseTo(0.4);
    expect(up.h).toBeCloseTo(0.5);
    const clamped = regionFromDrag({ x: -0.4, y: 0.5 }, { x: 1.4, y: 1.8 });
    expect(clamped).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
  });
});

describe("annotationNoteLines", () => {
  it("numbers the notes and gives each its spatial context", () => {
    const lines = annotationNoteLines([
      pin(0.15, 0.85, "move this"),
      box(0.5, 0.1, 0.3, 0.2, "keep everything but make this round"),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "1. Pin at the lower-left of the frame — the foreground, nearest the camera: move this",
    );
    expect(lines[1]).toContain("2. Region centered on");
    expect(lines[1]).toContain("keep everything but make this round");
  });

  it("drops marks with no comment — a blank pin is not an instruction", () => {
    expect(annotationNoteLines([pin(0.5, 0.5, "   "), pin(0.2, 0.2, "fix this")])).toEqual([
      "1. Pin at the upper-left of the frame — the upper area / back of the scene: fix this",
    ]);
  });
});

describe("buildAnnotationEditInstruction", () => {
  const notes = [
    pin(0.15, 0.85, "move this"),
    box(0.55, 0.2, 0.2, 0.3, "this isn't buildable"),
  ];

  it("returns an empty string when there is nothing to say", () => {
    expect(buildAnnotationEditInstruction([])).toBe("");
    expect(buildAnnotationEditInstruction([pin(0.5, 0.5, "  ")])).toBe("");
  });

  it("locks everything that wasn't marked, in the hanging-refinement style", () => {
    const out = buildAnnotationEditInstruction(notes);
    expect(out).toContain("Apply ONLY the numbered notes");
    expect(out).toMatch(/camera angle/i);
    expect(out).toMatch(/lighting/i);
    expect(out).toMatch(/people/i);
    expect(out).toMatch(/environment/i);
    expect(out).toContain("anything not named in a note is locked");
  });

  it("carries the numbered notes with their locations", () => {
    const out = buildAnnotationEditInstruction(notes);
    expect(out).toContain("1. Pin at the lower-left of the frame");
    expect(out).toContain("move this");
    expect(out).toContain("2. Region centered on");
    expect(out).toContain("this isn't buildable");
  });

  it("teaches the three asks the owner named", () => {
    const out = buildAnnotationEditInstruction(notes);
    expect(out).toContain('"move this"');
    expect(out).toContain("this isn't buildable");
    expect(out).toContain('"keep everything but make this round"');
  });

  it("adds the region-confinement clause only when a region was marked", () => {
    expect(buildAnnotationEditInstruction(notes)).toContain("confine that change inside the region");
    expect(buildAnnotationEditInstruction([pin(0.5, 0.5, "move this")])).not.toContain(
      "confine that change inside the region",
    );
  });

  it("forbids drawing the marks into the output", () => {
    const out = buildAnnotationEditInstruction(notes);
    expect(out).toContain("are NOT drawn in the reference image");
    expect(out).toMatch(/No overlaid text, pins, numbers, arrows/);
  });

  it("appends an extra note when one is supplied, and can run on that alone", () => {
    const out = buildAnnotationEditInstruction([], "warm the lighting up");
    expect(out).toContain("ADDITIONAL NOTE");
    expect(out).toContain("warm the lighting up");
    expect(out).toContain("(no marks — see the additional note below)");
  });
});

describe("annotationPolygons", () => {
  it("turns a rectangle into its four corners, clockwise from the top-left", () => {
    const polys = annotationPolygons([box(0.1, 0.2, 0.3, 0.4, "fix")]);
    expect(polys).toHaveLength(1);
    expect(polys[0]!.label).toBe("fix");
    const pts = polys[0]!.points;
    expect(pts).toHaveLength(4);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(xs[0]).toBeCloseTo(0.1);
    expect(xs[1]).toBeCloseTo(0.4);
    expect(xs[2]).toBeCloseTo(0.4);
    expect(xs[3]).toBeCloseTo(0.1);
    expect(ys[0]).toBeCloseTo(0.2);
    expect(ys[1]).toBeCloseTo(0.2);
    expect(ys[2]).toBeCloseTo(0.6);
    expect(ys[3]).toBeCloseTo(0.6);
  });

  it("keeps a lasso's own outline", () => {
    const points = [
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.3 },
      { x: 0.4, y: 0.6 },
    ];
    const polys = annotationPolygons([
      { id: "l", kind: "region", x: 0.2, y: 0.2, w: 0.4, h: 0.4, points, comment: "round" },
    ]);
    expect(polys).toHaveLength(1);
    expect(polys[0]!.points).toEqual(points);
  });

  it("ignores pins — a point names an object, it does not bound an editable area", () => {
    expect(annotationPolygons([pin(0.5, 0.5, "move this")])).toEqual([]);
  });

  it("ignores regions with no comment or no area", () => {
    expect(annotationPolygons([box(0.1, 0.1, 0.2, 0.2, "   ")])).toEqual([]);
    expect(annotationPolygons([box(0.1, 0.1, 0, 0, "fix")])).toEqual([]);
  });
});

describe("summarizeAnnotations", () => {
  it("counts the commented marks and quotes the first", () => {
    expect(summarizeAnnotations([pin(0.1, 0.1, "move this"), pin(0.2, 0.2, "")])).toBe(
      "1 mark · move this",
    );
    expect(
      summarizeAnnotations([pin(0.1, 0.1, "move this"), pin(0.2, 0.2, "make it round")]),
    ).toBe("2 marks · move this");
  });

  it("truncates a long first comment", () => {
    const out = summarizeAnnotations([pin(0.1, 0.1, "x".repeat(200))]);
    expect(out.length).toBeLessThan(80);
    expect(out).toContain("…");
  });

  it("says so when nothing was written down", () => {
    expect(summarizeAnnotations([])).toBe("No marks");
  });
});
