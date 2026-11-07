import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../lib/turnstile';

export const server = {
  contact: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string({ error: 'Please enter your name.' }).trim().min(1, 'Please enter your name.').max(100),
      email: z.email({ error: 'Please enter a valid email address.' }).max(200),
      message: z.string({ error: 'Please enter a message.' }).trim().min(10, 'Message should be at least 10 characters.').max(5000),
      // Honeypot: real users never see or fill this field (empty fields arrive as null).
      website: z.string().nullish(),
      // Turnstile token, injected into the form by the widget.
      'cf-turnstile-response': z.string().nullish(),
    }),
    handler: async (input, ctx) => {
      const { name, email, message, website } = input;
      if (website) return { ok: true }; // silently drop bots

      const human = await verifyTurnstile(input['cf-turnstile-response'], 'contact', ctx.clientAddress);
      if (!human) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: "We couldn't verify you're human. Please complete the check and try again.",
        });
      }

      try {
        await env.EMAIL.send({
          from: { email: env.CONTACT_FROM, name: 'Website contact form' },
          to: env.CONTACT_TO,
          replyTo: { email, name },
          subject: `New message from ${name}`,
          text: `From: ${name} <${email}>\n\n${message}`,
        });
      } catch (err) {
        console.error('contact: failed to send email', err);
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Sorry, your message could not be sent. Please try again later.',
        });
      }

      return { ok: true };
    },
  }),
};
