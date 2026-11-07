import { env } from 'cloudflare:workers';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Verifies a Turnstile token server-side. Fails closed: any network error, bad response,
 * action mismatch or unexpected hostname returns false.
 *
 * Config: TURNSTILE_SECRET (secret), TURNSTILE_HOSTNAMES (comma-separated frontend hostnames).
 */
export async function verifyTurnstile(
  token: unknown,
  expectedAction: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  const hostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  );

  if (!secret || hostnames.size === 0) {
    console.error('turnstile: TURNSTILE_SECRET or TURNSTILE_HOSTNAMES is not configured');
    return false;
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

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
    return false;
  }

  if (!result.success || result.action !== expectedAction || !hostnames.has(result.hostname ?? '')) {
    console.warn('turnstile: verification rejected', {
      success: result.success,
      action: result.action,
      hostname: result.hostname,
      errors: result['error-codes'],
    });
    return false;
  }
  return true;
}
