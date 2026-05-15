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
    // After fix #4, the element-level remove button is "Remove element N";
    // chip removes are "Remove material …" etc., so we anchor here.
    fireEvent.click(screen.getByLabelText(/^remove element/i));
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

  it("Add called twice creates two elements with distinct hang_ ids", () => {
    const onChange = vi.fn();
    // Simulate the controlled-component pattern: start with [], add one, then add another
    let current: NormalizedHangingElement[] = [];
    const { rerender } = render(
      <BriefHangingCard
        elements={current}
        onChange={(next) => {
          current = next;
          onChange(next);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    rerender(
      <BriefHangingCard
        elements={current}
        onChange={(next) => {
          current = next;
          onChange(next);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    const final = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NormalizedHangingElement[];
    expect(final).toHaveLength(2);
    expect(final[0].id).not.toBe(final[1].id);
    expect(final.every((e) => e.id.startsWith("hang_"))).toBe(true);
  });

  it("adding a chip via Enter calls onChange with the new chip appended", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[sampleElement]} onChange={onChange} />);
    // Find the Materials chip input by placeholder text
    const input = screen.getByPlaceholderText(/brushed aluminum.*Enter/i);
    fireEvent.change(input, { target: { value: "new material" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NormalizedHangingElement[];
    expect(next[0].materials).toContain("new material");
  });

  it("removing a chip via its X button calls onChange with chip removed", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[sampleElement]} onChange={onChange} />);
    // After fix #4, chip remove aria-label is "Remove material brushed aluminum"
    fireEvent.click(screen.getByLabelText(/^remove material brushed aluminum$/i));
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NormalizedHangingElement[];
    expect(next[0].materials).not.toContain("brushed aluminum");
  });
});
