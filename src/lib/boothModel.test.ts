// Coverage for the booth → 3D model pipeline: the shared solid plan
// (boothSolids), the Blender Python emitter (blenderScript) and the glTF
// exporter (gltfExport). The assertions are deliberately numeric — a model
// that is the wrong SIZE is worse than no model, and unit slips (feet vs
// metres, corner- vs centre-anchored) are the failure mode that matters.

import { describe, it, expect } from "vitest";
import type { BoothGeometry } from "./geometryModel";
import {
  FT_TO_M,
  buildBoothModelPlan,
  feetToMetres,
  hexToLinearRgb,
  planToMetres,
  signedArea2,
} from "./boothSolids";
import { buildBlenderScript, blenderScriptFilename } from "./blenderScript";
import { buildGltfDocument, buildGltfFile, triangulate } from "./gltfExport";

// ─── Fixtures ────────────────────────────────────────────────────────────────
// A 20' × 30' imperial booth, 16' ceiling:
//   • Lounge        — 10×10 open rect at the front-left corner, 9' tall
//   • Photo Chamber — 10×10 enclosed L at the front-right, NE notch, 12' tall
//   • Halo          — 8×8 circular ring-less disc hung 3' below the ceiling,
//                     centred at (10, 15)

const IMPERIAL: BoothGeometry = {
  width: 20,
  depth: 30,
  ceilingHeightFt: 16,
  measurementSystem: "imperial",
  zones: [
    {
      id: "z1",
      name: "Lounge",
      x: 0,
      y: 0,
      width: 10,
      depth: 10,
      heightFt: 9,
      colorHex: "#8FD3F4",
      structuralForm: "open",
      shape: "rect",
    },
    {
      id: "z2",
      name: "Photo Chamber",
      x: 10,
      y: 0,
      width: 10,
      depth: 10,
      heightFt: 12,
      colorHex: "#A78BFA",
      structuralForm: "enclosed",
      shape: "L",
      shapeParams: { lCorner: "NE", lNotchWidthRatio: 0.5, lNotchDepthRatio: 0.5 },
    },
  ],
  hangingElements: [
    {
      id: "h1",
      name: "Halo",
      x: 10,
      y: 15,
      width: 8,
      depth: 8,
      thicknessFt: 1,
      shape: "circle",
      suspensionDropFt: 3,
    },
  ],
};

const METRIC: BoothGeometry = {
  width: 6,
  depth: 9,
  ceilingHeightFt: 16,
  measurementSystem: "metric",
  zones: [
    {
      id: "m1",
      name: "Stage",
      x: 1,
      y: 2,
      width: 3,
      depth: 2,
      heightFt: 10,
      colorHex: "#F472B6",
      structuralForm: "platform",
    },
  ],
};

const solidNamed = (plan: ReturnType<typeof buildBoothModelPlan>, name: string) => {
  const solid = plan.solids.find((s) => s.name === name);
  expect(solid, `expected a solid named ${name}`).toBeTruthy();
  return solid!;
};

// ─── Units ───────────────────────────────────────────────────────────────────

describe("units", () => {
  it("converts feet to metres with the single conversion constant", () => {
    expect(FT_TO_M).toBe(0.3048);
    expect(feetToMetres(10)).toBeCloseTo(3.048, 6);
    expect(feetToMetres(16)).toBeCloseTo(4.8768, 6);
  });

  it("scales imperial plan lengths but passes metric plan lengths through", () => {
    expect(planToMetres(20, "imperial")).toBeCloseTo(6.096, 6);
    expect(planToMetres(20, "metric")).toBe(20);
  });

  it("converts sRGB hex to linear rgb", () => {
    expect(hexToLinearRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToLinearRgb("#FFFFFF")).toEqual([1, 1, 1]);
    const [r] = hexToLinearRgb("#808080");
    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.25); // mid-grey is ~0.216 linear, not 0.5
  });
});

// ─── Solid plan ──────────────────────────────────────────────────────────────

describe("buildBoothModelPlan", () => {
  const plan = buildBoothModelPlan(IMPERIAL);

  it("authors the model in metres at the exact footprint", () => {
    expect(plan.units).toBe("m");
    expect(plan.boothWidthM).toBeCloseTo(6.096, 4);
    expect(plan.boothDepthM).toBeCloseTo(9.144, 4);
    // Ceiling height is always FEET in the data model, whatever the system.
    expect(plan.ceilingHeightM).toBeCloseTo(4.8768, 4);
  });

  it("lays the carpet at the booth footprint, just under the floor plane", () => {
    const floor = solidNamed(plan, "Booth_Floor");
    const xs = floor.points.map((p) => p.x);
    const ys = floor.points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 4);
    expect(Math.max(...xs)).toBeCloseTo(6.096, 4);
    expect(Math.min(...ys)).toBeCloseTo(0, 4);
    expect(Math.max(...ys)).toBeCloseTo(9.144, 4);
    expect(floor.z1).toBe(0);
    expect(floor.z0).toBeLessThan(0);
    expect(floor.collection).toEqual(["CANOPY_Booth", "Shell"]);
  });

  it("places an open zone as a floor pad plus four uprights at its real height", () => {
    const pad = solidNamed(plan, "Zone_Lounge_Pad");
    expect(pad.points).toEqual([
      { x: 0, y: 0 },
      { x: 3.048, y: 0 },
      { x: 3.048, y: 3.048 },
      { x: 0, y: 3.048 },
    ]);
    expect(pad.collection).toEqual(["CANOPY_Booth", "Zones", "Zone_Lounge"]);

    const uprights = plan.solids.filter((s) => s.role === "upright" && s.sourceId === "z1");
    expect(uprights).toHaveLength(4);
    expect(uprights.map((u) => u.name)).toEqual([
      "Zone_Lounge_Upright_1",
      "Zone_Lounge_Upright_2",
      "Zone_Lounge_Upright_3",
      "Zone_Lounge_Upright_4",
    ]);
    // 9 ft → 2.7432 m, never 9 m.
    for (const u of uprights) {
      expect(u.z0).toBe(0);
      expect(u.z1).toBeCloseTo(9 * FT_TO_M, 4);
    }
  });

  it("notches an L-shaped zone out of the corner the params name", () => {
    const pad = solidNamed(plan, "Zone_Photo_Chamber_Pad");
    // NE = max x / min y, so a half-width half-depth notch removes the
    // rectangle x ∈ [15', 20'], y ∈ [0, 5'] from the 10×10 box at (10, 0).
    expect(pad.points).toEqual([
      { x: 3.048, y: 0 },
      { x: 4.572, y: 0 },
      { x: 4.572, y: 1.524 },
      { x: 6.096, y: 1.524 },
      { x: 6.096, y: 3.048 },
      { x: 3.048, y: 3.048 },
    ]);
    // The notched corner itself is gone.
    expect(pad.points).not.toContainEqual({ x: 6.096, y: 0 });
    // Footprint area = full box minus the notch = 100 - 25 sq ft.
    const areaSqm = signedArea2(pad.points) / 2;
    expect(areaSqm).toBeCloseTo(75 * FT_TO_M * FT_TO_M, 4);
  });

  it("gives an enclosed zone walls on every edge plus a ceiling", () => {
    const walls = plan.solids.filter((s) => s.role === "wall" && s.sourceId === "z2");
    expect(walls).toHaveLength(6); // one per edge of the L
    for (const wall of walls) {
      expect(wall.z1).toBeCloseTo(12 * FT_TO_M, 4);
    }
    const ceiling = solidNamed(plan, "Zone_Photo_Chamber_Ceiling");
    expect(ceiling.z1).toBeCloseTo(12 * FT_TO_M, 4);
    expect(ceiling.z0).toBeLessThan(ceiling.z1);
  });

  it("centres hanging elements and suspends them below the ceiling", () => {
    const halo = solidNamed(plan, "Hanging_Halo");
    const xs = halo.points.map((p) => p.x);
    const ys = halo.points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    // x / y are the CENTRE of the footprint — not the front-left corner.
    expect(cx).toBeCloseTo(10 * FT_TO_M, 3);
    expect(cy).toBeCloseTo(15 * FT_TO_M, 3);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8 * FT_TO_M, 3);
    // Bottom sits at (ceiling 16' − drop 3') and it is 1' thick.
    expect(halo.z0).toBeCloseTo(13 * FT_TO_M, 4);
    expect(halo.z1).toBeCloseTo(14 * FT_TO_M, 4);
    expect(halo.collection).toEqual(["CANOPY_Booth", "Hanging"]);
  });

  it("keeps every footprint counter-clockwise so caps face up", () => {
    for (const solid of plan.solids) {
      expect(signedArea2(solid.points)).toBeGreaterThan(0);
    }
  });

  it("nests a collection per zone and registers every parent", () => {
    expect(plan.collections).toContainEqual(["CANOPY_Booth"]);
    expect(plan.collections).toContainEqual(["CANOPY_Booth", "Zones"]);
    expect(plan.collections).toContainEqual(["CANOPY_Booth", "Zones", "Zone_Lounge"]);
    expect(plan.collections).toContainEqual(["CANOPY_Booth", "Rig"]);
    // Parents always precede children.
    for (let i = 0; i < plan.collections.length; i++) {
      const path = plan.collections[i];
      if (path.length === 1) continue;
      const parentIndex = plan.collections.findIndex(
        (p) => p.join("/") === path.slice(0, -1).join("/"),
      );
      expect(parentIndex).toBeGreaterThanOrEqual(0);
      expect(parentIndex).toBeLessThan(i);
    }
  });

  it("ships a hero camera and a three-point light rig", () => {
    expect(plan.cameras.map((c) => c.name)).toEqual([
      "Camera_Hero",
      "Camera_Front",
      "Camera_Plan",
    ]);
    expect(plan.lights.map((l) => l.name)).toEqual(["Key_Light", "Fill_Light", "Rim_Light"]);
    // The rig sits in front of the booth (negative y) and aims at its centre.
    expect(plan.cameras[0].y).toBeLessThan(0);
    expect(plan.target.x).toBeCloseTo(6.096 / 2, 3);
  });

  it("passes metric plan lengths through untouched but still converts heights", () => {
    const metricPlan = buildBoothModelPlan(METRIC);
    expect(metricPlan.boothWidthM).toBe(6);
    expect(metricPlan.boothDepthM).toBe(9);
    const platform = solidNamed(metricPlan, "Zone_Stage_Platform");
    const xs = platform.points.map((p) => p.x);
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(4); // 1 m + 3 m, NOT converted
    // A platform is a raised floor: 1 ft rise, in metres.
    expect(platform.z1).toBeCloseTo(FT_TO_M, 4);
  });
});

// ─── Blender script ──────────────────────────────────────────────────────────

describe("buildBlenderScript", () => {
  const script = buildBlenderScript(IMPERIAL, { projectName: "Acme", configLabel: "20x30" });

  it("is deterministic", () => {
    expect(buildBlenderScript(IMPERIAL, { projectName: "Acme", configLabel: "20x30" })).toBe(script);
  });

  it("emits a self-contained program with no Blender calls outside Blender", () => {
    expect(script).toContain("import bpy");
    expect(script).toContain("def add_prism(");
    expect(script).toContain("clear_previous(ROOT_COLLECTION)");
    expect(script).toContain("bpy.ops.wm.save_as_mainfile");
    expect(script).toContain("CANOPY_OUT_DIR");
  });

  it("tells the user how to run it and that re-running is safe", () => {
    expect(script).toContain("HOW TO RUN");
    expect(script).toContain("Scripting tab");
    expect(script).toContain("blender -P acme-20x30-blender.py");
    expect(script).toContain("Re-running is safe");
    expect(script).toContain("def clear_previous(");
    // Idempotency: materials are get-or-create so a rebuild never mints .001s.
    expect(script).toContain("bpy.data.materials.get(name) or bpy.data.materials.new(name)");
  });

  it("declares the metre convention in the header", () => {
    expect(script).toContain("authored in METRES");
    expect(script).toContain("1 ft = 0.3048 m");
    expect(script).toContain("Footprint  : 20 × 30 ft");
  });

  it("builds named objects inside per-zone collections", () => {
    expect(script).toContain('collection(["CANOPY_Booth", "Zones", "Zone_Lounge"])');
    expect(script).toContain('add_prism("Zone_Lounge_Pad"');
    expect(script).toContain('add_prism("Zone_Photo_Chamber_Wall_1"');
    expect(script).toContain('add_prism("Hanging_Halo"');
  });

  it("writes zone geometry in metres at the right place", () => {
    // Lounge pad: 10' × 10' at the front-left corner → 3.048 m square.
    expect(script).toContain(
      'add_prism("Zone_Lounge_Pad", [(0.0000, 0.0000), (3.0480, 0.0000), (3.0480, 3.0480), (0.0000, 3.0480)], 0.0000, 0.0200, ["CANOPY_Booth", "Zones", "Zone_Lounge"], "Zone_Lounge")',
    );
  });

  it("creates the camera and the light rig", () => {
    expect(script).toContain('add_camera("Camera_Hero"');
    expect(script).toContain('add_area_light("Key_Light"');
    expect(script).toContain('add_area_light("Fill_Light"');
    expect(script).toContain('add_area_light("Rim_Light"');
    expect(script).toContain("TRACK_TO");
  });

  it("names the downloaded file after the project and booth size", () => {
    expect(blenderScriptFilename({ projectName: "Acme Expo 2027", configLabel: "20x30" })).toBe(
      "acme-expo-2027-20x30-blender.py",
    );
  });
});

// ─── glTF ────────────────────────────────────────────────────────────────────

describe("triangulate", () => {
  it("fans a convex quad", () => {
    const tris = triangulate([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(tris).toHaveLength(6);
  });

  it("triangulates a concave L without leaving the notch filled", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const tris = triangulate(l);
    expect(tris).toHaveLength((l.length - 2) * 3);
    // Summed triangle area equals the polygon area (4×4 box minus a 2×1
    // notch = 14), so no triangle spilled into the notch and none was lost.
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = l[tris[i]];
      const b = l[tris[i + 1]];
      const c = l[tris[i + 2]];
      area += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    }
    expect(area).toBeCloseTo(14, 6);
  });
});

describe("buildGltfDocument", () => {
  const doc = buildGltfDocument(IMPERIAL, { projectName: "Acme", configLabel: "20x30" });

  it("is a valid glTF 2.0 skeleton with one embedded buffer", () => {
    expect(doc.asset.version).toBe("2.0");
    expect(doc.buffers).toHaveLength(1);
    expect(doc.buffers[0].uri.startsWith("data:application/octet-stream;base64,")).toBe(true);
    expect(doc.buffers[0].byteLength).toBeGreaterThan(0);
    expect(doc.scenes[0].nodes.length).toBeGreaterThan(0);
    // Three accessors (position / normal / index) per drawn solid.
    expect(doc.accessors).toHaveLength(doc.meshes.length * 3);
    expect(doc.bufferViews).toHaveLength(doc.meshes.length * 3);
    for (const view of doc.bufferViews) {
      expect(view.byteOffset % 4).toBe(0); // component alignment
    }
  });

  it("carries the same object names as the Blender scene", () => {
    const names = doc.meshes.map((m) => m.name);
    expect(names).toContain("Booth_Floor");
    expect(names).toContain("Zone_Lounge_Pad");
    expect(names).toContain("Zone_Photo_Chamber_Ceiling");
    expect(names).toContain("Hanging_Halo");
    const nodeNames = doc.nodes.map((n) => n.name);
    expect(nodeNames).toContain("Zone_Lounge");
    expect(nodeNames).toContain("Hanging");
    expect(nodeNames).toContain("CANOPY_Booth");
  });

  it("places the floor at the true footprint in Y-up metres", () => {
    const meshIndex = doc.meshes.findIndex((m) => m.name === "Booth_Floor");
    const accessor = doc.accessors[doc.meshes[meshIndex].primitives[0].attributes.POSITION];
    // Booth (x, y, z) → glTF (x, z, −y): width on X, height on Y, depth on −Z.
    expect(accessor.min![0]).toBeCloseTo(0, 3);
    expect(accessor.max![0]).toBeCloseTo(6.096, 3);
    expect(accessor.max![1]).toBeCloseTo(0, 3);
    expect(accessor.min![2]).toBeCloseTo(-9.144, 3);
    expect(accessor.max![2]).toBeCloseTo(0, 3);
  });

  it("suspends the hanging element at the same height as the Blender model", () => {
    const meshIndex = doc.meshes.findIndex((m) => m.name === "Hanging_Halo");
    const accessor = doc.accessors[doc.meshes[meshIndex].primitives[0].attributes.POSITION];
    expect(accessor.min![1]).toBeCloseTo(13 * FT_TO_M, 3);
    expect(accessor.max![1]).toBeCloseTo(14 * FT_TO_M, 3);
  });

  it("serializes to parseable JSON", () => {
    const parsed = JSON.parse(buildGltfFile(IMPERIAL));
    expect(parsed.asset.version).toBe("2.0");
    expect(Array.isArray(parsed.nodes)).toBe(true);
  });
});
