// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import remarkAutoLink from './src/plugins/remark-auto-link.mjs';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://spireguide.top',
  markdown: {
    remarkPlugins: [remarkAutoLink],
  },
  integrations: [mdx({
    extendMarkdownConfig: true,
  }), sitemap()],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['@astrojs/cloudflare'],
    },
  },
});
