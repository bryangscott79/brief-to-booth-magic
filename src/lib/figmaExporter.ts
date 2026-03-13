/**
 * Figma Exporter — Generates a structured JSON spec for Figma import
 *
 * Produces a JSON file that maps to Figma frames: text nodes, image references,
 * color tokens, and typography. Compatible with Figma's REST API or importable
 * via a lightweight Figma plugin.
 */

import { buildProposalSections, type ProposalData, type ProposalSection } from './proposalGenerator';

// ============================================
// TYPES
// ============================================

export interface FigmaTextNode {
  type: 'text';
  content: string;
  style: {
    fontSize: number;
    fontWeight: 'regular' | 'bold' | 'italic';
    color: string;
    align?: 'left' | 'center' | 'right';
  };
  position: { x: number; y: number; w: number; h: number };
}

export interface FigmaImageNode {
  type: 'image';
  url: string;
  alt: string;
  position: { x: number; y: number; w: number; h: number };
  fit?: 'fill' | 'contain' | 'cover';
}

export interface FigmaRectNode {
  type: 'rect';
  fill: string;
  position: { x: number; y: number; w: number; h: number };
  cornerRadius?: number;
}

export type FigmaNode = FigmaTextNode | FigmaImageNode | FigmaRectNode;

export interface FigmaFrame {
  name: string;
  sectionId: string;
  width: number;
  height: number;
  background: string;
  nodes: FigmaNode[];
}

export interface FigmaSpec {
  version: '1.0';
  projectName: string;
  generatedAt: string;
  colorTokens: Record<string, string>;
  typography: {
    heading: { fontFamily: string; fontSize: number; fontWeight: string };
    subheading: { fontFamily: string; fontSize: number; fontWeight: string };
    body: { fontFamily: string; fontSize: number; fontWeight: string };
    caption: { fontFamily: string; fontSize: number; fontWeight: string };
  };
  frames: FigmaFrame[];
}

// ============================================
// CONSTANTS
// ============================================

const FRAME_W = 1920;
const FRAME_H = 1080;
const MARGIN = 80;
const CONTENT_W = FRAME_W - MARGIN * 2;

// ============================================
// SPEC GENERATOR
// ============================================

export function generateFigmaSpec(
  data: ProposalData,
  options?: { activeSectionIds?: string[] }
): FigmaSpec {
  let sections = buildProposalSections(data);

  if (options?.activeSectionIds) {
    const activeSet = new Set(options.activeSectionIds);
    sections = sections.filter((s) => activeSet.has(s.id));
  }

  const brandColor = data.config.brandColor || '#0047AB';
  const secondaryColor = data.config.secondaryColor || '#4682B4';

  const spec: FigmaSpec = {
    version: '1.0',
    projectName: data.brief?.brand?.name || 'Project',
    generatedAt: new Date().toISOString(),
    colorTokens: {
      brand: brandColor,
      secondary: secondaryColor,
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#1A1A1A',
      textMuted: '#666666',
      textLight: '#999999',
      accent: secondaryColor,
      dark: '#0D0D0D',
    },
    typography: {
      heading: { fontFamily: 'Inter', fontSize: 48, fontWeight: 'bold' },
      subheading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 'regular' },
      body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 'regular' },
      caption: { fontFamily: 'Inter', fontSize: 12, fontWeight: 'regular' },
    },
    frames: sections.map((section) => buildFrame(section, brandColor)),
  };

  return spec;
}

// ============================================
// FRAME BUILDERS
// ============================================

function buildFrame(section: ProposalSection, brandColor: string): FigmaFrame {
  const frame: FigmaFrame = {
    name: section.title,
    sectionId: section.id,
    width: FRAME_W,
    height: FRAME_H,
    background: '#FFFFFF',
    nodes: [],
  };

  switch (section.type) {
    case 'cover':
      buildCoverFrame(frame, section, brandColor);
      break;
    case 'text':
      buildTextFrame(frame, section, brandColor);
      break;
    case 'image':
      buildImageFrame(frame, section, brandColor);
      break;
    case 'mixed':
      buildMixedFrame(frame, section, brandColor);
      break;
    case 'table':
      buildTableFrame(frame, section, brandColor);
      break;
    case 'grid':
      buildGridFrame(frame, section, brandColor);
      break;
  }

  return frame;
}

function buildCoverFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  frame.background = brandColor;

  // Brand color background block
  frame.nodes.push({
    type: 'rect',
    fill: brandColor,
    position: { x: 0, y: 0, w: FRAME_W, h: FRAME_H * 0.45 },
  });

  // Project title
  frame.nodes.push({
    type: 'text',
    content: c.projectTitle || 'Exhibit Concept Proposal',
    style: { fontSize: 64, fontWeight: 'bold', color: '#FFFFFF', align: 'center' },
    position: { x: MARGIN, y: 180, w: CONTENT_W, h: 120 },
  });

  // Subtitle
  const subtitle = [c.showName, c.footprintSize].filter(Boolean).join(' | ');
  if (subtitle) {
    frame.nodes.push({
      type: 'text',
      content: subtitle,
      style: { fontSize: 24, fontWeight: 'regular', color: '#FFFFFFCC', align: 'center' },
      position: { x: MARGIN, y: 320, w: CONTENT_W, h: 40 },
    });
  }

  // Client name
  frame.nodes.push({
    type: 'text',
    content: `Prepared for ${c.clientName || 'Client'}`,
    style: { fontSize: 18, fontWeight: 'regular', color: '#666666', align: 'center' },
    position: { x: MARGIN, y: 580, w: CONTENT_W, h: 30 },
  });

  // Date
  frame.nodes.push({
    type: 'text',
    content: c.date || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    style: { fontSize: 14, fontWeight: 'regular', color: '#999999', align: 'right' },
    position: { x: FRAME_W - MARGIN - 200, y: FRAME_H - 60, w: 200, h: 20 },
  });

  // Client logo placeholder
  if (c.clientLogo) {
    frame.nodes.push({
      type: 'image',
      url: c.clientLogo,
      alt: 'Client Logo',
      position: { x: MARGIN, y: 40, w: 180, h: 60 },
      fit: 'contain',
    });
  }
}

function buildTextFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  addSectionHeader(frame, section.title, brandColor);

  let y = 200;

  if (c.headline) {
    frame.nodes.push({
      type: 'text',
      content: c.headline,
      style: { fontSize: 32, fontWeight: 'bold', color: '#1A1A1A' },
      position: { x: MARGIN, y, w: CONTENT_W, h: 50 },
    });
    y += 70;
  }

  if (c.subheadline) {
    frame.nodes.push({
      type: 'text',
      content: c.subheadline,
      style: { fontSize: 18, fontWeight: 'italic', color: '#666666' },
      position: { x: MARGIN, y, w: CONTENT_W, h: 30 },
    });
    y += 50;
  }

  if (c.narrative) {
    frame.nodes.push({
      type: 'text',
      content: c.narrative.substring(0, 1200),
      style: { fontSize: 14, fontWeight: 'regular', color: '#333333' },
      position: { x: MARGIN, y, w: CONTENT_W, h: FRAME_H - y - 100 },
    });
  }

  // Team credits specific fields
  if (c.tools && Array.isArray(c.tools)) {
    frame.nodes.push({
      type: 'text',
      content: c.tools.join(' · '),
      style: { fontSize: 12, fontWeight: 'regular', color: '#999999', align: 'center' },
      position: { x: MARGIN, y: FRAME_H - 120, w: CONTENT_W, h: 20 },
    });
  }
}

function buildImageFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  addSectionHeader(frame, section.title, brandColor);

  if (c.imageUrl) {
    frame.nodes.push({
      type: 'image',
      url: c.imageUrl,
      alt: section.title,
      position: { x: MARGIN, y: 180, w: CONTENT_W, h: 720 },
      fit: 'contain',
    });
  }

  if (c.caption) {
    frame.nodes.push({
      type: 'text',
      content: c.caption,
      style: { fontSize: 12, fontWeight: 'italic', color: '#999999', align: 'center' },
      position: { x: MARGIN, y: 920, w: CONTENT_W, h: 20 },
    });
  }
}

function buildMixedFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  addSectionHeader(frame, section.title, brandColor);

  const colW = (CONTENT_W - 40) / 2;

  // Left column — main text
  const mainText = c.narrative || c.conceptDescription || c.philosophy || '';
  if (mainText) {
    frame.nodes.push({
      type: 'text',
      content: mainText.substring(0, 800),
      style: { fontSize: 13, fontWeight: 'regular', color: '#333333' },
      position: { x: MARGIN, y: 200, w: colW, h: 700 },
    });
  }

  // Right column — structured data
  const rightX = MARGIN + colW + 40;
  let rightY = 200;

  const lists: Array<{ label: string; items: string[] }> = [];

  if (c.briefAlignment?.length) {
    lists.push({ label: 'Brief Alignment', items: c.briefAlignment.slice(0, 5) });
  }
  if (c.designPrinciples?.length) {
    lists.push({
      label: 'Design Principles',
      items: c.designPrinciples.slice(0, 4).map((p: any) => `${p.name}: ${p.description}`),
    });
  }
  if (c.zones?.length) {
    lists.push({
      label: 'Zone Allocation',
      items: c.zones.map((z: any) => `${z.name}: ${z.sqft} sqft (${z.percentage}%)`),
    });
  }
  // Brand intelligence categories
  if (c.categories) {
    for (const [catKey, entries] of Object.entries(c.categories)) {
      const catLabel = catKey.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      lists.push({
        label: catLabel,
        items: (entries as any[]).slice(0, 3).map((e: any) => `${e.title}: ${e.content.substring(0, 100)}`),
      });
    }
  }

  for (const list of lists) {
    frame.nodes.push({
      type: 'text',
      content: list.label,
      style: { fontSize: 14, fontWeight: 'bold', color: brandColor },
      position: { x: rightX, y: rightY, w: colW, h: 24 },
    });
    rightY += 30;

    for (const item of list.items) {
      frame.nodes.push({
        type: 'text',
        content: `• ${item}`,
        style: { fontSize: 11, fontWeight: 'regular', color: '#333333' },
        position: { x: rightX, y: rightY, w: colW, h: 20 },
      });
      rightY += 24;
    }
    rightY += 16;
  }
}

function buildTableFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  addSectionHeader(frame, section.title, brandColor);

  let y = 200;

  if (c.totalPerShow) {
    frame.nodes.push({
      type: 'text',
      content: `$${c.totalPerShow.toLocaleString()}`,
      style: { fontSize: 48, fontWeight: 'bold', color: brandColor },
      position: { x: MARGIN, y, w: 400, h: 60 },
    });
    frame.nodes.push({
      type: 'text',
      content: 'Estimated Investment Per Show',
      style: { fontSize: 14, fontWeight: 'regular', color: '#666666' },
      position: { x: MARGIN, y: y + 60, w: 400, h: 24 },
    });
    y += 110;
  }

  if (c.allocation?.length) {
    // Table header background
    frame.nodes.push({
      type: 'rect',
      fill: '#F0F0F0',
      position: { x: MARGIN, y, w: CONTENT_W, h: 36 },
      cornerRadius: 4,
    });

    const colWidths = [600, 120, 180, 860];
    const headers = ['Category', '%', 'Amount', 'Description'];
    let headerX = MARGIN + 12;
    for (let i = 0; i < headers.length; i++) {
      frame.nodes.push({
        type: 'text',
        content: headers[i],
        style: { fontSize: 11, fontWeight: 'bold', color: '#333333' },
        position: { x: headerX, y: y + 8, w: colWidths[i], h: 20 },
      });
      headerX += colWidths[i];
    }
    y += 42;

    for (const row of c.allocation.slice(0, 8)) {
      let cellX = MARGIN + 12;
      const rowData = [
        row.category || '',
        `${row.percentage || 0}%`,
        `$${(row.amount || 0).toLocaleString()}`,
        (row.description || '').substring(0, 80),
      ];
      for (let i = 0; i < rowData.length; i++) {
        frame.nodes.push({
          type: 'text',
          content: rowData[i],
          style: { fontSize: 11, fontWeight: 'regular', color: '#333333' },
          position: { x: cellX, y, w: colWidths[i], h: 24 },
        });
        cellX += colWidths[i];
      }
      y += 28;
    }
  }
}

function buildGridFrame(frame: FigmaFrame, section: ProposalSection, brandColor: string) {
  const c = section.content;
  addSectionHeader(frame, section.title, brandColor);

  const images: Array<{ url: string; caption: string }> = c.images || [];
  const count = Math.min(images.length, 6);
  const cols = count <= 2 ? 2 : 3;
  const gap = 24;
  const imgW = (CONTENT_W - gap * (cols - 1)) / cols;
  const imgH = imgW * 0.5625;

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = MARGIN + col * (imgW + gap);
    const y = 200 + row * (imgH + gap + 30);

    frame.nodes.push({
      type: 'image',
      url: images[i].url,
      alt: images[i].caption || `Image ${i + 1}`,
      position: { x, y, w: imgW, h: imgH },
      fit: 'cover',
    });

    if (images[i].caption) {
      frame.nodes.push({
        type: 'text',
        content: images[i].caption,
        style: { fontSize: 10, fontWeight: 'regular', color: '#999999', align: 'center' },
        position: { x, y: y + imgH + 4, w: imgW, h: 18 },
      });
    }
  }
}

// ============================================
// HELPERS
// ============================================

function addSectionHeader(frame: FigmaFrame, title: string, brandColor: string) {
  // Accent bar
  frame.nodes.push({
    type: 'rect',
    fill: brandColor,
    position: { x: 0, y: 0, w: FRAME_W, h: 8 },
  });

  // Title
  frame.nodes.push({
    type: 'text',
    content: title,
    style: { fontSize: 42, fontWeight: 'bold', color: brandColor },
    position: { x: MARGIN, y: 60, w: CONTENT_W, h: 60 },
  });

  // Underline
  frame.nodes.push({
    type: 'rect',
    fill: brandColor,
    position: { x: MARGIN, y: 130, w: 200, h: 3 },
  });
}

// ============================================
// DOWNLOAD HELPER
// ============================================

export function downloadFigmaSpec(spec: FigmaSpec, projectName: string) {
  const json = JSON.stringify(spec, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-zA-Z0-9_\- ]/g, '_')}_figma_spec.json`;
  a.click();
  URL.revokeObjectURL(url);
}
