// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
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
  // Route caching for on-demand pages, held in Cloudflare's cache in front of the Worker (needs
  // `cache.enabled` in wrangler.jsonc). Routes and server islands opt in with Astro.cache.set(); the rest
  // stay uncached.
  cache: { provider: cacheCloudflare() },
  // The printable resume is noindex: it's there to be saved as a PDF, not found on its own.
  integrations: [mdx(), sitemap({ filter: (page) => !page.endsWith('/resume/') })],
  vite: {
    // The adapter pre-bundles every page's imports for workerd in dev, and resvg's native binary
    // can't be bundled. The share cards only ever render in Node (see prerenderEnvironment).
    optimizeDeps: { exclude: ['@resvg/resvg-js'] },
  },
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
  // resvg ships a native .node binary that Vite's dev dependency optimizer can't bundle.
  vite: {
    optimizeDeps: { exclude: ['@resvg/resvg-js'] },
    ssr: { optimizeDeps: { exclude: ['@resvg/resvg-js'] } },
  },
});
