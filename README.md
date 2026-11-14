# personal-2026

Repo of my personal website and blog refresh - Nov 2026.

Built with [Astro 7](https://astro.build) and deployed as a single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
(static assets + on-demand routes) via `@astrojs/cloudflare`.

## What's inside

| Route | Rendering | Source |
|-------|-----------|--------|
| `/` landing page | prerendered | `src/pages/index.astro` |
| `/about/` | prerendered; the GitHub graph is a server island, edge-cached (1 h fresh, then stale-while-revalidate for a day) | `src/pages/about.astro` |
| `/blog/`, `/blog/<slug>/` | prerendered | `src/pages/blog/`, posts in `src/content/blog/` |
| `/rss.xml`, `/sitemap-index.xml` | prerendered | `src/pages/rss.xml.ts`, `@astrojs/sitemap` |
| `/contact/` | on demand (Worker) | `src/pages/contact.astro` + `src/actions/index.ts` |

- **Blog** — Markdown/MDX content collection with typed frontmatter (`src/content.config.ts`).
  Set `draft: true` to hide a post from production builds (still visible in `npm run dev`).
- **Contact form** — an [Astro Action](https://docs.astro.build/en/guides/actions/) that validates input,
  blocks bots with [Turnstile](https://developers.cloudflare.com/turnstile/) (verified server-side in
  `src/lib/turnstile.ts`) plus a honeypot field, and emails the message to you through
  [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) (free) via a `send_email` binding
  (`src/lib/mail.ts`). Email Routing can only send to verified destination addresses, which is all a contact form needs.
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

The site is served at **https://karolnov.dev** (custom domain route in `wrangler.jsonc`).

1. Make sure the `karolnov.dev` zone is on your Cloudflare account, then `npx wrangler login`.
2. Enable Email Routing and verify where contact messages should land:
   `npx wrangler email routing enable karolnov.dev`, then
   `npx wrangler email routing addresses create <your inbox>` and click the link in the verification email.
   Store that same address as a secret: `npx wrangler secret put CONTACT_TO`.
   Messages are sent from `blog@karolnov.dev` (`CONTACT_FROM` in `wrangler.jsonc`).
3. Create a Turnstile widget (Dashboard → Turnstile → Add widget, managed mode) for `karolnov.dev`, put its
   sitekey in `TURNSTILE_SITEKEY` in `wrangler.jsonc`, and store the secret: `npx wrangler secret put TURNSTILE_SECRET`
4. `npm run deploy` — Wrangler attaches `karolnov.dev` to the Worker and provisions the certificate.
