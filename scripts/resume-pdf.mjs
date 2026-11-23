// Renders the resume (src/pages/resume.astro) to PDF with headless Chrome:
//   src/assets/Karol-Novljakovic-Resume.pdf  the copy behind the About page's Download resume
//                                            button (src/pages/api/resume.ts, Turnstile-gated).
//                                            Printed from the production build, so no email.
//   resume-private/*.pdf (gitignored)        copies with RESUME_EMAIL from .env.local, printed
//                                            from `astro dev`, for sending out.
// Run with `npm run resume`.
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC_PDF = 'src/assets/Karol-Novljakovic-Resume.pdf';
const PRIVATE = [
  { file: 'resume-private/Karol-Novljakovic-Resume.pdf', query: '' },
  { file: 'resume-private/Karol-Novljakovic-Resume-Linear.pdf', query: '?with=linear-weather' },
];

// Public copy: build, serve dist/client, print, and check the email didn't get in. It's printed
// outside the repo and only moved into src/assets once it passes, so a leaked copy can't be committed.
execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' });
const site = await serveStatic('dist/client', 4393);
const email = readEnv('.env.local').RESUME_EMAIL;
const draft = join(tmpdir(), `resume-${process.pid}.pdf`);
try {
  // Async, so this process's own server stays free to answer Chrome.
  await print(`${site}/resume/`, draft);
  if (email && readFileSync(draft).includes(email)) throw new Error(`the public resume contains the email; ${PUBLIC_PDF} left as it was`);
  copyFileSync(draft, PUBLIC_PDF);
  console.log(`wrote ${PUBLIC_PDF}`);
} finally {
  site.close();
  try { unlinkSync(draft); } catch {}
}

// Private copies, from the dev server, which reads the email from .env.local.
if (!email) console.warn('RESUME_EMAIL is not set in .env.local; the private copies will have no email.');
const PORT = 4392;
// --ignore-lock: run alongside a dev server you may already have open, without touching it. Its own
// process group, so killing the group takes down npx and the astro process under it.
const dev = spawn('npx', ['astro', 'dev', '--port', String(PORT), '--ignore-lock'], { stdio: 'ignore', detached: true });
try {
  await waitFor(`http://localhost:${PORT}/resume/`);
  mkdirSync('resume-private', { recursive: true });
  for (const { file, query } of PRIVATE) await print(`http://localhost:${PORT}/resume/${query}`, file);
} finally {
  try { process.kill(-dev.pid); } catch {}
}

async function print(url, file) {
  await promisify(execFile)(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--virtual-time-budget=5000',
    `--print-to-pdf=${resolve(file)}`,
    url,
  ]);
  if (!file.startsWith(tmpdir())) console.log(`wrote ${file}`);
}

function serveStatic(root, port) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const base = resolve(root);
  const server = createServer((req, res) => {
    try {
      let path = resolve(join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (path !== base && !path.startsWith(base + sep)) throw new Error('outside root');
      if (statSync(path).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(Object.assign(server, { toString: () => `http://127.0.0.1:${port}` }))));
}

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*(?:export\s+)?(\w+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        // Strip matching quotes, as Vite's dotenv does, so the value is what ends up on the page.
        .map(([, key, value]) => [key, value.replace(/^(['"`])(.*)\1$/, '$2')]),
    );
  } catch {
    return {};
  }
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server didn't answer at ${url}`);
}
