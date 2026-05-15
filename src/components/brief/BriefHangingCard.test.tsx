import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefHangingCard } from "./BriefHangingCard";
import type { NormalizedHangingElement } from "@/lib/normalizedBrief";

const sampleElement: NormalizedHangingElement = {
  id: "hang_0",
  name: "Primary identity ring",
  physicalForm: "White LED-lit ring, internally backlit.",
  shape: "ring",
  dimensions: { width: 3, depth: 3, thicknessFt: 1 },
  suspensionDropFt: 3,
  position: { x: 3, y: 3 },
  materials: ["brushed aluminum"],
  surfaces: ["front: brand wordmark"],
  lighting: ["edge-lit"],
  printed: ["front: logotype"],
};

describe("BriefHangingCard", () => {
  it("shows the empty state when no elements", () => {
    render(<BriefHangingCard elements={[]} onChange={() => {}} />);
    expect(screen.getByText(/no hanging elements/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders one sub-card per element", () => {
    render(<BriefHangingCard elements={[sampleElement]} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Primary identity ring")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/White LED-lit ring/)).toBeInTheDocument();
  });

  it("calls onChange with a new element when Add clicked", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as NormalizedHangingElement[];
    expect(next).toHaveLength(1);
    expect(next[0].shape).toBe("ring");
  });

  it("calls onChange with the element removed when X clicked", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[sampleElement]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/remove/i));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("updates the name field via onChange", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[sampleElement]} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("Primary identity ring"), {
      target: { value: "Renamed ring" },
    });
    expect(onChange).toHaveBeenCalled();
    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NormalizedHangingElement[];
    expect(latest[0].name).toBe("Renamed ring");
  });
});
