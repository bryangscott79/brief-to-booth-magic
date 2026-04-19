const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured. Please connect Firecrawl in Settings → Connectors.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping brand guidelines from:', formattedUrl);

    // Use Firecrawl's branding extraction
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['branding', 'markdown'],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract branding data
    const branding = data.data?.branding || data.branding;
    const markdown = data.data?.markdown || data.markdown;
    const metadata = data.data?.metadata || data.metadata;

    // Build structured intelligence entries from branding
    const entries: Array<{ category: string; title: string; content: string; tags: string[] }> = [];

    if (branding?.colors) {
      const colorParts: string[] = [];
      if (branding.colors.primary) colorParts.push(`Primary: ${branding.colors.primary}`);
      if (branding.colors.secondary) colorParts.push(`Secondary: ${branding.colors.secondary}`);
      if (branding.colors.accent) colorParts.push(`Accent: ${branding.colors.accent}`);
      if (branding.colors.background) colorParts.push(`Background: ${branding.colors.background}`);
      if (branding.colors.textPrimary) colorParts.push(`Text Primary: ${branding.colors.textPrimary}`);
      if (branding.colors.textSecondary) colorParts.push(`Text Secondary: ${branding.colors.textSecondary}`);

      if (colorParts.length > 0) {
        entries.push({
          category: 'visual_identity',
          title: 'Brand Colors (scraped)',
          content: `Brand colors extracted from ${formattedUrl}:\n${colorParts.join('\n')}`,
          tags: ['colors', 'scraped', 'website'],
        });
      }
    }

    if (branding?.fonts && branding.fonts.length > 0) {
      entries.push({
        category: 'visual_identity',
        title: 'Typography (scraped)',
        content: `Fonts used on ${formattedUrl}: ${branding.fonts.map((f: any) => f.family || f).join(', ')}`,
        tags: ['typography', 'fonts', 'scraped'],
      });
    }

    if (branding?.typography) {
      const typo = branding.typography;
      const parts: string[] = [];
      if (typo.fontFamilies) {
        if (typo.fontFamilies.primary) parts.push(`Primary font: ${typo.fontFamilies.primary}`);
        if (typo.fontFamilies.heading) parts.push(`Heading font: ${typo.fontFamilies.heading}`);
        if (typo.fontFamilies.code) parts.push(`Code font: ${typo.fontFamilies.code}`);
      }
      if (typo.fontSizes) {
        parts.push(`Font sizes: H1=${typo.fontSizes.h1}, H2=${typo.fontSizes.h2}, Body=${typo.fontSizes.body}`);
      }
      if (parts.length > 0) {
        entries.push({
          category: 'visual_identity',
          title: 'Typography Details (scraped)',
          content: parts.join('\n'),
          tags: ['typography', 'scraped'],
        });
      }
    }

    if (branding?.images?.logo) {
      entries.push({
        category: 'visual_identity',
        title: 'Logo URL (scraped)',
        content: `Logo found at: ${branding.images.logo}`,
        tags: ['logo', 'scraped'],
      });
    }

    if (branding?.components?.buttonPrimary) {
      const btn = branding.components.buttonPrimary;
      entries.push({
        category: 'visual_identity',
        title: 'Button Styles (scraped)',
        content: `Primary button: background ${btn.background}, text ${btn.textColor}, radius ${btn.borderRadius}`,
        tags: ['ui-components', 'scraped'],
      });
    }

    // Extract brand messaging from page content
    if (metadata?.title || metadata?.description) {
      entries.push({
        category: 'strategic_voice',
        title: 'Website Messaging (scraped)',
        content: `Title: ${metadata?.title || 'N/A'}\nDescription: ${metadata?.description || 'N/A'}`,
        tags: ['messaging', 'scraped', 'website'],
      });
    }

    console.log(`Extracted ${entries.length} brand intelligence entries`);

    return new Response(
      JSON.stringify({
        success: true,
        entries,
        branding,
        markdown: markdown?.substring(0, 2000), // truncate for response size
        metadata,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping brand guidelines:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
