// src/components/prompts/BriefClarification.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefClarification } from "./BriefClarification";
import type { Gap } from "@/lib/normalizedBrief";

const gaps: Gap[] = [
  {
    field: "context.venue.name",
    severity: "blocking",
    question: "Where will this booth be shown?",
    fallback: "Unknown venue",
    source: "schema",
  },
  {
    field: "context.audience",
    severity: "helpful",
    question: "Who's the primary audience?",
    options: ["B2B execs", "Designers", "Consumers"],
    fallback: ["general"],
    source: "schema",
  },
];

describe("BriefClarification", () => {
  it("renders one card per gap", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("Where will this booth be shown?")).toBeInTheDocument();
    expect(screen.getByText("Who's the primary audience?")).toBeInTheDocument();
  });

  it("renders quick-pick chips when options are present", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole("button", { name: "B2B execs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Designers" })).toBeInTheDocument();
  });

  it("calls onAnswer with field + value when chip clicked", () => {
    const onAnswer = vi.fn();
    render(<BriefClarification gaps={gaps} onAnswer={onAnswer} onSkip={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Designers" }));
    expect(onAnswer).toHaveBeenCalledWith("context.audience", "Designers");
  });

  it("calls onSkip with the field when skip clicked", () => {
    const onSkip = vi.fn();
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={onSkip} />);
    const skipButtons = screen.getAllByText(/skip/i);
    fireEvent.click(skipButtons[0]);
    expect(onSkip).toHaveBeenCalledWith("context.venue.name");
  });

  it("prioritizes blocking gaps before helpful gaps", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    const cards = screen.getAllByRole("group");
    expect(cards[0]).toHaveTextContent("Where will this booth");
    expect(cards[1]).toHaveTextContent("Who's the primary audience");
  });

  it("returns null when no gaps", () => {
    const { container } = render(
      <BriefClarification gaps={[]} onAnswer={() => {}} onSkip={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Saved-state UX ────────────────────────────────────────────────
  // The previous flow had no visible feedback when the user clicked
  // Save — the card stayed editable, and the user could click Save
  // forever with no indication anything had happened. The saved
  // state shows a green "Saved" badge, displays the committed value
  // read-only, and offers an Edit button to re-open.

  it("after saving a text answer, the card shows a Saved badge and read-only value", () => {
    const textGap: Gap[] = [
      {
        field: "hero.physicalForm",
        severity: "helpful",
        question: "Describe the hero form",
        fallback: "central feature",
        source: "schema",
      },
    ];
    render(<BriefClarification gaps={textGap} onAnswer={() => {}} onSkip={() => {}} />);
    const input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: "suspended mobius ribbon" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("suspended mobius ribbon")).toBeInTheDocument();
    // Input + Save should be gone; Edit + Skip-with-default should
    // also be gone (we don't show "Skip" once the user has answered).
    expect(screen.queryByPlaceholderText(/type your answer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/skip with default/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("clicking Edit returns the card to editable state with the prior value pre-filled", () => {
    const textGap: Gap[] = [
      {
        field: "hero.physicalForm",
        severity: "helpful",
        question: "Describe the hero form",
        fallback: "central feature",
        source: "schema",
      },
    ];
    render(<BriefClarification gaps={textGap} onAnswer={() => {}} onSkip={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), {
      target: { value: "suspended mobius ribbon" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const input = screen.getByPlaceholderText(/type your answer/i) as HTMLInputElement;
    expect(input.value).toBe("suspended mobius ribbon");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("after a chip answer, the card shows the saved chip value read-only", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Designers" }));
    // The "Saved" badge should appear on the audience card.
    expect(screen.getAllByText("Saved").length).toBeGreaterThan(0);
    // The chip-row should be replaced by the read-only Saved value.
    expect(screen.queryByRole("button", { name: "B2B execs" })).not.toBeInTheDocument();
    expect(screen.getByText("Designers")).toBeInTheDocument();
  });

  it("drops the saved state when the gap is removed from the gaps prop", () => {
    const textGap: Gap[] = [
      {
        field: "hero.physicalForm",
        severity: "helpful",
        question: "Describe the hero form",
        fallback: "central feature",
        source: "schema",
      },
    ];
    const { rerender } = render(
      <BriefClarification gaps={textGap} onAnswer={() => {}} onSkip={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), {
      target: { value: "suspended mobius ribbon" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Parent re-renders with the gap resolved (the typical happy path):
    rerender(<BriefClarification gaps={[]} onAnswer={() => {}} onSkip={() => {}} />);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("suspended mobius ribbon")).not.toBeInTheDocument();
  });
});
