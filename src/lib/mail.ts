import { EmailMessage } from 'cloudflare:email';
import { env } from 'cloudflare:workers';
import { createMimeMessage, Mailbox } from 'mimetext';

interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

/**
 * Sends a contact-form message to the site owner via Cloudflare Email Routing.
 *
 * Email Routing (free) lets a Worker send only to *verified destination addresses*, so
 * CONTACT_TO must be verified under Email Routing → Destination addresses. CONTACT_FROM must
 * be an address on a domain with Email Routing enabled. The visitor goes in Reply-To.
 */
export async function sendContactEmail({ name, email, message }: ContactMessage) {
  // Collapse whitespace so user input can't break header lines.
  const safeName = name.replace(/\s+/g, ' ').trim();

  const msg = createMimeMessage();
  msg.setSender({ name: 'Website contact form', addr: env.CONTACT_FROM });
  msg.setRecipient(env.CONTACT_TO);
  msg.setHeader('Reply-To', new Mailbox({ name: safeName, addr: email }));
  msg.setSubject(`New message from ${safeName}`);
  msg.addMessage({
    contentType: 'text/plain',
    encoding: 'base64', // safe for non-ASCII text and arbitrarily long lines
    data: toBase64Lines(`From: ${safeName} <${email}>\n\n${message}`),
  });

  await env.EMAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, msg.asRaw()));
}

/** UTF-8 → base64, wrapped at 76 chars per line as MIME requires. */
function toBase64Lines(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/.{76}(?=.)/g, '$&\r\n');
}
