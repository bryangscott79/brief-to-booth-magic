/**
 * DeckPreview — Live in-browser slide deck viewer
 *
 * Renders every proposal section as a polished HTML slide,
 * branded to both the agency and the client, with navigation,
 * fullscreen, and direct download.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
  X,
  Presentation,
  Grid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildProposalSections, type ProposalData, type ProposalSection } from "@/lib/proposalGenerator";

// ────────────────────────────────────────────────────────────
// SLIDE RENDERER — maps each section type to a React layout
// ────────────────────────────────────────────────────────────

function SlideContent({ section, config }: { section: ProposalSection; config: ProposalData['config'] }) {
  const brandColor = config.brandColor || '#0047AB';
  const c = section.content;

  if (section.type === 'cover') {
    return (
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-white px-16" style={{ background: brandColor }}>
          {c.clientLogo && <img src={c.clientLogo} alt="client" className="h-12 mb-6 object-contain brightness-0 invert" />}
          <h1 className="text-5xl font-bold text-center leading-tight mb-4">{c.projectTitle}</h1>
          {(c.showName || c.footprintSize) && (
            <p className="text-xl opacity-80 text-center">{[c.showName, c.footprintSize].filter(Boolean).join('  ·  ')}</p>
          )}
        </div>
        <div className="bg-white flex items-center justify-between px-16 py-6">
          <div className="flex items-center gap-4">
            {c.exhibitHouseLogo
              ? <img src={c.exhibitHouseLogo} alt="agency" className="h-8 object-contain" />
              : <span className="font-bold text-lg" style={{ color: brandColor }}>{c.exhibitHouseName}</span>}
          </div>
          <span className="text-sm text-gray-500">Prepared for {c.clientName}  ·  {c.date}</span>
        </div>
      </div>
    );
  }

  // Project Brief Overview
  if (section.id === 'project-brief') {
    return (
      <SlideShell title={section.title} brandColor={brandColor}>
        <div className="grid grid-cols-2 gap-8 h-full">
          <div className="space-y-3">
            {[
              ['Event', c.eventName], ['Venue', c.venue], ['Dates', c.dates],
              ['Space', c.spaceSize], ['Deadline', c.proposalDeadline], ['Contact', c.contactName],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: brandColor }}>{label}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
            {(c.budgetMin || c.budgetPerShow) && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: `${brandColor}12` }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: brandColor }}>Budget Range</p>
                <p className="text-2xl font-bold text-gray-900">
                  {c.budgetMin ? `$${c.budgetMin.toLocaleString()} – $${c.budgetMax?.toLocaleString()}` : `$${c.budgetPerShow?.toLocaleString()}/show`}
                </p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {c.objectives?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: brandColor }}>Objectives</p>
                {c.objectives.slice(0, 5).map((o: string, i: number) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <span className="text-xs mt-0.5" style={{ color: brandColor }}>•</span>
                    <p className="text-sm text-gray-700 leading-snug">{o}</p>
                  </div>
                ))}
              </div>
            )}
            {c.deliverables?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: brandColor }}>Deliverables</p>
                {c.deliverables.slice(0, 6).map((d: string, i: number) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <span className="text-xs mt-0.5" style={{ color: brandColor }}>✓</span>
                    <p className="text-sm text-gray-700 leading-snug">{d}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SlideShell>
    );
  }

  // Spatial Metrics
  if (section.id === 'spatial-metrics') {
    const kpis = [
      { label: 'Layout Score', value: `${c.overallScore}/100`, sub: 'composite' },
      { label: 'Visitors/Day', value: (c.totalExpectedVisitors || 0).toLocaleString(), sub: 'projected' },
      { label: 'Avg Dwell', value: `${c.avgBoothTime}m`, sub: 'industry avg 3.5m' },
      { label: 'Flow Efficiency', value: `${c.flowEfficiency}%`, sub: 'circulation' },
      { label: 'Lead Projection', value: c.leadProjection?.toLocaleString(), sub: 'qualified/day' },
    ];
    return (
      <SlideShell title={section.title} brandColor={brandColor}>
        <div className="grid grid-cols-5 gap-3 mb-5">
          {kpis.map(kpi => (
            <div key={kpi.label} className="rounded-lg p-3 text-center" style={{ background: `${brandColor}12` }}>
              <p className="text-xl font-bold" style={{ color: brandColor }}>{kpi.value}</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5">{kpi.label}</p>
              <p className="text-[10px] text-gray-400">{kpi.sub}</p>
            </div>
          ))}
        </div>
        {c.zoneMetrics?.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: `${brandColor}18` }}>
                {['Zone', 'Traffic', 'Dwell', 'Engagement'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.zoneMetrics.slice(0, 7).map((z: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{z.zoneName}</td>
                  <td className="px-3 py-1.5 text-gray-600">{z.trafficPercentage}%</td>
                  <td className="px-3 py-1.5 text-gray-600">{Math.floor(z.avgDwellTime / 60)}:{String(z.avgDwellTime % 60).padStart(2, '0')}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${z.engagementScore}%`, background: brandColor }} />
                      </div>
                      <span className="text-gray-600">{z.engagementScore}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SlideShell>
    );
  }

  // Cost Intelligence
  if (section.id === 'cost-intelligence') {
    const pct = c.budgetMax ? Math.round((c.grandTotal / c.budgetMax) * 100) : null;
    const statusColor = pct && pct > 100 ? '#CC0000' : pct && pct > 85 ? '#E6A000' : '#1A8A1A';
    return (
      <SlideShell title={section.title} brandColor={brandColor}>
        <div className="grid grid-cols-5 gap-5 h-full">
          <div className="col-span-2 space-y-3">
            <div className="p-4 rounded-xl" style={{ background: `${brandColor}12` }}>
              <p className="text-3xl font-bold" style={{ color: brandColor }}>${(c.grandTotal || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Estimated Build Cost  ·  ${c.costPerSqft}/sqft</p>
              {pct !== null && (
                <p className="text-sm font-semibold mt-2" style={{ color: statusColor }}>{pct}% of ${c.budgetMax?.toLocaleString()} budget</p>
              )}
            </div>
            {c.utilities && (
              <div className="rounded-xl border p-3 space-y-1 text-sm">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: brandColor }}>Utilities</p>
                <p className="text-gray-700">⚡ {c.utilities.totalWatts.toLocaleString()}W  ·  {c.utilities.totalAmps20} circuits</p>
                <p className="text-gray-700">🌐 {c.utilities.dataDrops} data drops</p>
              </div>
            )}
            {c.validations?.map((v: any, i: number) => (
              <div key={i} className={cn('rounded p-2 text-xs', v.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                ⚠ {v.message}
              </div>
            ))}
          </div>
          <div className="col-span-3">
            {c.perZone?.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: `${brandColor}18` }}>
                    {['Zone', 'Structure', 'Tech', 'FF&E', 'Total'].map(h => (
                      <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.perZone.slice(0, 8).map((z: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-2 py-1.5 font-medium text-gray-800">{z.name}</td>
                      <td className="px-2 py-1.5 text-gray-600">${z.structure.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-gray-600">${z.technology.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-gray-600">${z.furniture.toLocaleString()}</td>
                      <td className="px-2 py-1.5 font-bold" style={{ color: brandColor }}>${z.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </SlideShell>
    );
  }

  // Image
  if (section.type === 'image') {
    return (
      <SlideShell title={section.title} brandColor={brandColor} compact>
        {c.imageUrl
          ? <img src={c.imageUrl} alt={c.caption || ''} className="w-full flex-1 object-contain rounded-lg" />
          : <div className="flex-1 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm">No render yet</div>}
        {c.caption && <p className="text-xs text-center text-gray-500 italic mt-2">{c.caption}</p>}
      </SlideShell>
    );
  }

  // Grid
  if (section.type === 'grid') {
    const imgs = c.images || [];
    const cols = imgs.length <= 2 ? 2 : imgs.length <= 4 ? 2 : 3;
    return (
      <SlideShell title={section.title} brandColor={brandColor} compact>
        <div className={`grid gap-2 flex-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {imgs.slice(0, 6).map((img: any, i: number) => (
            <div key={i} className="relative rounded overflow-hidden bg-gray-100">
              <img src={img.url} alt={img.caption || ''} className="w-full h-full object-cover" />
              {img.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">{img.caption}</div>
              )}
            </div>
          ))}
        </div>
      </SlideShell>
    );
  }

  // Investment Table
  if (section.type === 'table' && section.id === 'investment') {
    return (
      <SlideShell title={section.title} brandColor={brandColor}>
        <div className="grid grid-cols-5 gap-6 h-full">
          <div className="col-span-2 flex flex-col justify-center">
            <p className="text-4xl font-bold" style={{ color: brandColor }}>
              {c.budgetMin ? `$${c.budgetMin.toLocaleString()}` : c.totalPerShow ? `$${c.totalPerShow.toLocaleString()}` : '—'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {c.budgetMin ? `– $${c.budgetMax?.toLocaleString()} Budget Range` : 'Estimated Investment Per Show'}
            </p>
            {c.roiFramework && <p className="text-sm text-gray-700 mt-4 leading-relaxed">{c.roiFramework.substring(0, 300)}</p>}
          </div>
          {c.allocation?.length > 0 && (
            <div className="col-span-3">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: `${brandColor}18` }}>
                    {['Category', '%', 'Amount', 'Description'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.allocation.slice(0, 8).map((row: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 font-medium">{row.category}</td>
                      <td className="px-3 py-1.5 text-gray-500">{row.percentage}%</td>
                      <td className="px-3 py-1.5 font-bold" style={{ color: brandColor }}>${(row.amount || 0).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-gray-500 text-[10px]">{(row.description || '').substring(0, 60)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SlideShell>
    );
  }

  // Mixed / Text
  const mainText = c.narrative || c.conceptDescription || c.philosophy || c.hospitalityDetails || c.callToAction || '';
  const rightItems: Array<{ label: string; items: string[] }> = [];

  if (c.briefAlignment?.length) rightItems.push({ label: 'Brief Alignment', items: c.briefAlignment.slice(0, 5) });
  if (c.designPrinciples?.length) rightItems.push({ label: 'Design Principles', items: c.designPrinciples.slice(0, 4).map((p: any) => typeof p === 'string' ? p : `${p.name}`) });
  if (c.visitorJourney?.length) rightItems.push({ label: 'Visitor Journey', items: c.visitorJourney.slice(0, 4).map((s: any) => typeof s === 'string' ? s : s.stage || '') });
  if (c.zones?.length) rightItems.push({ label: 'Zone Allocation', items: c.zones.slice(0, 6).map((z: any) => `${z.name}: ${z.sqft} sqft (${z.percentage}%)`) });
  if (c.materialsAndMood?.length) rightItems.push({ label: 'Materials & Mood', items: c.materialsAndMood.slice(0, 4) });
  if (c.secondary?.length) rightItems.push({ label: 'Secondary Activations', items: c.secondary.slice(0, 4).map((s: any) => typeof s === 'string' ? s : s.name || '') });
  if (c.technologyStack?.length) rightItems.push({ label: 'Technology', items: c.technologyStack.slice(0, 4) });
  if (c.contentModules?.length) rightItems.push({ label: 'Content Modules', items: c.contentModules.slice(0, 4).map((m: any) => typeof m === 'string' ? m : m.name || '') });
  if (c.meetingTypes?.length) rightItems.push({ label: 'Meeting Types', items: c.meetingTypes.slice(0, 4).map((m: any) => typeof m === 'string' ? m : m.type || '') });
  if (c.activations?.length) rightItems.push({ label: 'Activations', items: c.activations.slice(0, 4).map((a: any) => typeof a === 'string' ? a : a.name || '') });
  if (c.configs?.length) rightItems.push({ label: 'Layout Options', items: c.configs.slice(0, 3).map((cc: any) => cc.name || cc.layoutType || '') });
  if (c.tools?.length) rightItems.push({ label: 'Tools & Methods', items: c.tools });
  if (c.contactInfo?.name) rightItems.push({ label: 'Contact', items: [`${c.contactInfo.name}`, c.contactInfo.email || '', c.contactInfo.phone || ''].filter(Boolean) });

  const heroActivation = c.hero?.name ? `${c.hero.name}: ${c.hero.concept || ''}` : null;

  return (
    <SlideShell title={section.title} brandColor={brandColor}>
      <div className={cn('grid gap-6 h-full', mainText || heroActivation ? 'grid-cols-5' : 'grid-cols-1')}>
        {(mainText || heroActivation) && (
          <div className="col-span-2 space-y-3">
            {c.headline && <h3 className="text-lg font-bold text-gray-900 leading-snug">{c.headline}</h3>}
            {c.subheadline && <p className="text-sm text-gray-500 italic">{c.subheadline}</p>}
            {heroActivation && (
              <div className="p-3 rounded-lg text-sm" style={{ background: `${brandColor}12` }}>
                <p className="font-bold text-gray-900 mb-1">{c.hero.name}</p>
                <p className="text-gray-600 leading-relaxed text-xs">{(c.hero.concept || '').substring(0, 250)}</p>
              </div>
            )}
            {mainText && <p className="text-sm text-gray-700 leading-relaxed">{mainText.substring(0, 500)}</p>}
          </div>
        )}
        <div className={cn('space-y-4', mainText || heroActivation ? 'col-span-3' : '')}>
          {rightItems.map(({ label, items }) => (
            <div key={label}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: brandColor }}>{label}</p>
              <div className="space-y-1">
                {items.filter(Boolean).map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-xs mt-0.5 shrink-0" style={{ color: brandColor }}>•</span>
                    <p className="text-xs text-gray-700 leading-snug">{typeof item === 'string' ? item : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideShell>
  );
}

// ────────────────────────────────────────────────────────────
// SHARED SHELL
// ────────────────────────────────────────────────────────────

function SlideShell({ title, brandColor, children, compact }: {
  title: string;
  brandColor: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="absolute inset-0 bg-white flex flex-col overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1.5 shrink-0" style={{ background: brandColor }} />
      {/* Content */}
      <div className={cn('flex flex-col flex-1 overflow-hidden', compact ? 'p-6' : 'p-8')}>
        <h2 className="text-xl font-bold mb-4 shrink-0" style={{ color: brandColor }}>{title}</h2>
        <div className="flex flex-col flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DECK PREVIEW MODAL
// ────────────────────────────────────────────────────────────

interface DeckPreviewProps {
  data: ProposalData;
  projectName: string;
  onClose: () => void;
  onDownloadPDF: () => void;
  onDownloadPPTX: () => void;
  isGeneratingPDF: boolean;
  isGeneratingPPTX: boolean;
}

export function DeckPreview({
  data,
  projectName,
  onClose,
  onDownloadPDF,
  onDownloadPPTX,
  isGeneratingPDF,
  isGeneratingPPTX,
}: DeckPreviewProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const sections = buildProposalSections(data);

  const go = useCallback((dir: 1 | -1) => {
    setCurrentIdx(i => Math.max(0, Math.min(sections.length - 1, i + dir)));
  }, [sections.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
      if (e.key === 'Escape') onClose();
      if (e.key === 'g' || e.key === 'G') setShowGrid(s => !s);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [go, onClose]);

  const section = sections[currentIdx];

  return (
    <div className={cn(
      'fixed inset-0 z-50 bg-gray-950 flex flex-col',
      isFullscreen ? 'z-[100]' : ''
    )}>
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <Presentation className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-white">{projectName}</span>
          <Badge variant="secondary" className="text-xs bg-gray-700 text-gray-300">
            {currentIdx + 1} / {sections.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 text-xs gap-1', showGrid ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white')}
            onClick={() => setShowGrid(s => !s)}
          >
            <Grid className="h-3 w-3" />
            Grid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-gray-400 hover:text-white"
            onClick={onDownloadPDF}
            disabled={isGeneratingPDF}
          >
            <Download className="h-3 w-3" />
            {isGeneratingPDF ? 'PDF…' : 'PDF'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-gray-400 hover:text-white"
            onClick={onDownloadPPTX}
            disabled={isGeneratingPPTX}
          >
            <Download className="h-3 w-3" />
            {isGeneratingPPTX ? 'PPTX…' : 'PPTX'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-400 hover:text-white"
            onClick={() => setIsFullscreen(f => !f)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-400 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showGrid ? (
        /* Grid overview */
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-4 gap-4 max-w-6xl mx-auto">
            {sections.map((sec, i) => (
              <button
                key={sec.id}
                onClick={() => { setCurrentIdx(i); setShowGrid(false); }}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 transition-all text-left',
                  i === currentIdx ? 'border-blue-400 shadow-lg shadow-blue-400/20' : 'border-gray-700 hover:border-gray-500'
                )}
                style={{ aspectRatio: '16/9' }}
              >
                <div className="absolute inset-0 bg-white scale-100">
                  <SlideContent section={sec} config={data.config} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 flex items-center justify-between">
                  <span className="text-white text-[10px] font-medium truncate">{sec.title}</span>
                  <span className="text-gray-400 text-[10px]">{i + 1}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Single slide view */
        <div className="flex-1 flex items-center justify-center p-8 relative">
          {/* Slide canvas */}
          <div className="relative bg-white rounded-xl shadow-2xl overflow-hidden" style={{ width: '100%', maxWidth: '1120px', aspectRatio: '16/9' }}>
            {section && <SlideContent section={section} config={data.config} />}
          </div>

          {/* Prev */}
          {currentIdx > 0 && (
            <button
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {/* Next */}
          {currentIdx < sections.length - 1 && (
            <button
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Bottom slide strip */}
      {!showGrid && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-gray-900 border-t border-gray-800 shrink-0">
          {sections.map((sec, i) => (
            <button
              key={sec.id}
              onClick={() => setCurrentIdx(i)}
              className={cn(
                'flex-shrink-0 rounded text-[10px] px-3 py-1.5 transition-colors',
                i === currentIdx
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              )}
            >
              {i + 1}. {sec.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
