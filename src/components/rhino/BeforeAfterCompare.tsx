import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface BeforeAfterCompareProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterCompare({
  beforeUrl,
  afterUrl,
  beforeLabel = "Rhino Original",
  afterLabel = "AI Polished",
  className,
}: BeforeAfterCompareProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPosition((x / rect.width) * 100);
  }, []);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      updatePosition(e.touches[0].clientX);
    },
    [updatePosition]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-lg select-none cursor-col-resize", className)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
    >
      {/* After image (full width, behind) */}
      <img
        src={afterUrl}
        alt={afterLabel}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="w-full h-full object-cover"
          style={{ width: `${containerRef.current?.offsetWidth ?? 0}px` }}
          draggable={false}
        />
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
        style={{ left: `${sliderPosition}%` }}
      >
        {/* Slider handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center cursor-col-resize"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <div className="flex gap-0.5">
            <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
            <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-0.5 bg-black/60 text-white text-xs rounded-md">{beforeLabel}</span>
      </div>
      <div className="absolute top-2 right-2">
        <span className="px-2 py-0.5 bg-black/60 text-white text-xs rounded-md">{afterLabel}</span>
      </div>
    </div>
  );
}
