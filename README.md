# personal-2026

Repo of my personal website and blog refresh - Nov 2026.

Built with [Astro 7](https://astro.build) and deployed as a single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
(static assets + on-demand routes) via `@astrojs/cloudflare`.

## What's inside

| Route | Rendering | Source |
|-------|-----------|--------|
| `/` landing page | prerendered | `src/pages/index.astro` |
| `/blog/`, `/blog/<slug>/` | prerendered | `src/pages/blog/`, posts in `src/content/blog/` |
| `/rss.xml`, `/sitemap-index.xml` | prerendered | `src/pages/rss.xml.ts`, `@astrojs/sitemap` |
| `/contact/` | on demand (Worker) | `src/pages/contact.astro` + `src/actions/index.ts` |

- **Blog** — Markdown/MDX content collection with typed frontmatter (`src/content.config.ts`).
  Set `draft: true` to hide a post from production builds (still visible in `npm run dev`).
- **Contact form** — an [Astro Action](https://docs.astro.build/en/guides/actions/) that validates input,
  drops bots via a honeypot field, and sends the message with the
  [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) `send_email` binding.
  Works without JavaScript.

## Commands

| Command | Action |
|---------|--------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` (runs in workerd) |
| `npm run build` | Build to `./dist/` |
| `npm run preview` | Build and preview the production Worker locally |
| `npm run check` | Type-check `.astro`/`.ts` files |
| `npm run deploy` | Build and deploy with Wrangler |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |

Locally, the email binding is simulated — sent messages are logged to the console and written under `.wrangler/tmp/email/`.

## Before the first deploy

1. Set your domain in `astro.config.mjs` (`site`) and `public/robots.txt`.
2. `npx wrangler login`
3. Onboard the sending domain for Email Service: `npx wrangler email sending enable <your-domain>`
4. In `wrangler.jsonc`, set `CONTACT_FROM` (an address on that domain) and `CONTACT_TO` (where messages go).
5. `npm run deploy`, then attach a custom domain to the `personal-2026` Worker in the Cloudflare dashboard
   (or add a `routes` entry to `wrangler.jsonc`).
