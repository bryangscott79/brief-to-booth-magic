import { ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Translation distance in px (default 24) */
  distance?: number;
  /** direction of entry */
  from?: "up" | "down" | "left" | "right" | "scale";
  as?: "div" | "section" | "article" | "header" | "li";
}

/**
 * Wraps content with a scroll-triggered reveal animation.
 * Uses opacity + translate; respects prefers-reduced-motion via CSS.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  distance = 24,
  from = "up",
  as: Tag = "div",
}: RevealProps) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();

  const hidden = (() => {
    switch (from) {
      case "down":
        return `translate3d(0, -${distance}px, 0)`;
      case "left":
        return `translate3d(-${distance}px, 0, 0)`;
      case "right":
        return `translate3d(${distance}px, 0, 0)`;
      case "scale":
        return `scale(0.96)`;
      case "up":
      default:
        return `translate3d(0, ${distance}px, 0)`;
    }
  })();

  return (
    <Tag
      ref={ref as never}
      className={cn(className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : hidden,
        transition: `opacity 800ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 900ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}
