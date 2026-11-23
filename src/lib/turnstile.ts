import { env } from 'cloudflare:workers';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/** Why a check failed, short and safe to show a visitor: siteverify's error codes or which field didn't match. */
export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/** Verifies a Turnstile token server-side; true only when it passes. See checkTurnstile. */
export async function verifyTurnstile(token: unknown, expectedAction: string, remoteIp?: string): Promise<boolean> {
  return (await checkTurnstile(token, expectedAction, remoteIp)).ok;
}

/**
 * Verifies a Turnstile token server-side, saying why when it fails. Fails closed: any network
 * error, bad response, action mismatch or unexpected hostname is a failure.
 *
 * Config: TURNSTILE_SECRET (secret), TURNSTILE_HOSTNAMES (comma-separated frontend hostnames).
 */
export async function checkTurnstile(
  token: unknown,
  expectedAction: string,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET;
  const hostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  );

  if (!secret || hostnames.size === 0) {
    console.error('turnstile: TURNSTILE_SECRET or TURNSTILE_HOSTNAMES is not configured');
    return { ok: false, reason: 'not-configured' };
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return { ok: false, reason: 'missing-token' };

  let result: SiteverifyResult;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    result = await res.json();
  } catch (err) {
    console.error('turnstile: siteverify request failed', err);
    return { ok: false, reason: 'siteverify-unreachable' };
  }

  // Cloudflare's test secrets (local dev and Workers Previews) answer without an action, so there
  // it can't be checked. A real secret always gets the action checked.
  const testSecret = /^[123]x0{31}AA$/.test(secret);
  const actionOk = result.action === expectedAction || (testSecret && result.action === undefined);
  const reason = !result.success
    ? (result['error-codes'] ?? []).join(', ') || 'rejected'
    : !actionOk
      ? `action-mismatch (${result.action ?? 'none'})`
      : !hostnames.has(result.hostname ?? '')
        ? `hostname-mismatch (${result.hostname ?? 'none'})`
        : undefined;
  if (reason) {
    console.warn('turnstile: verification rejected', {
      success: result.success,
      action: result.action,
      hostname: result.hostname,
      errors: result['error-codes'],
    });
    return { ok: false, reason };
  }
  return { ok: true };
}
