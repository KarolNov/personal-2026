import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../../lib/turnstile';
// Inlined into the Worker rather than served as a static asset, so the only way to the file is
// through the Turnstile check below. Made by `npm run resume` (scripts/resume-pdf.mjs), no email.
import pdfDataUrl from '../../assets/Karol-Novljakovic-Resume.pdf?inline';

export const prerender = false;

const FILENAME = 'Karol-Novljakovic-Resume.pdf';
const pdf = Uint8Array.from(atob(pdfDataUrl.slice(pdfDataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));

/** The sitekey for the widget. About is prerendered, so it asks here rather than baking in one
 *  environment's key (previews use Turnstile's test key). */
export const GET: APIRoute = () => Response.json({ sitekey: env.TURNSTILE_SITEKEY });

/** The PDF, for a Turnstile token from the About page's Download resume button. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let token: unknown;
  try {
    token = (await request.formData()).get('cf-turnstile-response');
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!(await verifyTurnstile(token, 'resume', clientAddress))) {
    return new Response("We couldn't verify you're human. Please try again.", { status: 403 });
  }

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${FILENAME}"`,
      'Cache-Control': 'no-store',
    },
  });
};
