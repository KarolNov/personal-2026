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
  blocks bots with [Turnstile](https://developers.cloudflare.com/turnstile/) (verified server-side in
  `src/lib/turnstile.ts`) plus a honeypot field, and sends the message with the
  [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) `send_email` binding.
  The Turnstile widget needs JavaScript.

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

For local development, `cp .dev.vars.example .dev.vars` — it holds Cloudflare's Turnstile *test* keys (always pass).
Locally, the email binding is simulated — sent messages are logged to the console and written under `.wrangler/tmp/email/`.

## Before the first deploy

The site is served at **https://beta.karolnov.dev** for now (custom domain route in `wrangler.jsonc`).
To move to the apex `karolnov.dev`, update the `routes` pattern and `TURNSTILE_HOSTNAMES` in `wrangler.jsonc`,
`site` in `astro.config.mjs`, and the sitemap URL in `public/robots.txt`.

1. Make sure the `karolnov.dev` zone is on your Cloudflare account, then `npx wrangler login`.
2. Onboard the sending domain for Email Service: `npx wrangler email sending enable karolnov.dev`
   Contact messages are sent from `blog@karolnov.dev` (`CONTACT_FROM` in `wrangler.jsonc`) to the address in the
   `CONTACT_TO` secret: `npx wrangler secret put CONTACT_TO`
3. Create a Turnstile widget (Dashboard → Turnstile → Add widget, managed mode) for `karolnov.dev`, put its
   sitekey in `TURNSTILE_SITEKEY` in `wrangler.jsonc`, and store the secret: `npx wrangler secret put TURNSTILE_SECRET`
4. `npm run deploy` — Wrangler attaches `beta.karolnov.dev` to the Worker and provisions the certificate.
