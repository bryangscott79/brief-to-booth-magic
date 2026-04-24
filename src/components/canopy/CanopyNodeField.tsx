// CanopyNodeField — the signature interactive hero element.
//
// Renders a network of gradient nodes connected by subtle lines. Nodes respond
// to the cursor with small parallax-style drift (max 8px) + scale up when near.
// SVG-based so it stays crisp and performant.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Node {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  pulseDelay: number; // seconds
}

interface CanopyNodeFieldProps {
  /** Number of nodes */
  count?: number;
  /** Class applied to the outer wrapper */
  className?: string;
  /** Line opacity 0-1 */
  lineOpacity?: number;
  /** Enable cursor interactivity (default true) */
  interactive?: boolean;
  /** Include a canopy structure (8-point radial center) */
  showCanopyStructure?: boolean;
}

// Predefined deterministic node positions so SSR doesn't mismatch
const SCATTER_NODES: Node[] = [
  { id: 0, x: 12, y: 22, pulseDelay: 0 },
  { id: 1, x: 82, y: 14, pulseDelay: 1.2 },
  { id: 2, x: 68, y: 38, pulseDelay: 0.6 },
  { id: 3, x: 24, y: 58, pulseDelay: 1.8 },
  { id: 4, x: 92, y: 62, pulseDelay: 0.3 },
  { id: 5, x: 52, y: 18, pulseDelay: 2.1 },
  { id: 6, x: 36, y: 82, pulseDelay: 0.9 },
  { id: 7, x: 74, y: 86, pulseDelay: 1.5 },
  { id: 8, x: 18, y: 42, pulseDelay: 2.4 },
  { id: 9, x: 58, y: 72, pulseDelay: 0.45 },
  { id: 10, x: 88, y: 34, pulseDelay: 1.75 },
  { id: 11, x: 42, y: 46, pulseDelay: 0.75 },
];

// Pre-calculated connections between nearby nodes
const CONNECTIONS: Array<[number, number]> = [
  [0, 8], [0, 5], [1, 2], [1, 5], [2, 10], [2, 11], [3, 8], [3, 11],
  [4, 7], [4, 10], [5, 11], [6, 9], [7, 9], [8, 11], [9, 11], [10, 11],
];

export function CanopyNodeField({
  count = 12,
  className,
  lineOpacity = 0.15,
  interactive = true,
  showCanopyStructure = true,
}: CanopyNodeFieldProps) {
  const nodes = SCATTER_NODES.slice(0, count);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!interactive) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setMouse({ x, y });
    };
    const onLeave = () => setMouse(null);

    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [interactive]);

  // Compute per-node offset + scale based on cursor proximity
  const computeTransform = (node: Node) => {
    if (!mouse) return { dx: 0, dy: 0, scale: 1, brightness: 1 };
    const dxRaw = mouse.x - node.x;
    const dyRaw = mouse.y - node.y;
    const dist = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw);
    // Pull node slightly toward cursor when near, fall off with distance
    const influence = Math.max(0, 1 - dist / 30);
    const dx = (dxRaw * 0.15) * influence;
    const dy = (dyRaw * 0.15) * influence;
    const scale = 1 + influence * 0.6;
    const brightness = 1 + influence * 0.5;
    return { dx, dy, scale, brightness };
  };

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 overflow-hidden pointer-events-auto", className)}
      aria-hidden
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="canopy-line-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8FD3F4" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#A78BFA" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F472B6" stopOpacity="0.4" />
          </linearGradient>
          <radialGradient id="canopy-node-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity="1" />
            <stop offset="100%" stopColor="#F472B6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Optional canopy structure — large translucent 8-sided polygon centered */}
        {showCanopyStructure && (
          <g opacity={0.35}>
            <polygon
              points="50,15 72,22 83,40 83,60 72,78 50,85 28,78 17,60 17,40 28,22"
              fill="none"
              stroke="url(#canopy-line-gradient)"
              strokeWidth="0.15"
            />
            <g stroke="url(#canopy-line-gradient)" strokeWidth="0.1" opacity="0.6">
              <line x1="50" y1="50" x2="50" y2="15" />
              <line x1="50" y1="50" x2="72" y2="22" />
              <line x1="50" y1="50" x2="83" y2="40" />
              <line x1="50" y1="50" x2="83" y2="60" />
              <line x1="50" y1="50" x2="72" y2="78" />
              <line x1="50" y1="50" x2="50" y2="85" />
              <line x1="50" y1="50" x2="28" y2="78" />
              <line x1="50" y1="50" x2="17" y2="60" />
              <line x1="50" y1="50" x2="17" y2="40" />
              <line x1="50" y1="50" x2="28" y2="22" />
            </g>
          </g>
        )}

        {/* Lines between nearby scatter nodes */}
        {CONNECTIONS.map(([a, b]) => {
          const A = nodes[a];
          const B = nodes[b];
          if (!A || !B) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke="url(#canopy-line-gradient)"
              strokeWidth="0.1"
              opacity={lineOpacity * 2}
            />
          );
        })}
      </svg>

      {/* Scatter nodes (rendered as positioned divs for CSS transforms / animation) */}
      {nodes.map((node) => {
        const { dx, dy, scale, brightness } = computeTransform(node);
        return (
          <div
            key={node.id}
            className="absolute rounded-full pointer-events-none will-change-transform"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: "6px",
              height: "6px",
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`,
              background: "linear-gradient(135deg, #8FD3F4, #A78BFA, #F472B6)",
              boxShadow: `0 0 ${12 * brightness}px rgba(167,139,250,${0.55 * brightness})`,
              transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease",
              animation: `canopy-pulse 2.4s ease-in-out ${node.pulseDelay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}
