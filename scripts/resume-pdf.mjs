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
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC_PDF = 'src/assets/Karol-Novljakovic-Resume.pdf';
const PRIVATE = [
  { file: 'resume-private/Karol-Novljakovic-Resume.pdf', query: '' },
  { file: 'resume-private/Karol-Novljakovic-Resume-Linear.pdf', query: '?with=linear-weather' },
];

// Public copy: build, serve dist/client, print, and check the email didn't get in.
execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' });
const site = await serveStatic('dist/client', 4393);
try {
  // Async, so this process's own server stays free to answer Chrome.
  await print(`${site}/resume/`, PUBLIC_PDF);
} finally {
  site.close();
}
const email = readEnv('.env.local').RESUME_EMAIL;
if (email && readFileSync(PUBLIC_PDF).includes(email)) throw new Error(`${PUBLIC_PDF} contains the email`);

// Private copies, from the dev server, which reads the email from .env.local.
if (!email) console.warn('RESUME_EMAIL is not set in .env.local; the private copies will have no email.');
const PORT = 4392;
const dev = spawn('npx', ['astro', 'dev', '--port', String(PORT)], { stdio: 'ignore' });
try {
  await waitFor(`http://localhost:${PORT}/resume/`);
  mkdirSync('resume-private', { recursive: true });
  for (const { file, query } of PRIVATE) await print(`http://localhost:${PORT}/resume/${query}`, file);
} finally {
  dev.kill();
  execFileSync('npx', ['astro', 'dev', 'stop'], { stdio: 'ignore' });
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
  console.log(`wrote ${file}`);
}

function serveStatic(root, port) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer((req, res) => {
    let path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if (statSync(path).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(Object.assign(server, { toString: () => `http://localhost:${port}` }))));
}

function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
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
