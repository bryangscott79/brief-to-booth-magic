/**
 * Spatial Utilities for Brief-to-Booth-Magic
 * 
 * This file provides zone normalization, validation, and spatial calculations
 * to ensure floor plans are mathematically accurate.
 * 
 * INSTALLATION: Copy this file to src/lib/spatialUtils.ts
 */

// ============================================
// TYPES
// ============================================

export interface ZonePosition {
  x: number;      // 0-100 (percentage from left)
  y: number;      // 0-100 (percentage from top/aisle)
  width: number;  // 0-100 (percentage of booth width)
  height: number; // 0-100 (percentage of booth depth)
}

export interface NormalizedZone {
  id: string;
  name: string;
  percentage: number;
  sqft: number;
  colorCode: string;
  position: ZonePosition;
  requirements: string[];
  adjacencies: string[];
  notes: string;
}

export interface BoothDimensions {
  width: number;           // feet
  depth: number;           // feet
  totalSqft: number;       // width × depth
  displayWidth: number;    // pixels for UI
  displayHeight: number;   // pixels for UI
  aspectRatio: number;     // width / depth
  footprintLabel: string;  // "30' × 30'"
  scaleDescription: string; // "mid-size peninsula booth"
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedZones: NormalizedZone[];
  totalPercentage: number;
  totalSqft: number;
}

export interface OverlapInfo {
  zone1: string;
  zone2: string;
  overlapArea: number;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_COLORS = [
  '#0047AB', // Cobalt Blue
  '#4682B4', // Steel Blue
  '#2F4F4F', // Dark Slate Gray
  '#DAA520', // Goldenrod
  '#8B4513', // Saddle Brown
  '#556B2F', // Dark Olive Green
  '#800080', // Purple
  '#CD853F', // Peru
];

const MAX_DISPLAY_SIZE = 400; // pixels - increased for better visibility

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Parse a footprint string like "30x30" or "20 x 40" into dimensions
 */
export function parseFootprint(footprintStr: string): { width: number; depth: number } {
  if (!footprintStr) return { width: 30, depth: 30 };
  
  const match = footprintStr.match(/(\d+)\s*[x×X]\s*(\d+)/);
  if (match) {
    return {
      width: parseInt(match[1], 10),
      depth: parseInt(match[2], 10),
    };
  }
  
  // Try single number (assume square)
  const singleMatch = footprintStr.match(/(\d+)/);
  if (singleMatch) {
    const size = parseInt(singleMatch[1], 10);
    return { width: size, depth: size };
  }
  
  return { width: 30, depth: 30 };
}

/**
 * Calculate booth dimensions and display sizing with proper aspect ratio
 */
export function calculateBoothDimensions(footprintStr: string): BoothDimensions {
  const { width, depth } = parseFootprint(footprintStr);
  const totalSqft = width * depth;
  const aspectRatio = width / depth;
  
  // Calculate display dimensions maintaining aspect ratio
  let displayWidth: number, displayHeight: number;
  if (aspectRatio >= 1) {
    displayWidth = MAX_DISPLAY_SIZE;
    displayHeight = Math.round(MAX_DISPLAY_SIZE / aspectRatio);
  } else {
    displayHeight = MAX_DISPLAY_SIZE;
    displayWidth = Math.round(MAX_DISPLAY_SIZE * aspectRatio);
  }
  
  // Generate scale description
  let scaleDescription: string;
  if (totalSqft >= 2400) {
    scaleDescription = "large island booth";
  } else if (totalSqft >= 1200) {
    scaleDescription = "mid-size island booth";
  } else if (totalSqft >= 600) {
    scaleDescription = "peninsula booth";
  } else if (totalSqft >= 200) {
    scaleDescription = "inline booth";
  } else {
    scaleDescription = "tabletop display";
  }
  
  return {
    width,
    depth,
    totalSqft,
    displayWidth,
    displayHeight,
    aspectRatio,
    footprintLabel: `${width}' × ${depth}'`,
    scaleDescription,
  };
}

/**
 * Normalize zone position to consistent 0-100 percentage scale
 * Handles both 0-1 ratio format and 0-100 percentage format
 */
export function normalizeZonePosition(position: any): ZonePosition {
  if (!position) {
    return { x: 0, y: 0, width: 25, height: 25 };
  }
  
  const pos = {
    x: typeof position.x === 'number' ? position.x : 0,
    y: typeof position.y === 'number' ? position.y : 0,
    width: typeof position.width === 'number' ? position.width : 25,
    height: typeof position.height === 'number' ? position.height : 25,
  };
  
  // Detect coordinate system: if ALL values are <= 1, assume it's a 0-1 ratio
  // This is more reliable than checking max value
  const allSmall = pos.x <= 1 && pos.y <= 1 && pos.width <= 1 && pos.height <= 1;
  const anyLarge = pos.x > 1 || pos.y > 1 || pos.width > 1 || pos.height > 1;
  
  // If mixed (some >1, some <=1), assume percentage format
  // If all <=1 and at least one > 0, assume ratio format
  const isRatio = allSmall && !anyLarge && (pos.x > 0 || pos.y > 0 || pos.width > 0 || pos.height > 0);
  
  return {
    x: isRatio ? pos.x * 100 : pos.x,
    y: isRatio ? pos.y * 100 : pos.y,
    width: isRatio ? pos.width * 100 : pos.width,
    height: isRatio ? pos.height * 100 : pos.height,
  };
}

/**
 * Normalize an entire zone object with calculated sqft
 */
export function normalizeZone(zone: any, index: number, totalSqft: number): NormalizedZone {
  const position = normalizeZonePosition(zone.position);
  
  // Calculate sqft and percentage from actual dimensions
  const areaRatio = (position.width / 100) * (position.height / 100);
  const calculatedPercentage = Math.round(areaRatio * 100);
  const calculatedSqft = Math.round(areaRatio * totalSqft);
  
  // Use provided values only if they're reasonably close to calculated
  const providedPercentage = typeof zone.percentage === 'number' ? zone.percentage : 0;
  const providedSqft = typeof zone.sqft === 'number' ? zone.sqft : 0;
  
  const percentage = providedPercentage && Math.abs(providedPercentage - calculatedPercentage) < 15
    ? providedPercentage
    : calculatedPercentage;
  
  const sqft = providedSqft && Math.abs(providedSqft - calculatedSqft) < 50
    ? providedSqft
    : calculatedSqft;
  
  return {
    id: zone.id || `zone_${index}`,
    name: zone.name || `Zone ${index + 1}`,
    percentage,
    sqft,
    colorCode: zone.colorCode || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    position,
    requirements: Array.isArray(zone.requirements) ? zone.requirements : [],
    adjacencies: Array.isArray(zone.adjacencies) ? zone.adjacencies : [],
    notes: typeof zone.notes === 'string' ? zone.notes : '',
  };
}

/**
 * Normalize all zones in a config
 */
export function normalizeZones(zones: any[], totalSqft: number): NormalizedZone[] {
  if (!Array.isArray(zones)) return [];
  return zones.map((zone, index) => normalizeZone(zone, index, totalSqft));
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if a zone extends past booth boundaries
 */
function checkBoundaries(zone: NormalizedZone): string[] {
  const errors: string[] = [];
  const { x, y, width, height } = zone.position;
  
  if (x < 0) {
    errors.push(`${zone.name}: Starts ${Math.abs(x).toFixed(1)}% past left edge`);
  }
  if (y < 0) {
    errors.push(`${zone.name}: Starts ${Math.abs(y).toFixed(1)}% past top edge`);
  }
  if (x + width > 102) { // Small tolerance for rounding
    errors.push(`${zone.name}: Extends ${(x + width - 100).toFixed(1)}% past right edge`);
  }
  if (y + height > 102) { // Small tolerance for rounding
    errors.push(`${zone.name}: Extends ${(y + height - 100).toFixed(1)}% past bottom edge`);
  }
  
  return errors;
}

/**
 * Check if two zones overlap
 */
function checkOverlap(a: NormalizedZone, b: NormalizedZone): OverlapInfo | null {
  const ax = a.position.x;
  const ay = a.position.y;
  const aw = a.position.width;
  const ah = a.position.height;
  
  const bx = b.position.x;
  const by = b.position.y;
  const bw = b.position.width;
  const bh = b.position.height;
  
  // Calculate overlap
  const overlapX = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const overlapY = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  
  if (overlapX > 0 && overlapY > 0) {
    const overlapArea = (overlapX * overlapY) / 100;
    return {
      zone1: a.name,
      zone2: b.name,
      overlapArea,
    };
  }
  
  return null;
}

/**
 * Validate an entire spatial layout
 */
export function validateSpatialLayout(zones: NormalizedZone[], totalSqft: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!zones || zones.length === 0) {
    return {
      valid: false,
      errors: ['No zones defined'],
      warnings: [],
      normalizedZones: [],
      totalPercentage: 0,
      totalSqft: 0,
    };
  }
  
  // Calculate totals
  const totalPercentage = zones.reduce((sum, z) => sum + z.percentage, 0);
  const totalZoneSqft = zones.reduce((sum, z) => sum + z.sqft, 0);
  
  // Check total allocation
  if (totalPercentage < 70) {
    warnings.push(`Zones only cover ${totalPercentage.toFixed(0)}% of booth (${(100 - totalPercentage).toFixed(0)}% is circulation/unallocated)`);
  } else if (totalPercentage > 120) {
    errors.push(`Zones total ${totalPercentage.toFixed(0)}% — significant overlap detected`);
  } else if (totalPercentage > 105) {
    warnings.push(`Zones total ${totalPercentage.toFixed(0)}% — minor overlap may exist`);
  }
  
  // Check each zone
  zones.forEach(zone => {
    // Boundary checks
    const boundaryErrors = checkBoundaries(zone);
    errors.push(...boundaryErrors);
    
    // Size warnings
    if (zone.sqft < 15 && zone.sqft > 0) {
      warnings.push(`${zone.name}: Only ${zone.sqft} sqft — may be too small to function`);
    }
    if (zone.percentage > 50) {
      warnings.push(`${zone.name}: Takes ${zone.percentage}% of booth — consider if this is intentional`);
    }
    
    // Dimension sanity check
    if (zone.position.width < 5 || zone.position.height < 5) {
      warnings.push(`${zone.name}: Very narrow (${zone.position.width.toFixed(0)}% × ${zone.position.height.toFixed(0)}%)`);
    }
  });
  
  // Check overlaps
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const overlap = checkOverlap(zones[i], zones[j]);
      if (overlap) {
        if (overlap.overlapArea > 10) {
          errors.push(`${overlap.zone1} and ${overlap.zone2} overlap significantly (${overlap.overlapArea.toFixed(1)}%)`);
        } else if (overlap.overlapArea > 3) {
          warnings.push(`${overlap.zone1} and ${overlap.zone2} have minor overlap (${overlap.overlapArea.toFixed(1)}%)`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedZones: zones,
    totalPercentage,
    totalSqft: totalZoneSqft,
  };
}

// ============================================
// LAYOUT ADJUSTMENT
// ============================================

/**
 * Clamp a zone to fit within booth boundaries
 */
export function clampZoneToBoundaries(zone: NormalizedZone, totalSqft: number): NormalizedZone {
  const pos = zone.position;
  
  // Ensure dimensions are positive and don't exceed 100%
  const width = Math.max(5, Math.min(pos.width, 100));
  const height = Math.max(5, Math.min(pos.height, 100));
  
  // Ensure position + dimension doesn't exceed boundary
  const x = Math.max(0, Math.min(pos.x, 100 - width));
  const y = Math.max(0, Math.min(pos.y, 100 - height));
  
  const newPosition = { x, y, width, height };
  const newSqft = Math.round((width / 100) * (height / 100) * totalSqft);
  const newPercentage = Math.round((width / 100) * (height / 100) * 100);
  
  return {
    ...zone,
    position: newPosition,
    sqft: newSqft,
    percentage: newPercentage,
  };
}

/**
 * Attempt to resolve overlaps by adjusting zone positions
 */
export function resolveOverlaps(zones: NormalizedZone[], totalSqft: number): NormalizedZone[] {
  // First clamp all zones to boundaries
  let resolved = zones.map(z => clampZoneToBoundaries(z, totalSqft));
  
  // Iterative overlap resolution
  for (let iteration = 0; iteration < 10; iteration++) {
    let anyOverlap = false;
    
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const overlap = checkOverlap(resolved[i], resolved[j]);
        
        if (overlap && overlap.overlapArea > 1) {
          anyOverlap = true;
          
          const a = resolved[i].position;
          const b = resolved[j].position;
          
          // Calculate push directions
          const pushRight = (a.x + a.width) - b.x;
          const pushDown = (a.y + a.height) - b.y;
          const pushLeft = (b.x + b.width) - a.x;
          const pushUp = (b.y + b.height) - a.y;
          
          // Find smallest push that resolves overlap
          const options = [
            { dir: 'right', push: pushRight, canDo: b.x + b.width + pushRight <= 100 },
            { dir: 'down', push: pushDown, canDo: b.y + b.height + pushDown <= 100 },
            { dir: 'left', push: pushLeft, canDo: a.x - pushLeft >= 0 },
            { dir: 'up', push: pushUp, canDo: a.y - pushUp >= 0 },
          ].filter(o => o.canDo).sort((x, y) => x.push - y.push);
          
          if (options.length > 0) {
            const best = options[0];
            if (best.dir === 'right') {
              resolved[j] = clampZoneToBoundaries({
                ...resolved[j],
                position: { ...b, x: b.x + best.push + 1 }
              }, totalSqft);
            } else if (best.dir === 'down') {
              resolved[j] = clampZoneToBoundaries({
                ...resolved[j],
                position: { ...b, y: b.y + best.push + 1 }
              }, totalSqft);
            } else if (best.dir === 'left') {
              resolved[i] = clampZoneToBoundaries({
                ...resolved[i],
                position: { ...a, x: a.x - best.push - 1 }
              }, totalSqft);
            } else if (best.dir === 'up') {
              resolved[i] = clampZoneToBoundaries({
                ...resolved[i],
                position: { ...a, y: a.y - best.push - 1 }
              }, totalSqft);
            }
          } else {
            // No valid push direction - shrink the smaller zone
            const shrinkTarget = resolved[i].sqft < resolved[j].sqft ? i : j;
            const shrinkZone = resolved[shrinkTarget];
            resolved[shrinkTarget] = clampZoneToBoundaries({
              ...shrinkZone,
              position: {
                ...shrinkZone.position,
                width: shrinkZone.position.width * 0.85,
                height: shrinkZone.position.height * 0.85
              }
            }, totalSqft);
          }
        }
      }
    }
    
    if (!anyOverlap) break;
  }
  
  return resolved;
}

/**
 * Create layout variations with proper math
 */
export function createLayoutVariation(
  baseZones: NormalizedZone[],
  totalSqft: number,
  variationType: 'balanced' | 'hero-focused' | 'engagement-first'
): NormalizedZone[] {
  let adjustedZones = [...baseZones];
  
  if (variationType === 'hero-focused') {
    // Find hero zone and expand it
    const heroIndex = adjustedZones.findIndex(z =>
      z.id.toLowerCase().includes('hero') ||
      z.name.toLowerCase().includes('hero') ||
      z.name.toLowerCase().includes('experience')
    );
    
    if (heroIndex >= 0) {
      const hero = adjustedZones[heroIndex];
      const expansionFactor = 1.15;
      
      // Calculate new dimensions, respecting boundaries
      const newWidth = Math.min(hero.position.width * expansionFactor, 100 - hero.position.x);
      const newHeight = Math.min(hero.position.height * expansionFactor, 100 - hero.position.y);
      
      adjustedZones[heroIndex] = {
        ...hero,
        position: { ...hero.position, width: newWidth, height: newHeight },
        sqft: Math.round((newWidth / 100) * (newHeight / 100) * totalSqft),
        percentage: Math.round((newWidth / 100) * (newHeight / 100) * 100),
      };
      
      // Compress other zones slightly
      adjustedZones = adjustedZones.map((z, i) => {
        if (i === heroIndex) return z;
        const factor = 0.92;
        const newW = z.position.width * factor;
        const newH = z.position.height * factor;
        return {
          ...z,
          position: { ...z.position, width: newW, height: newH },
          sqft: Math.round((newW / 100) * (newH / 100) * totalSqft),
          percentage: Math.round((newW / 100) * (newH / 100) * 100),
        };
      });
    }
  } else if (variationType === 'engagement-first') {
    // Compress hero zone first to make room
    const heroIndex = adjustedZones.findIndex(z =>
      z.id.toLowerCase().includes('hero') ||
      z.name.toLowerCase().includes('hero')
    );
    
    if (heroIndex >= 0) {
      const hero = adjustedZones[heroIndex];
      const factor = 0.8;
      const newW = hero.position.width * factor;
      const newH = hero.position.height * factor;
      adjustedZones[heroIndex] = {
        ...hero,
        position: { ...hero.position, width: newW, height: newH },
        sqft: Math.round((newW / 100) * (newH / 100) * totalSqft),
        percentage: Math.round((newW / 100) * (newH / 100) * 100),
      };
    }

    // Compress all non-lounge/meeting zones slightly to avoid overlap
    const loungeIndex = adjustedZones.findIndex(z =>
      z.id.toLowerCase().includes('lounge') ||
      z.name.toLowerCase().includes('lounge') ||
      z.name.toLowerCase().includes('meeting') ||
      z.name.toLowerCase().includes('connection')
    );

    adjustedZones = adjustedZones.map((z, i) => {
      if (i === loungeIndex) return z;
      if (i === heroIndex) return adjustedZones[heroIndex]; // already handled
      const factor = 0.88;
      const newW = z.position.width * factor;
      const newH = z.position.height * factor;
      return {
        ...z,
        position: { ...z.position, width: newW, height: newH },
        sqft: Math.round((newW / 100) * (newH / 100) * totalSqft),
        percentage: Math.round((newW / 100) * (newH / 100) * 100),
      };
    });
    
    // Now expand the lounge zone into freed space
    if (loungeIndex >= 0) {
      const lounge = adjustedZones[loungeIndex];
      const expansionFactor = 1.15;
      
      const newWidth = Math.min(lounge.position.width * expansionFactor, 100 - lounge.position.x);
      const newHeight = Math.min(lounge.position.height * expansionFactor, 100 - lounge.position.y);
      
      adjustedZones[loungeIndex] = {
        ...lounge,
        position: { ...lounge.position, width: newWidth, height: newHeight },
        sqft: Math.round((newWidth / 100) * (newHeight / 100) * totalSqft),
        percentage: Math.round((newWidth / 100) * (newHeight / 100) * 100),
      };
    }
  }
  
  // Resolve any overlaps created by adjustments
  return resolveOverlaps(adjustedZones, totalSqft);
}

// ============================================
// PROMPT HELPERS
// ============================================

/**
 * Generate a human-readable position description for prompts
 */
export function describeZonePosition(zone: NormalizedZone): string {
  const { x, y, width, height } = zone.position;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  
  // Horizontal position
  let horizontal: string;
  if (centerX < 20) horizontal = 'left edge';
  else if (centerX < 38) horizontal = 'left side';
  else if (centerX < 62) horizontal = 'center';
  else if (centerX < 80) horizontal = 'right side';
  else horizontal = 'right edge';
  
  // Depth position (y=0 is front/aisle, y=100 is back wall)
  let depth: string;
  if (centerY < 15) depth = 'front (aisle-facing)';
  else if (centerY < 35) depth = 'front-center';
  else if (centerY < 65) depth = 'middle';
  else if (centerY < 85) depth = 'back-center';
  else depth = 'back wall';
  
  return `${horizontal}, ${depth}`;
}

/**
 * Sort zones by visibility for a given camera angle
 */
export function sortZonesByVisibility(zones: NormalizedZone[], cameraAngle: string): NormalizedZone[] {
  return [...zones].sort((a, b) => {
    const aScore = getVisibilityScore(a, cameraAngle);
    const bScore = getVisibilityScore(b, cameraAngle);
    return bScore - aScore;
  });
}

function getVisibilityScore(zone: NormalizedZone, cameraAngle: string): number {
  const { x, y, width, height } = zone.position;
  const centerY = y + height / 2;
  const centerX = x + width / 2;
  const area = (width * height) / 100;
  
  switch (cameraAngle) {
    case 'front':
    case 'hero_34':
      return (100 - centerY) * 2 + area;
    case 'back':
      return centerY * 2 + area;
    case 'left':
      return (100 - centerX) * 2 + area;
    case 'right':
      return centerX * 2 + area;
    case 'top':
    default:
      return area * 5;
  }
}

/**
 * Generate validated zone descriptions for prompts
 */
export function generateZoneDescriptionsForPrompt(
  zones: NormalizedZone[],
  totalSqft: number,
  cameraAngle: string = 'hero_34'
): string {
  const sortedZones = sortZonesByVisibility(zones, cameraAngle);
  
  return sortedZones.map(zone => {
    const posDesc = describeZonePosition(zone);
    const notesPart = zone.notes ? ` — ${zone.notes}` : '';
    return `- ${zone.name}: ${zone.percentage}% (${zone.sqft} sqft), positioned ${posDesc}${notesPart}`;
  }).join('\n');
}

/**
 * Generate scale context for prompts
 */
export function generateScaleContext(footprintStr: string): string {
  const dims = calculateBoothDimensions(footprintStr);
  const ceilingHt = dims.totalSqft > 1200 ? "16-20" : dims.totalSqft > 600 ? "12-16" : "10-12";
  const peopleAcross = Math.round(dims.width / 2.5);
  
  return `
PHYSICAL SCALE (CRITICAL — render booth at this exact size, not larger):
- Booth footprint: ${dims.width} feet wide × ${dims.depth} feet deep (${dims.totalSqft} sq ft total)
- This is a ${dims.scaleDescription}
- Ceiling/fascia height: ${ceilingHt} feet
- Human reference: average person is 5'8". Booth is ${dims.width}' wide — roughly ${peopleAcross} people shoulder-to-shoulder
- Standard 10-foot convention aisles on open sides
- The booth fits naturally within a convention hall — do NOT make it look like a mega-exhibit or multi-story structure`;
}

// ============================================
// EXPORT ALL
// ============================================

export default {
  parseFootprint,
  calculateBoothDimensions,
  normalizeZonePosition,
  normalizeZone,
  normalizeZones,
  validateSpatialLayout,
  clampZoneToBoundaries,
  resolveOverlaps,
  createLayoutVariation,
  describeZonePosition,
  sortZonesByVisibility,
  generateZoneDescriptionsForPrompt,
  generateScaleContext,
};
