import { useEffect, useMemo, useRef, useState } from "react";

/**
 * NodeField — Canopy signature spatial interaction (spec §6).
 *
 * Renders a network of glowing nodes connected by thin lines.
 * Nodes drift subtly toward the cursor (max 8px), lines redraw
 * with eased motion. No jitter, no jank.
 */

interface NodeFieldProps {
  /** Number of nodes to render. */
  count?: number;
  /** Max pixels a node can offset toward the cursor. */
  maxOffset?: number;
  /** Distance threshold (px) for connecting two nodes with a line. */
  linkDistance?: number;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Pulse a few "active" nodes for system-activity feel. */
  activeCount?: number;
}

interface NodePos {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  size: number; // px
  delay: number; // ms — drift animation offset
  active: boolean;
}

export function NodeField({
  count = 14,
  maxOffset = 8,
  linkDistance = 220,
  className,
  activeCount = 3,
}: NodeFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  // Stable, deterministic node positions (so layout doesn't reshuffle on re-render).
  const nodes = useMemo<NodePos[]>(() => {
    // Simple seeded PRNG for deterministic placement.
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: count }, (_, i) => ({
      x: 0.05 + rand() * 0.9,
      y: 0.05 + rand() * 0.9,
      size: 6 + rand() * 8,
      delay: rand() * 4000,
      active: i < activeCount,
    }));
  }, [count, activeCount]);

  // Track wrapper size for absolute → pixel coordinate conversion.
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Mouse tracking — bounded to wrapper, throttled via rAF.
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    let raf = 0;
    let last = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      last = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setMouse(last);
        raf = 0;
      });
    };
    const onLeave = () => setMouse(null);
    window.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Compute current pixel positions (with cursor-driven offset).
  const positions = nodes.map((n) => {
    const baseX = n.x * size.w;
    const baseY = n.y * size.h;
    let ox = 0;
    let oy = 0;
    if (mouse) {
      const dx = mouse.x - baseX;
      const dy = mouse.y - baseY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Falloff: nodes farther from cursor barely move.
      const influence = Math.max(0, 1 - dist / 600);
      ox = (dx / dist) * maxOffset * influence;
      oy = (dy / dist) * maxOffset * influence;
    }
    return { ...n, px: baseX + ox, py: baseY + oy };
  });

  // Build connection lines for nearby node pairs.
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; opacity: number }> = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const dx = a.px - b.px;
      const dy = a.py - b.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < linkDistance) {
        lines.push({
          x1: a.px,
          y1: a.py,
          x2: b.px,
          y2: b.py,
          opacity: Math.max(0.05, 0.25 * (1 - dist / linkDistance)),
        });
      }
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="white"
            strokeOpacity={l.opacity}
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* Nodes */}
      {positions.map((n, i) => (
        <span
          key={i}
          className={`canopy-node absolute ${n.active ? "animate-node-pulse" : "animate-node-drift"}`}
          style={{
            left: n.px,
            top: n.py,
            width: n.size,
            height: n.size,
            transform: "translate(-50%, -50%)",
            transition: "left 0.6s ease-out, top 0.6s ease-out",
            animationDelay: `${n.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
