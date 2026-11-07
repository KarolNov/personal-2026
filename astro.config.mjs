// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://karolnov.dev',
  // Pages are prerendered by default; opt individual routes into SSR with `export const prerender = false`.
  output: 'static',
  adapter: cloudflare({
    // Optimise images at build time — no Cloudflare Images binding needed.
    imageService: 'compile',
  }),
  // Sessions are unused; disabling them avoids provisioning a KV namespace.
  session: false,
  integrations: [mdx(), sitemap()],
});
