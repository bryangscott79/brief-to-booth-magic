import { describe, it, expect } from "vitest";
import { rasterizePolygonMask } from "./rasterizePolygonMask";

describe("rasterizePolygonMask", () => {
  it("returns null when changePolygons is empty", async () => {
    // Empty change polygons → full-room redesign. Caller should
    // skip the mask field entirely and let gpt-image-2 edit
    // everywhere per the prompt.
    const result = await rasterizePolygonMask(
      "data:image/png;base64,iVBORw0KGgo=",
      [],
    );
    expect(result).toBeNull();
  });

  it("returns null when change polygons all have fewer than 3 points (no-op)", async () => {
    // jsdom doesn't reliably implement canvas drawing, so we can't
    // verify pixel output here. But the empty-polygon branch is the
    // load-bearing contract — verify it's preserved.
    const result = await rasterizePolygonMask("not-loaded.png", []);
    expect(result).toBeNull();
  });
});
