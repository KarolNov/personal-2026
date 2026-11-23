// The About page's Download resume button. The PDF sits behind a Turnstile check
// (src/pages/api/resume.ts), so a click loads Turnstile, gets a token (invisibly unless Cloudflare
// wants an interaction, which shows its box under the Work heading), posts it and saves the file.
// Turnstile isn't loaded until someone asks for the resume.

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window { turnstile?: Turnstile }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  return (loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: SCRIPT, async: true });
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => {
      loading = undefined;
      reject(new Error('turnstile failed to load'));
    };
    document.head.appendChild(script);
  }));
}

export function initResumeDownload() {
  const form = document.querySelector<HTMLFormElement>('.resume-form');
  const button = form?.querySelector<HTMLButtonElement>('.resume');
  const check = document.querySelector<HTMLElement>('.resume-check');
  const status = document.querySelector<HTMLElement>('.resume-status');
  if (!form || !button || !check || !status) return;

  const busy = (on: boolean) => {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    busy(true);
    status.textContent = '';
    try {
      const token = await getToken(check);
      const res = await fetch(form.action, { method: 'POST', body: new URLSearchParams({ 'cf-turnstile-response': token }) });
      if (!res.ok) throw new Error(`resume ${res.status}`);
      save(await res.blob(), 'Karol-Novljakovic-Resume.pdf');
    } catch (err) {
      console.error(err);
      status.textContent = "Couldn't get the resume. Please try again.";
    } finally {
      busy(false);
    }
  });
}

/** A fresh single-use token: renders an interaction-only widget into `el` and removes it after. */
async function getToken(el: HTMLElement) {
  const [turnstile, { sitekey }] = await Promise.all([
    loadTurnstile(),
    fetch('/api/resume').then((r) => r.json() as Promise<{ sitekey: string }>),
  ]);
  return new Promise<string>((resolve, reject) => {
    const id = turnstile.render(el, {
      sitekey,
      action: 'resume',
      appearance: 'interaction-only',
      // Match a manual theme override; 'auto' only follows the OS.
      theme: document.documentElement.dataset.theme ?? 'auto',
      'response-field': false,
      callback: (token: string) => {
        turnstile.remove(id);
        resolve(token);
      },
      'error-callback': () => {
        turnstile.remove(id);
        reject(new Error('turnstile error'));
      },
    });
  });
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
