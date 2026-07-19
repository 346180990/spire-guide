import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.href || 'https://example.com';
  const robotsTxt = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', siteUrl).href}`,
  ].join('\n');

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
