// Smoke coverage for the Model step's UI: the two downloads lead the page,
// the how-to block is present, and the empty state points at Spatial. The
// model state is stubbed so the component is tested independently of the
// project store.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModelBuilder } from "./ModelBuilder";
import type { BoothModelState } from "./useBoothModel";
import type { BoothGeometry } from "@/lib/geometryModel";
import { buildBlenderScript } from "@/lib/blenderScript";

const GEOMETRY: BoothGeometry = {
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
    },
  ],
};

function stubModel(overrides: Partial<BoothModelState> = {}): BoothModelState {
  return {
    geometry: GEOMETRY,
    script: buildBlenderScript(GEOMETRY, { projectName: "Acme", configLabel: "20x30" }),
    scriptFilename: "acme-20x30-blender.py",
    gltfFilename: "acme-20x30.gltf",
    buildGltf: () => "{}",
    stats: { zones: 1, features: 0, hangingElements: 0, objects: 6, materials: 3 },
    configLabel: "20x30",
    projectName: "Acme",
    generatedAt: new Date("2026-09-14T10:00:00Z"),
    rebuild: vi.fn(),
    ...overrides,
  };
}

const renderBuilder = (model: BoothModelState, projectId: string | null = "p1") =>
  render(
    <MemoryRouter>
      <ModelBuilder projectId={projectId} model={model} />
    </MemoryRouter>,
  );

describe("ModelBuilder", () => {
  it("leads with both file downloads", () => {
    renderBuilder(stubModel());
    expect(screen.getByRole("button", { name: /Download Blender script/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download glTF/i })).toBeTruthy();
  });

  it("explains how to run the script", () => {
    renderBuilder(stubModel());
    expect(screen.getByText(/How to use this/i)).toBeTruthy();
    expect(screen.getAllByText(/Scripting/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/acme-20x30-blender\.py/).length).toBeGreaterThan(0);
  });

  it("shows the booth facts the model was built from", () => {
    renderBuilder(stubModel());
    expect(screen.getByText("20×30 ft")).toBeTruthy();
    expect(screen.getByText("16 ft")).toBeTruthy();
  });

  it("sends the user to Spatial when there is no geometry", () => {
    renderBuilder(stubModel({ geometry: null, script: null }));
    expect(screen.getByText(/No booth geometry yet/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Go to Spatial/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/spatial?project=p1");
  });
});
