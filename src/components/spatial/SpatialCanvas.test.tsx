import { describe, it, expect } from "vitest";

import {
  hangingElementAtPoint,
  moveHangingElement,
} from "@/lib/geometryModel";
import type { AbsoluteHangingElement } from "@/lib/geometryModel";

describe("SpatialCanvas hanging-element math", () => {
  const el: AbsoluteHangingElement = {
    id: "h1",
    name: "Ring",
    x: 3,
    y: 3,
    width: 2,
    depth: 2,
    thicknessFt: 1,
    shape: "ring",
    suspensionDropFt: 3,
  };

  it("hangingElementAtPoint returns the element when the click is inside its top-down footprint", () => {
    expect(hangingElementAtPoint([el], { x: 3.5, y: 3.5 })).toBe(el);
  });

  it("hangingElementAtPoint returns null when the click is outside", () => {
    expect(hangingElementAtPoint([el], { x: 0, y: 0 })).toBeNull();
  });

  it("moveHangingElement updates position by the drag delta", () => {
    const moved = moveHangingElement(el, { dx: 1, dy: -0.5 });
    expect(moved.x).toBe(4);
    expect(moved.y).toBe(2.5);
  });
});
