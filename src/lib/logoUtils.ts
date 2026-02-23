/**
 * Logo Utilities
 * 
 * Provides functions to fetch logos automatically using Clearbit
 * and handle logo uploads/storage.
 */

/**
 * Extract domain from a URL or email
 */
export function extractDomain(input: string): string | null {
  if (!input) return null;
  
  // Try to extract from URL
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    return url.hostname.replace('www.', '');
  } catch {
    // Try to extract from email
    const emailMatch = input.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    // Check if it looks like a domain
    const domainMatch = input.match(/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (domainMatch) {
      return domainMatch[1];
    }
  }
  
  return null;
}

/**
 * Get logo URL from Clearbit API
 * Free tier: 10,000 requests/month
 */
export function getClearbitLogoUrl(domain: string, size: number = 256): string {
  if (!domain) return '';
  return `https://logo.clearbit.com/${domain}?size=${size}`;
}

/**
 * Check if a Clearbit logo exists for a domain
 */
export async function checkClearbitLogo(domain: string): Promise<boolean> {
  try {
    const response = await fetch(getClearbitLogoUrl(domain, 128), { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Try to find a logo for a company name or domain
 */
export async function findCompanyLogo(companyNameOrDomain: string): Promise<string | null> {
  // First, try treating it as a domain
  let domain = extractDomain(companyNameOrDomain);
  
  if (domain) {
    const exists = await checkClearbitLogo(domain);
    if (exists) {
      return getClearbitLogoUrl(domain, 256);
    }
  }
  
  // Try common domain extensions
  const cleanName = companyNameOrDomain
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  
  const extensions = ['.com', '.io', '.co', '.net', '.org'];
  
  for (const ext of extensions) {
    const testDomain = cleanName + ext;
    const exists = await checkClearbitLogo(testDomain);
    if (exists) {
      return getClearbitLogoUrl(testDomain, 256);
    }
  }
  
  return null;
}

/**
 * Convert image URL to base64 for PDF embedding
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Get logo from brief data
 * Tries to extract from brand info
 */
export function getClientLogoFromBrief(brief: any): string | null {
  if (!brief?.brand) return null;
  
  // Check for explicit logo URL in brief
  if (brief.brand.logoUrl) {
    return brief.brand.logoUrl;
  }
  
  // Try to construct Clearbit URL from company website
  if (brief.brand.website) {
    const domain = extractDomain(brief.brand.website);
    if (domain) {
      return getClearbitLogoUrl(domain, 256);
    }
  }
  
  // Try from company name
  if (brief.brand.name) {
    const cleanName = brief.brand.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return getClearbitLogoUrl(`${cleanName}.com`, 256);
  }
  
  return null;
}

/**
 * Generate initials fallback for missing logos
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * Generate a placeholder logo SVG as data URL
 */
export function generatePlaceholderLogo(initials: string, bgColor: string = '#0047AB'): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="${bgColor}" rx="20"/>
      <text x="100" y="115" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">${initials}</text>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default {
  extractDomain,
  getClearbitLogoUrl,
  checkClearbitLogo,
  findCompanyLogo,
  imageUrlToBase64,
  getClientLogoFromBrief,
  getInitials,
  generatePlaceholderLogo,
};
