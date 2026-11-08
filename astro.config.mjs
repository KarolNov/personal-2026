// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
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
    // Prerender in Node, not workerd: the post share cards (src/pages/og) use resvg's native binary.
    prerenderEnvironment: 'node',
  }),
  // Sessions are unused; disabling them avoids provisioning a KV namespace.
  session: false,
  integrations: [mdx(), sitemap()],
  // Downloaded at build time and served from the site itself. latin-ext covers Polish and Croatian.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Geist',
      cssVariable: '--font-geist',
      weights: ['400', '600', '700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      weights: ['400'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
