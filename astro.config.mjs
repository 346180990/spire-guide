// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  integrations: [mdx({
    extendMarkdownConfig: false,
  }), sitemap()],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['@astrojs/cloudflare'],
    },
  },
});
