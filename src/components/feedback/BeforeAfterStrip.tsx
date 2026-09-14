// BeforeAfterStrip — what the round actually changed. One pair per revised
// image: the render as the client saw it, and the render that replaced it
// (the new current render for that angle).

import { ArrowRight } from "lucide-react";
import { SectionLabel, SpecMono } from "@/components/shell";
import { collectRevisedTargets, type FeedbackRevisionItem } from "@/lib/feedbackRevision";

export function BeforeAfterStrip({ items }: { items: FeedbackRevisionItem[] }) {
  const pairs = collectRevisedTargets(items);
  if (pairs.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionLabel accent="sky">Before · after</SectionLabel>
      <div className="space-y-4">
        {pairs.map((pair) => (
          <div key={pair.angleId} className="space-y-2 border-t border-cloud-line pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[13px] font-semibold text-navy">{pair.angleName}</p>
              <SpecMono className="text-slate-faint">{pair.baseAngleId}</SpecMono>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <figure className="min-w-0 flex-1">
                <img
                  src={pair.beforeUrl}
                  alt={`${pair.angleName} before`}
                  className="w-full rounded-media border border-cloud-line object-cover"
                  loading="lazy"
                />
                <figcaption className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-faint">
                  Before
                </figcaption>
              </figure>
              <ArrowRight className="h-4 w-4 shrink-0 rotate-90 text-slate-faint sm:rotate-0" strokeWidth={1.5} />
              <figure className="min-w-0 flex-1">
                <img
                  src={pair.afterUrl}
                  alt={`${pair.angleName} after`}
                  className="w-full rounded-media border border-cloud-line object-cover"
                  loading="lazy"
                />
                <figcaption className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-pink-deep">
                  After · now current
                </figcaption>
              </figure>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
