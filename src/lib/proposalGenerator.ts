/**
 * Proposal Generator Utility
 * 
 * Compiles all project elements into a formatted proposal document
 * for PDF or PowerPoint export.
 */

import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import {
  imageUrlToBase64,
} from './logoUtils';
import { calculateBoothDimensions, normalizeZones } from './spatialUtils';

// Types
export interface ProposalConfig {
  clientLogo: string | null;
  exhibitHouseLogo: string | null;
  exhibitHouseName: string;
  exhibitHouseTagline?: string;
  brandColor: string;
  secondaryColor: string;
  contactInfo?: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface RhinoRenderEntry {
  id: string;
  view_name: string | null;
  original_public_url: string;
  polished_public_url: string | null;
  polish_status: string;
}

export interface BrandIntelEntry {
  category: string;
  title: string;
  content: string;
}

export interface ProposalData {
  brief: any;
  elements: any;
  images: Array<{ angle_name: string; public_url: string; angle_id: string }>;
  config: ProposalConfig;
  rhinoRenders?: RhinoRenderEntry[];
  brandIntelligence?: BrandIntelEntry[];
}

export interface ProposalSection {
  id: string;
  title: string;
  content: any;
  type: 'cover' | 'text' | 'image' | 'table' | 'grid' | 'mixed';
}

// ============================================
// PROPOSAL STRUCTURE BUILDER
// ============================================

export function buildProposalSections(data: ProposalData): ProposalSection[] {
  const { brief, elements, images, config } = data;
  const sections: ProposalSection[] = [];

  // Helper to get show/event name from multiple possible locations
  const showName =
    brief?.eventContext?.showName ||
    brief?.events?.shows?.[0]?.name ||
    brief?.show ||
    '';

  const footprintSize =
    brief?.spatial?.footprints?.[0]?.size ||
    brief?.space?.size ||
    '30x30';

  // 1. Cover Page
  sections.push({
    id: 'cover',
    title: 'Cover',
    type: 'cover',
    content: {
      clientName: brief?.brand?.name || 'Client',
      clientLogo: config.clientLogo,
      exhibitHouseName: config.exhibitHouseName,
      exhibitHouseLogo: config.exhibitHouseLogo,
      projectTitle: elements?.bigIdea?.data?.headline || 'Exhibit Concept Proposal',
      showName,
      date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      footprintSize,
    },
  });
  
  // 2. Project Brief Overview — event details, objectives, deliverables, budget
  {
    const ev = brief?.events?.shows?.[0] || {};
    const venue = ev.location || ev.venue || brief?.venue || '';
    const dates = ev.dates || brief?.dates || '';
    const spaceSize = brief?.spatial?.footprints?.[0]?.size || brief?.space?.size || footprintSize;
    const spaceDetail = brief?.space?.detail || brief?.spatial?.footprints?.[0]?.description || '';

    const budget = brief?.budget || {};

    const objectives: string[] = [
      ...(brief?.objectives?.primary ? [brief.objectives.primary] : []),
      ...(brief?.objectives?.secondary || []),
    ];

    // requiredDeliverables is the canonical field from parse-brief schema
    const deliverables: string[] = brief?.requiredDeliverables || brief?.deliverables || [];

    // Brand direction from creative.embrace + moodKeywords, and spatial sustainability notes
    const embraceItems: string[] = brief?.creative?.embrace || [];
    const moodKeywords: string[] = brief?.creative?.moodKeywords || [];
    const brandDirection = brief?.creative?.designPhilosophy ||
      (embraceItems.length ? embraceItems.join(', ') : '') ||
      (moodKeywords.length ? moodKeywords.join(', ') : '');

    // Constraints from creative.avoid + spatial sustainability
    const constraints: string[] = [
      ...(brief?.creative?.avoid || []),
      ...(brief?.spatial?.reuseRequirement ? [brief.spatial.reuseRequirement] : []),
    ];

    const contact = brief?.contacts?.[0] || brief?.contact || {};

    sections.push({
      id: 'project-brief',
      title: 'Project Overview',
      type: 'mixed',
      content: {
        eventName: showName,
        venue,
        dates,
        spaceSize,
        spaceDetail,
        budgetMin: budget.range?.min ?? null,
        budgetMax: budget.range?.max ?? null,
        budgetPerShow: budget.perShow ?? null,
        proposalDeadline: brief?.timeline?.proposalDue || '',
        objectives,
        deliverables,
        brandDirection,
        constraints,
        contactName: contact.name || '',
        contactEmail: contact.email || '',
      },
    });
  }

  // 3. Executive Summary
  if (elements?.bigIdea?.data) {
    const bigIdea = elements.bigIdea.data;
    sections.push({
      id: 'executive-summary',
      title: 'Executive Summary',
      type: 'text',
      content: {
        headline: bigIdea.headline,
        subheadline: bigIdea.subheadline,
        narrative: bigIdea.narrative?.substring(0, 800) + '...',
        strategicPosition: bigIdea.strategicPosition,
      },
    });
  }

  // 4. Hero Render
  const heroImage = images.find(i => i.angle_id === 'hero_34');
  if (heroImage) {
    sections.push({
      id: 'hero-render',
      title: 'Design Vision',
      type: 'image',
      content: {
        imageUrl: heroImage.public_url,
        caption: `3/4 Hero View — ${footprintSize} Activation`,
      },
    });
  }

  // 5. Strategic Concept (Big Idea details)
  if (elements?.bigIdea?.data) {
    const bigIdea = elements.bigIdea.data;
    sections.push({
      id: 'strategic-concept',
      title: 'Strategic Concept',
      type: 'mixed',
      content: {
        headline: bigIdea.headline,
        narrative: bigIdea.narrative,
        differentiation: bigIdea.differentiation,
        coreTension: bigIdea.coreTension,
        briefAlignment: bigIdea.briefAlignment || [],
      },
    });
  }

  // 6. Experience Framework
  if (elements?.experienceFramework?.data) {
    const ef = elements.experienceFramework.data;
    sections.push({
      id: 'experience-framework',
      title: 'Experience Framework',
      type: 'mixed',
      content: {
        conceptDescription: ef.conceptDescription,
        designPrinciples: ef.designPrinciples || [],
        visitorJourney: ef.visitorJourney || [],
      },
    });
  }

  // 7. Spatial Design
  if (elements?.spatialStrategy?.data) {
    const spatial = elements.spatialStrategy.data;
    const config0 = spatial.configs?.[0];
    const dims = config0 ? calculateBoothDimensions(config0.footprintSize) : null;
    const zones = config0?.zones ? normalizeZones(config0.zones, dims?.totalSqft || 900) : [];

    const floorPlanImage = images.find(i => i.angle_id === 'floor_plan_2d' || i.angle_id === 'top');

    sections.push({
      id: 'spatial-design',
      title: 'Spatial Design',
      type: 'mixed',
      content: {
        footprint: config0?.footprintSize || footprintSize,
        totalSqft: dims?.totalSqft || 900,
        zones: zones.map(z => ({
          name: z.name,
          sqft: z.sqft,
          percentage: z.percentage,
        })),
        floorPlanUrl: floorPlanImage?.public_url || null,
        materialsAndMood: spatial.materialsAndMood || [],
      },
    });
  }

  // 8. Interactive Mechanics
  if (elements?.interactiveMechanics?.data) {
    const im = elements.interactiveMechanics.data;
    sections.push({
      id: 'interactive-mechanics',
      title: 'Interactive Experience',
      type: 'mixed',
      content: {
        hero: im.hero ? {
          name: im.hero.name,
          concept: im.hero.concept,
          physicalForm: im.hero.physicalForm,
        } : null,
        secondary: im.secondary || [],
        technologyStack: im.technologyStack || [],
      },
    });
  }

  // 9. Digital Storytelling
  if (elements?.digitalStorytelling?.data) {
    const ds = elements.digitalStorytelling.data;
    sections.push({
      id: 'digital-storytelling',
      title: 'Content Strategy',
      type: 'mixed',
      content: {
        philosophy: ds.philosophy,
        audienceTracks: ds.audienceTracks || [],
        contentModules: (ds.contentModules || []).slice(0, 4),
      },
    });
  }

  // 10. Multi-View Renders
  const renderImages = images.filter(i =>
    i.angle_id !== 'hero_34' &&
    i.angle_id !== 'floor_plan_2d' &&
    !i.angle_id.startsWith('zone_interior_')
  );

  if (renderImages.length > 0) {
    sections.push({
      id: 'renders',
      title: 'Rendered Views',
      type: 'grid',
      content: {
        images: renderImages.map(img => ({
          url: img.public_url,
          caption: img.angle_name,
        })),
      },
    });
  }

  // 11. Zone Interiors
  const zoneInteriors = images.filter(i => i.angle_id.startsWith('zone_interior_'));
  if (zoneInteriors.length > 0) {
    sections.push({
      id: 'zone-interiors',
      title: 'Zone Details',
      type: 'grid',
      content: {
        images: zoneInteriors.map(img => ({
          url: img.public_url,
          caption: img.angle_name,
        })),
      },
    });
  }

  // 12. Human Connection
  if (elements?.humanConnection?.data) {
    const hc = elements.humanConnection.data;
    sections.push({
      id: 'human-connection',
      title: 'Meeting & Hospitality',
      type: 'mixed',
      content: {
        configs: hc.configs || [],
        meetingTypes: hc.meetingTypes || [],
        hospitalityDetails: hc.hospitalityDetails,
      },
    });
  }

  // 13. Adjacent Activations
  if (elements?.adjacentActivations?.data) {
    const aa = elements.adjacentActivations.data;
    sections.push({
      id: 'adjacent-activations',
      title: 'Adjacent Activations',
      type: 'mixed',
      content: {
        activations: aa.activations || [],
        competitivePositioning: aa.competitivePositioning,
      },
    });
  }

  // 14. Investment Summary — uses budget range if available, falls back to budgetLogic
  {
    const bl = elements?.budgetLogic?.data || {};
    const budget = brief?.budget || {};
    sections.push({
      id: 'investment',
      title: 'Investment Summary',
      type: 'table',
      content: {
        totalPerShow: bl.totalPerShow || budget.perShow || null,
        budgetMin: budget.range?.min || null,
        budgetMax: budget.range?.max || null,
        allocation: bl.allocation || [],
        roiFramework: bl.roiFramework,
        amortization: bl.amortization || [],
      },
    });
  }

  // 15. Rhino 3D Comparison (before/after)
  const polishedRhino = (data.rhinoRenders || []).filter(
    (r) => r.polish_status === 'complete' && r.polished_public_url
  );
  if (polishedRhino.length > 0) {
    sections.push({
      id: 'rhino-comparison',
      title: '3D Design Process',
      type: 'grid',
      content: {
        images: polishedRhino.flatMap((r) => [
          { url: r.original_public_url, caption: `${r.view_name || 'View'} — Original 3D Model` },
          { url: r.polished_public_url!, caption: `${r.view_name || 'View'} — AI Polished` },
        ]),
        isComparison: true,
      },
    });
  }

  // 16. Brand Intelligence Summary
  const approvedIntel = (data.brandIntelligence || []).filter((e) => e.content);
  if (approvedIntel.length > 0) {
    const grouped: Record<string, { title: string; content: string }[]> = {};
    for (const entry of approvedIntel) {
      const cat = entry.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ title: entry.title, content: entry.content });
    }
    sections.push({
      id: 'brand-intelligence',
      title: 'Brand Intelligence',
      type: 'mixed',
      content: {
        narrative: 'Key brand insights informing every design decision in this proposal.',
        categories: grouped,
      },
    });
  }

  // 17. Team Credits
  sections.push({
    id: 'team-credits',
    title: 'Design Team',
    type: 'text',
    content: {
      exhibitHouseName: config.exhibitHouseName,
      tagline: config.exhibitHouseTagline || '',
      contactInfo: config.contactInfo,
      tools: ['AI-Powered Concept Generation', '3D Visualization Pipeline', 'Brand Intelligence Engine'],
    },
  });

  // 18. Next Steps / Contact
  sections.push({
    id: 'next-steps',
    title: 'Next Steps',
    type: 'text',
    content: {
      exhibitHouseName: config.exhibitHouseName,
      contactInfo: config.contactInfo,
      callToAction: 'Ready to bring this vision to life? Let\'s schedule a detailed walkthrough.',
    },
  });

  return sections;
}

// ============================================
// PDF GENERATOR
// ============================================

export async function generateProposalPDF(
  data: ProposalData,
  options?: { activeSectionIds?: string[] }
): Promise<Blob> {
  let sections = buildProposalSections(data);

  if (options?.activeSectionIds) {
    const activeSet = new Set(options.activeSectionIds);
    sections = sections.filter((s) => activeSet.has(s.id));
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [1920, 1080], // HD presentation format
  });
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 80;
  const contentWidth = pageWidth - margin * 2;
  
  const brandColor = data.config.brandColor || '#0047AB';
  const textColor = '#1a1a1a';
  const mutedColor = '#666666';
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    
    if (i > 0) {
      pdf.addPage();
    }
    
    // Background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Header bar
    const [r, g, b] = hexToRgb(brandColor);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, 0, pageWidth, 8, 'F');
    
    if (section.type === 'cover') {
      // Cover page layout
      await renderCoverPage(pdf, section.content, data.config, pageWidth, pageHeight);
    } else {
      // Section title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(42);
      pdf.setTextColor(r, g, b);
      pdf.text(section.title, margin, margin + 50);
      
      // Underline
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(3);
      pdf.line(margin, margin + 65, margin + 200, margin + 65);
      
      // Content based on type
      pdf.setTextColor(...hexToRgb(textColor));
      
      if (section.id === 'project-brief') {
        renderProjectBriefSection(pdf, section.content, margin, margin + 120, contentWidth, pageHeight, [r, g, b]);
      } else {
        switch (section.type) {
          case 'text':
            renderTextSection(pdf, section.content, margin, margin + 120, contentWidth);
            break;
          case 'image':
            await renderImageSection(pdf, section.content, margin, margin + 120, contentWidth, pageHeight - margin - 150);
            break;
          case 'mixed':
            renderMixedSection(pdf, section.content, margin, margin + 120, contentWidth, pageHeight);
            break;
          case 'table':
            renderTableSection(pdf, section.content, margin, margin + 120, contentWidth, [r, g, b]);
            break;
          case 'grid':
            await renderGridSection(pdf, section.content, margin, margin + 120, contentWidth, pageHeight - margin - 150);
            break;
        }
      }
    }
    
    // Footer
    if (section.type !== 'cover') {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...hexToRgb(mutedColor));
      pdf.text(
        `${data.config.exhibitHouseName} | ${data.brief?.brand?.name || 'Client'} Proposal`,
        margin,
        pageHeight - 30
      );
      pdf.text(
        `Page ${i + 1} of ${sections.length}`,
        pageWidth - margin - 60,
        pageHeight - 30
      );
    }
  }
  
  return pdf.output('blob');
}

async function renderCoverPage(
  pdf: jsPDF, 
  content: any, 
  config: ProposalConfig,
  pageWidth: number,
  pageHeight: number
) {
  const centerX = pageWidth / 2;
  const brandColor = config.brandColor || '#0047AB';
  const [r, g, b] = hexToRgb(brandColor);
  
  // Large brand color block
  pdf.setFillColor(r, g, b);
  pdf.rect(0, 0, pageWidth, pageHeight * 0.45, 'F');
  
  // Client logo (top left of color block)
  if (content.clientLogo) {
    try {
      const logoData = await imageUrlToBase64(content.clientLogo);
      if (logoData) {
        pdf.addImage(logoData, 'PNG', 80, 60, 180, 60);
      }
    } catch (e) {
      // Logo failed to load, skip
    }
  }
  
  // Project title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(72);
  pdf.setTextColor(255, 255, 255);
  const titleLines = pdf.splitTextToSize(content.projectTitle || 'Exhibit Concept', pageWidth - 200);
  pdf.text(titleLines, centerX, pageHeight * 0.25, { align: 'center' });
  
  // Show name and footprint
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(28);
  pdf.setTextColor(255, 255, 255, 200);
  const subtitle = [content.showName, content.footprintSize].filter(Boolean).join(' | ');
  pdf.text(subtitle, centerX, pageHeight * 0.38, { align: 'center' });
  
  // Bottom section - exhibit house branding
  pdf.setFillColor(245, 245, 245);
  pdf.rect(0, pageHeight * 0.85, pageWidth, pageHeight * 0.15, 'F');
  
  // Exhibit house logo
  if (config.exhibitHouseLogo) {
    try {
      const logoData = await imageUrlToBase64(config.exhibitHouseLogo);
      if (logoData) {
        pdf.addImage(logoData, 'PNG', 80, pageHeight * 0.88, 120, 40);
      }
    } catch (e) {
      // Show name instead
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(50, 50, 50);
      pdf.text(config.exhibitHouseName, 80, pageHeight * 0.93);
    }
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(50, 50, 50);
    pdf.text(config.exhibitHouseName, 80, pageHeight * 0.93);
  }
  
  // Date
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  pdf.setTextColor(100, 100, 100);
  pdf.text(content.date, pageWidth - 80, pageHeight * 0.93, { align: 'right' });
  
  // Prepared for
  pdf.setFontSize(12);
  pdf.text(`Prepared for ${content.clientName}`, centerX, pageHeight * 0.6, { align: 'center' });
}

function renderTextSection(pdf: jsPDF, content: any, x: number, y: number, width: number) {
  let currentY = y;
  
  if (content.headline) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(28);
    const lines = pdf.splitTextToSize(content.headline, width);
    pdf.text(lines, x, currentY);
    currentY += lines.length * 35 + 20;
  }
  
  if (content.subheadline) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(18);
    pdf.setTextColor(100, 100, 100);
    const lines = pdf.splitTextToSize(content.subheadline, width);
    pdf.text(lines, x, currentY);
    currentY += lines.length * 24 + 20;
  }
  
  if (content.narrative) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.setTextColor(50, 50, 50);
    const lines = pdf.splitTextToSize(content.narrative, width);
    pdf.text(lines.slice(0, 20), x, currentY); // Limit lines
  }
}

async function renderImageSection(
  pdf: jsPDF, 
  content: any, 
  x: number, 
  y: number, 
  width: number,
  maxHeight: number
) {
  if (content.imageUrl) {
    try {
      const imgData = await imageUrlToBase64(content.imageUrl);
      if (imgData) {
        // Calculate dimensions to fit
        const imgHeight = Math.min(maxHeight - 60, width * 0.5625); // 16:9 max
        pdf.addImage(imgData, 'PNG', x, y, width, imgHeight);
        
        if (content.caption) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(12);
          pdf.setTextColor(100, 100, 100);
          pdf.text(content.caption, x + width / 2, y + imgHeight + 30, { align: 'center' });
        }
      }
    } catch (e) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(14);
      pdf.setTextColor(150, 150, 150);
      pdf.text('[Image could not be loaded]', x, y + 50);
    }
  }
}

function renderMixedSection(pdf: jsPDF, content: any, x: number, y: number, width: number, _pageHeight: number) {
  let currentY = y;
  const colWidth = width / 2 - 20;
  
  // Main narrative on left
  if (content.narrative || content.conceptDescription || content.philosophy) {
    const text = content.narrative || content.conceptDescription || content.philosophy;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(13);
    pdf.setTextColor(50, 50, 50);
    const lines = pdf.splitTextToSize(text, colWidth);
    pdf.text(lines.slice(0, 25), x, currentY);
  }
  
  // Right column - key points
  const rightX = x + colWidth + 40;
  let rightY = currentY;
  
  // Handle different content types
  if (content.briefAlignment && content.briefAlignment.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(0, 71, 171);
    pdf.text('Brief Alignment', rightX, rightY);
    rightY += 25;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(50, 50, 50);
    content.briefAlignment.slice(0, 5).forEach((item: string) => {
      const bullet = `• ${item}`;
      const lines = pdf.splitTextToSize(bullet, colWidth - 20);
      pdf.text(lines, rightX, rightY);
      rightY += lines.length * 16 + 8;
    });
  }
  
  if (content.designPrinciples && content.designPrinciples.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(0, 71, 171);
    pdf.text('Design Principles', rightX, rightY);
    rightY += 25;
    
    content.designPrinciples.slice(0, 4).forEach((p: any) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(`• ${p.name}`, rightX, rightY);
      rightY += 16;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      const lines = pdf.splitTextToSize(p.description, colWidth - 30);
      pdf.text(lines.slice(0, 2), rightX + 10, rightY);
      rightY += lines.slice(0, 2).length * 14 + 10;
      pdf.setTextColor(50, 50, 50);
    });
  }
  
  if (content.zones && content.zones.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(0, 71, 171);
    pdf.text('Zone Allocation', rightX, rightY);
    rightY += 25;
    
    content.zones.forEach((z: any) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(50, 50, 50);
      pdf.text(`${z.name}: ${z.sqft} sqft (${z.percentage}%)`, rightX, rightY);
      rightY += 18;
    });
  }
}

function renderProjectBriefSection(
  pdf: jsPDF,
  content: any,
  x: number,
  y: number,
  width: number,
  _pageHeight: number,
  brandRgb: [number, number, number]
) {
  const colWidth = width / 2 - 20;
  const rightX = x + colWidth + 40;
  let leftY = y;
  let rightY = y;
  const [r, g, b] = brandRgb;

  // ── Left column: event & space details ──
  const addLabel = (label: string, value: string, refY: number, col: 'left' | 'right' = 'left') => {
    if (!value) return refY;
    const cx = col === 'left' ? x : rightX;
    const cw = colWidth;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(r, g, b);
    pdf.text(label.toUpperCase(), cx, refY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 30, 30);
    const lines = pdf.splitTextToSize(value, cw);
    pdf.text(lines.slice(0, 2), cx, refY + 15);
    return refY + 15 + lines.slice(0, 2).length * 16 + 10;
  };

  if (content.eventName) leftY = addLabel('Event', content.eventName, leftY);
  if (content.venue) leftY = addLabel('Venue', content.venue, leftY);
  if (content.dates) leftY = addLabel('Dates', content.dates, leftY);
  if (content.spaceSize) leftY = addLabel('Space', content.spaceSize + (content.spaceDetail ? ` — ${content.spaceDetail}` : ''), leftY);
  if (content.proposalDeadline) leftY = addLabel('Proposal Deadline', content.proposalDeadline, leftY);
  if (content.contactName) leftY = addLabel('Client Contact', content.contactName + (content.contactEmail ? ` | ${content.contactEmail}` : ''), leftY);

  // Budget display
  if (content.budgetMin || content.budgetMax || content.budgetPerShow) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(r, g, b);
    pdf.text('BUDGET RANGE', x, leftY);
    leftY += 15;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(30, 30, 30);
    const budgetDisplay = content.budgetMin
      ? `$${content.budgetMin.toLocaleString()} – $${content.budgetMax?.toLocaleString()}`
      : `$${content.budgetPerShow?.toLocaleString()} per show`;
    pdf.text(budgetDisplay, x, leftY + 20);
    leftY += 45;
  }

  // ── Right column: objectives ──
  if (content.objectives?.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(r, g, b);
    pdf.text('Project Objectives', rightX, rightY);
    rightY += 22;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    content.objectives.slice(0, 5).forEach((obj: string) => {
      const lines = pdf.splitTextToSize(`• ${obj}`, colWidth - 10);
      pdf.text(lines.slice(0, 2), rightX, rightY);
      rightY += lines.slice(0, 2).length * 15 + 6;
    });
    rightY += 10;
  }

  // Deliverables
  if (content.deliverables?.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(r, g, b);
    pdf.text('Required Deliverables', rightX, rightY);
    rightY += 22;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    content.deliverables.slice(0, 6).forEach((d: string) => {
      const lines = pdf.splitTextToSize(`• ${d}`, colWidth - 10);
      pdf.text(lines.slice(0, 2), rightX, rightY);
      rightY += lines.slice(0, 2).length * 15 + 6;
    });
    rightY += 10;
  }

  // Brand direction (below deliverables or left col)
  const belowY = Math.max(leftY, rightY) + 10;
  if (content.brandDirection) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(r, g, b);
    pdf.text('Brand Direction', x, belowY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(50, 50, 50);
    const lines = pdf.splitTextToSize(content.brandDirection, width);
    pdf.text(lines.slice(0, 3), x, belowY + 18);
  }

  // Constraints
  if (content.constraints?.length > 0) {
    const constraintY = belowY + (content.brandDirection ? 80 : 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(r, g, b);
    pdf.text('Special Requirements & Constraints', x, constraintY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(50, 50, 50);
    let cy = constraintY + 18;
    content.constraints.slice(0, 4).forEach((c: string) => {
      const lines = pdf.splitTextToSize(`• ${c}`, width);
      pdf.text(lines.slice(0, 2), x, cy);
      cy += lines.slice(0, 2).length * 15 + 6;
    });
  }
}

function renderTableSection(pdf: jsPDF, content: any, x: number, y: number, width: number, brandRgb?: [number, number, number]) {
  let currentY = y;
  const [r, g, b] = brandRgb || [0, 71, 171];

  // Show budget range if available, otherwise totalPerShow
  if (content.budgetMin || content.budgetMax) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.setTextColor(r, g, b);
    pdf.text(`$${content.budgetMin?.toLocaleString()} – $${content.budgetMax?.toLocaleString()}`, x, currentY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Total Budget Range', x, currentY + 25);
    currentY += 60;
  } else if (content.totalPerShow) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.setTextColor(r, g, b);
    pdf.text(`$${content.totalPerShow.toLocaleString()}`, x, currentY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Estimated Investment Per Show', x, currentY + 25);
    currentY += 60;
  }

  if (content.allocation && content.allocation.length > 0) {
    const colWidths = [width * 0.35, width * 0.15, width * 0.2, width * 0.3];
    const headers = ['Category', '%', 'Amount', 'Description'];

    pdf.setFillColor(240, 240, 240);
    pdf.rect(x, currentY, width, 30, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(50, 50, 50);

    let headerX = x + 10;
    headers.forEach((h, i) => {
      pdf.text(h, headerX, currentY + 20);
      headerX += colWidths[i];
    });
    currentY += 35;

    pdf.setFont('helvetica', 'normal');
    content.allocation.slice(0, 8).forEach((row: any, idx: number) => {
      if (idx % 2 === 1) {
        pdf.setFillColor(248, 248, 248);
        pdf.rect(x, currentY - 5, width, 25, 'F');
      }

      let cellX = x + 10;
      pdf.text(row.category || '', cellX, currentY + 12);
      cellX += colWidths[0];
      pdf.text(`${row.percentage || 0}%`, cellX, currentY + 12);
      cellX += colWidths[1];
      pdf.text(`$${(row.amount || 0).toLocaleString()}`, cellX, currentY + 12);
      cellX += colWidths[2];
      const descLines = pdf.splitTextToSize(row.description || '', colWidths[3] - 20);
      pdf.text(descLines[0] || '', cellX, currentY + 12);

      currentY += 28;
    });
  }
}


async function renderGridSection(
  pdf: jsPDF,
  content: any,
  x: number,
  y: number,
  width: number,
  _maxHeight: number
) {
  const images = content.images || [];
  const cols = images.length <= 2 ? 2 : 3;
  const gap = 20;
  const imgWidth = (width - gap * (cols - 1)) / cols;
  const imgHeight = imgWidth * 0.5625; // 16:9
  
  for (let i = 0; i < Math.min(images.length, 6); i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const imgX = x + col * (imgWidth + gap);
    const imgY = y + row * (imgHeight + gap + 30);
    
    try {
      const imgData = await imageUrlToBase64(images[i].url);
      if (imgData) {
        pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);
        
        // Caption
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(images[i].caption || '', imgX + imgWidth / 2, imgY + imgHeight + 15, { align: 'center' });
      }
    } catch (e) {
      // Draw placeholder
      pdf.setFillColor(240, 240, 240);
      pdf.rect(imgX, imgY, imgWidth, imgHeight, 'F');
    }
  }
}

// ============================================
// PPTX GENERATOR
// ============================================

export async function generateProposalPPTX(
  data: ProposalData,
  options?: { activeSectionIds?: string[] }
): Promise<Blob> {
  let sections = buildProposalSections(data);

  // Filter to active template sections if provided
  if (options?.activeSectionIds) {
    const activeSet = new Set(options.activeSectionIds);
    sections = sections.filter((s) => activeSet.has(s.id));
  }

  const pptx = new PptxGenJS();
  
  // Set presentation properties
  pptx.author = data.config.exhibitHouseName;
  pptx.title = `${data.brief?.brand?.name || 'Client'} Exhibit Proposal`;
  pptx.subject = 'Trade Show Exhibit Concept';
  
  const brandColor = data.config.brandColor || '0047AB';
  const brandColorClean = brandColor.replace('#', '');
  
  for (const section of sections) {
    const slide = pptx.addSlide();
    
    // Header bar
    slide.addShape('rect', {
      x: 0, y: 0, w: '100%', h: 0.1,
      fill: { color: brandColorClean },
    });
    
    if (section.type === 'cover') {
      // Cover slide
      slide.addShape('rect', {
        x: 0, y: 0, w: '100%', h: '45%',
        fill: { color: brandColorClean },
      });
      
      // Client logo
      if (section.content.clientLogo) {
        try {
          slide.addImage({
            path: section.content.clientLogo,
            x: 0.5, y: 0.3, w: 1.5, h: 0.5,
          });
        } catch (e) {}
      }
      
      // Title
      slide.addText(section.content.projectTitle || 'Exhibit Concept', {
        x: 0.5, y: 1.5, w: 9, h: 1,
        fontSize: 44, bold: true, color: 'FFFFFF',
        align: 'center',
      });
      
      // Subtitle
      const subtitle = [section.content.showName, section.content.footprintSize].filter(Boolean).join(' | ');
      slide.addText(subtitle, {
        x: 0.5, y: 2.3, w: 9, h: 0.5,
        fontSize: 20, color: 'FFFFFF', align: 'center',
      });
      
      // Prepared for
      slide.addText(`Prepared for ${section.content.clientName}`, {
        x: 0.5, y: 3.2, w: 9, h: 0.4,
        fontSize: 14, color: '333333', align: 'center',
      });
      
      // Footer with exhibit house
      slide.addText(data.config.exhibitHouseName, {
        x: 0.5, y: 4.8, w: 4, h: 0.3,
        fontSize: 12, bold: true, color: '333333',
      });
      
      slide.addText(section.content.date, {
        x: 5.5, y: 4.8, w: 4, h: 0.3,
        fontSize: 12, color: '666666', align: 'right',
      });
      
    } else {
      // Regular slide
      slide.addText(section.title, {
        x: 0.5, y: 0.3, w: 9, h: 0.6,
        fontSize: 32, bold: true, color: brandColorClean,
      });
      
      // Underline
      slide.addShape('rect', {
        x: 0.5, y: 0.85, w: 2, h: 0.03,
        fill: { color: brandColorClean },
      });
      
      // Content based on type — use specialized renderer for known section IDs
      if (section.id === 'brand-intelligence') {
        addPptxBrandIntelContent(slide, section.content, brandColorClean);
      } else if (section.id === 'project-brief') {
        addPptxProjectBriefContent(slide, section.content, brandColorClean);
      } else {
        switch (section.type) {
          case 'text':
            addPptxTextContent(slide, section.content);
            break;
          case 'image':
            addPptxImageContent(slide, section.content);
            break;
          case 'mixed':
            addPptxMixedContent(slide, section.content, brandColorClean);
            break;
          case 'table':
            addPptxTableContent(slide, section.content, brandColorClean);
            break;
          case 'grid':
            addPptxGridContent(slide, section.content);
            break;
        }
      }
      
      // Footer
      slide.addText(`${data.config.exhibitHouseName}`, {
        x: 0.5, y: 5.2, w: 4, h: 0.2,
        fontSize: 8, color: '999999',
      });
    }
  }
  
  return await pptx.write({ outputType: 'blob' }) as Blob;
}

// Helper: add a labelled section header + bullet list to a slide column
function pptxBulletBlock(
  slide: any,
  label: string,
  items: string[],
  x: number,
  y: number,
  w: number,
  brandColor: string,
  maxItems = 6
): number {
  if (!items?.length) return y;
  slide.addText(label, { x, y, w, h: 0.28, fontSize: 12, bold: true, color: brandColor });
  y += 0.3;
  items.slice(0, maxItems).forEach((item: string) => {
    const text = typeof item === 'string' ? item : JSON.stringify(item);
    slide.addText(`• ${text.substring(0, 120)}`, { x, y, w, h: 0.24, fontSize: 10, color: '333333' });
    y += 0.26;
  });
  return y + 0.15;
}

// Helper: add a key-value row
function pptxKVRow(
  slide: any,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  brandColor: string
): number {
  if (!value) return y;
  slide.addText(label, { x, y, w, h: 0.18, fontSize: 8, bold: true, color: brandColor });
  slide.addText(value.substring(0, 200), { x, y: y + 0.18, w, h: 0.26, fontSize: 11, color: '1a1a1a' });
  return y + 0.5;
}

function addPptxTextContent(slide: any, content: any, brandColor = '333333') {
  let y = 1.2;

  if (content.headline) {
    slide.addText(content.headline, { x: 0.5, y, w: 9, h: 0.55, fontSize: 22, bold: true, color: '1a1a1a' });
    y += 0.65;
  }
  if (content.subheadline) {
    slide.addText(content.subheadline, { x: 0.5, y, w: 9, h: 0.35, fontSize: 15, italic: true, color: '666666' });
    y += 0.45;
  }
  if (content.narrative) {
    slide.addText(content.narrative.substring(0, 900), { x: 0.5, y, w: 9, h: 2.0, fontSize: 11, color: '333333', valign: 'top' });
    y += 2.1;
  }
  // Team credits
  if (content.exhibitHouseName) {
    slide.addText(content.exhibitHouseName, { x: 0.5, y, w: 9, h: 0.35, fontSize: 18, bold: true, color: '1a1a1a' });
    y += 0.4;
  }
  if (content.tagline) {
    slide.addText(content.tagline, { x: 0.5, y, w: 9, h: 0.25, fontSize: 12, italic: true, color: '666666' });
    y += 0.35;
  }
  if (content.tools?.length) {
    y = pptxBulletBlock(slide, 'Powered by', content.tools, 0.5, y, 9, brandColor, 6);
  }
  if (content.contactInfo?.name) {
    y += 0.15;
    slide.addText(`Contact: ${content.contactInfo.name}`, { x: 0.5, y, w: 9, h: 0.25, fontSize: 11, bold: true, color: '1a1a1a' });
    y += 0.28;
    if (content.contactInfo.email) {
      slide.addText(content.contactInfo.email, { x: 0.5, y, w: 9, h: 0.22, fontSize: 10, color: '555555' });
      y += 0.25;
    }
    if (content.contactInfo.phone) {
      slide.addText(content.contactInfo.phone, { x: 0.5, y, w: 9, h: 0.22, fontSize: 10, color: '555555' });
    }
  }
  // Next steps
  if (content.callToAction) {
    slide.addText(content.callToAction, { x: 0.5, y: y + 0.2, w: 9, h: 0.4, fontSize: 14, bold: true, color: brandColor, align: 'center' });
  }
}

function addPptxImageContent(slide: any, content: any) {
  if (content.imageUrl) {
    try {
      slide.addImage({
        path: content.imageUrl,
        x: 0.5, y: 1.1, w: 9, h: 4.2,
        sizing: { type: 'contain', w: 9, h: 4.2 },
      });
      if (content.caption) {
        slide.addText(content.caption, { x: 0.5, y: 5.35, w: 9, h: 0.25, fontSize: 10, italic: true, color: '666666', align: 'center' });
      }
    } catch (e) {}
  }
}

function addPptxMixedContent(slide: any, content: any, brandColor: string) {
  // ── Left column: narrative/description ──
  const mainText = content.narrative || content.conceptDescription || content.philosophy || content.hospitalityDetails || '';
  if (mainText) {
    slide.addText(mainText.substring(0, 700), { x: 0.5, y: 1.2, w: 4.5, h: 3.8, fontSize: 11, color: '333333', valign: 'top' });
  }

  // ── Right column: context-aware content ──
  let y = 1.2;
  const rx = 5.2;
  const rw = 4.3;

  // Strategic Concept
  if (content.briefAlignment?.length) {
    y = pptxBulletBlock(slide, 'Brief Alignment', content.briefAlignment, rx, y, rw, brandColor, 5);
  }
  if (content.differentiation) {
    slide.addText('Differentiation', { x: rx, y, w: rw, h: 0.25, fontSize: 12, bold: true, color: brandColor });
    y += 0.28;
    slide.addText(content.differentiation.substring(0, 200), { x: rx, y, w: rw, h: 0.7, fontSize: 10, color: '333333', valign: 'top' });
    y += 0.8;
  }

  // Experience Framework
  if (content.designPrinciples?.length) {
    y = pptxBulletBlock(slide, 'Design Principles', content.designPrinciples.map((p: any) => typeof p === 'string' ? p : `${p.name}: ${p.description || ''}`), rx, y, rw, brandColor, 4);
  }
  if (content.visitorJourney?.length) {
    y = pptxBulletBlock(slide, 'Visitor Journey', content.visitorJourney.map((s: any) => typeof s === 'string' ? s : `${s.stage}: ${s.description || ''}`), rx, y, rw, brandColor, 5);
  }

  // Spatial Design
  if (content.zones?.length) {
    y = pptxBulletBlock(slide, 'Zone Allocation', content.zones.map((z: any) => `${z.name}: ${z.sqft} sqft (${z.percentage}%)`), rx, y, rw, brandColor, 6);
  }
  if (content.materialsAndMood?.length) {
    y = pptxBulletBlock(slide, 'Materials & Mood', content.materialsAndMood, rx, y, rw, brandColor, 4);
  }

  // Interactive Mechanics
  if (content.hero?.name) {
    slide.addText('Hero Activation', { x: rx, y, w: rw, h: 0.25, fontSize: 12, bold: true, color: brandColor });
    y += 0.28;
    slide.addText(`${content.hero.name}`, { x: rx, y, w: rw, h: 0.22, fontSize: 11, bold: true, color: '1a1a1a' });
    y += 0.25;
    if (content.hero.concept) {
      slide.addText(content.hero.concept.substring(0, 180), { x: rx, y, w: rw, h: 0.55, fontSize: 9, color: '444444', valign: 'top' });
      y += 0.65;
    }
  }
  if (content.secondary?.length) {
    y = pptxBulletBlock(slide, 'Secondary Activations', content.secondary.map((s: any) => typeof s === 'string' ? s : s.name || ''), rx, y, rw, brandColor, 4);
  }
  if (content.technologyStack?.length) {
    y = pptxBulletBlock(slide, 'Technology', content.technologyStack, rx, y, rw, brandColor, 4);
  }

  // Digital Storytelling
  if (content.contentModules?.length) {
    y = pptxBulletBlock(slide, 'Content Modules', content.contentModules.map((m: any) => typeof m === 'string' ? m : m.name || ''), rx, y, rw, brandColor, 4);
  }
  if (content.audienceTracks?.length) {
    y = pptxBulletBlock(slide, 'Audience Tracks', content.audienceTracks.map((t: any) => typeof t === 'string' ? t : t.audience || t.name || ''), rx, y, rw, brandColor, 4);
  }

  // Human Connection
  if (content.meetingTypes?.length) {
    y = pptxBulletBlock(slide, 'Meeting Types', content.meetingTypes.map((m: any) => typeof m === 'string' ? m : m.type || ''), rx, y, rw, brandColor, 4);
  }

  // Adjacent Activations
  if (content.activations?.length) {
    y = pptxBulletBlock(slide, 'Activations', content.activations.map((a: any) => typeof a === 'string' ? a : a.name || ''), rx, y, rw, brandColor, 5);
  }
  if (content.competitivePositioning) {
    slide.addText('Competitive Positioning', { x: rx, y, w: rw, h: 0.25, fontSize: 12, bold: true, color: brandColor });
    y += 0.28;
    slide.addText(content.competitivePositioning.substring(0, 200), { x: rx, y, w: rw, h: 0.6, fontSize: 10, color: '333333', valign: 'top' });
  }
}

function addPptxBrandIntelContent(slide: any, content: any, brandColor: string) {
  let y = 1.2;

  // Narrative
  if (content.narrative) {
    slide.addText(content.narrative, {
      x: 0.5, y, w: 9, h: 0.4,
      fontSize: 13, italic: true, color: '666666', fontFace: 'Arial',
    });
    y += 0.6;
  }

  // Categories grid
  const categories = content.categories || {};
  const catKeys = Object.keys(categories);
  const cols = Math.min(catKeys.length, 3);
  const colW = cols > 0 ? (9 / cols) - 0.2 : 9;

  catKeys.slice(0, 6).forEach((catKey: string, i: number) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.5 + col * (colW + 0.2);
    const catY = y + row * 2;

    // Category header
    const catLabel = catKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    slide.addText(catLabel, {
      x, y: catY, w: colW, h: 0.3,
      fontSize: 12, bold: true, color: brandColor, fontFace: 'Arial',
    });

    // Entries
    const entries = categories[catKey] || [];
    entries.slice(0, 3).forEach((entry: any, j: number) => {
      slide.addText(`${entry.title}: ${entry.content.substring(0, 120)}`, {
        x, y: catY + 0.35 + j * 0.4, w: colW, h: 0.35,
        fontSize: 9, color: '333333', fontFace: 'Arial', valign: 'top',
      });
    });
  });
}

function addPptxProjectBriefContent(slide: any, content: any, brandColor: string) {
  // Left column: event/space/budget details
  let leftY = 1.2;
  const addRow = (label: string, value: string, col: 'left' | 'right' = 'left') => {
    if (!value) return;
    const x = col === 'left' ? 0.5 : 5.2;
    slide.addText(label, { x, y: leftY, w: 4.3, h: 0.18, fontSize: 8, bold: true, color: brandColor });
    slide.addText(value, { x, y: leftY + 0.18, w: 4.3, h: 0.28, fontSize: 11, color: '1a1a1a' });
    leftY += 0.52;
  };

  if (content.eventName) addRow('EVENT', content.eventName);
  if (content.venue) addRow('VENUE', content.venue);
  if (content.dates) addRow('DATES', content.dates);
  if (content.spaceSize) addRow('SPACE', content.spaceSize + (content.spaceDetail ? ` — ${content.spaceDetail}` : ''));
  if (content.proposalDeadline) addRow('PROPOSAL DEADLINE', content.proposalDeadline);
  if (content.contactName) addRow('CLIENT CONTACT', content.contactName + (content.contactEmail ? ` | ${content.contactEmail}` : ''));

  // Budget — prominent display
  if (content.budgetMin || content.budgetPerShow) {
    const budgetStr = content.budgetMin
      ? `$${content.budgetMin.toLocaleString()} – $${content.budgetMax?.toLocaleString()}`
      : `$${content.budgetPerShow?.toLocaleString()} per show`;
    slide.addText('BUDGET RANGE', { x: 0.5, y: leftY, w: 4.3, h: 0.2, fontSize: 8, bold: true, color: brandColor });
    slide.addText(budgetStr, { x: 0.5, y: leftY + 0.2, w: 4.5, h: 0.45, fontSize: 22, bold: true, color: '1a1a1a' });
    leftY += 0.8;
  }

  // Right column: objectives + deliverables
  let rightY = 1.2;
  if (content.objectives?.length > 0) {
    slide.addText('Project Objectives', { x: 5.2, y: rightY, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: brandColor });
    rightY += 0.35;
    content.objectives.slice(0, 5).forEach((obj: string) => {
      slide.addText(`• ${obj}`, { x: 5.2, y: rightY, w: 4.3, h: 0.28, fontSize: 10, color: '333333' });
      rightY += 0.3;
    });
    rightY += 0.15;
  }

  if (content.deliverables?.length > 0) {
    slide.addText('Required Deliverables', { x: 5.2, y: rightY, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: brandColor });
    rightY += 0.35;
    content.deliverables.slice(0, 6).forEach((d: string) => {
      slide.addText(`• ${d}`, { x: 5.2, y: rightY, w: 4.3, h: 0.28, fontSize: 10, color: '333333' });
      rightY += 0.3;
    });
  }

  // Brand direction + constraints spanning full width below
  const belowY = Math.max(leftY, rightY) + 0.1;
  if (content.brandDirection) {
    slide.addText('Brand Direction', { x: 0.5, y: belowY, w: 9, h: 0.25, fontSize: 11, bold: true, color: brandColor });
    slide.addText(content.brandDirection.substring(0, 300), { x: 0.5, y: belowY + 0.27, w: 9, h: 0.45, fontSize: 9, color: '444444' });
  }
}

function addPptxTableContent(slide: any, content: any, brandColor: string) {
  // Show budget range if available, otherwise totalPerShow
  if (content.budgetMin || content.budgetMax) {
    const budgetStr = `$${content.budgetMin?.toLocaleString()} – $${content.budgetMax?.toLocaleString()}`;
    slide.addText(budgetStr, {
      x: 0.5, y: 1.1, w: 6, h: 0.6,
      fontSize: 32, bold: true, color: brandColor,
    });
    slide.addText('Total Budget Range', {
      x: 0.5, y: 1.65, w: 4, h: 0.3,
      fontSize: 12, color: '666666',
    });
  } else if (content.totalPerShow) {
    slide.addText(`$${content.totalPerShow.toLocaleString()}`, {
      x: 0.5, y: 1.1, w: 4, h: 0.6,
      fontSize: 36, bold: true, color: brandColor,
    });
    slide.addText('Estimated Investment Per Show', {
      x: 0.5, y: 1.65, w: 4, h: 0.3,
      fontSize: 12, color: '666666',
    });
  }

  if (content.allocation?.length > 0) {
    const tableData = [
      ['Category', '%', 'Amount'],
      ...content.allocation.slice(0, 6).map((r: any) => [
        r.category || '',
        `${r.percentage || 0}%`,
        `$${(r.amount || 0).toLocaleString()}`,
      ]),
    ];

    slide.addTable(tableData, {
      x: 0.5, y: 2.1, w: 5,
      fontSize: 10,
      color: '333333',
      fill: { color: 'F8F8F8' },
      border: { pt: 0.5, color: 'DDDDDD' },
    });
  }
}


function addPptxGridContent(slide: any, content: any) {
  const images = content.images || [];
  const cols = images.length <= 2 ? 2 : 3;
  const imgWidth = 2.8;
  const imgHeight = 1.6;
  const gap = 0.2;
  
  images.slice(0, 6).forEach((img: any, i: number) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = 0.5 + col * (imgWidth + gap);
    const y = 1.2 + row * (imgHeight + gap + 0.3);
    
    try {
      slide.addImage({
        path: img.url,
        x, y, w: imgWidth, h: imgHeight,
      });
      
      slide.addText(img.caption || '', {
        x, y: y + imgHeight + 0.05, w: imgWidth, h: 0.2,
        fontSize: 8, color: '666666', align: 'center',
      });
    } catch (e) {}
  });
}

// ============================================
// UTILITIES
// ============================================

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

export default {
  buildProposalSections,
  generateProposalPDF,
  generateProposalPPTX,
};
