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
});
