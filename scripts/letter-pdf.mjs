// Prints a cover letter (letters-private/<slug>.md, via src/pages/letter/[slug].astro) to
// resume-private/Karol-Novljakovic-<Company>-Cover-Letter.pdf with headless Chrome, from `astro dev`,
// the only place the letter route exists. Run with `npm run letter -- <slug>`.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const slug = process.argv[2];
if (!slug) throw new Error('usage: npm run letter -- <slug>  (a file in letters-private/)');
const company = readFileSync(`letters-private/${slug}.md`, 'utf8').match(/^company:\s*(.+)$/m)?.[1].trim() ?? slug;
const file = `resume-private/Karol-Novljakovic-${company.replace(/\W+/g, '-')}-Cover-Letter.pdf`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4394;

const dev = spawn('npx', ['astro', 'dev', '--port', String(PORT), '--ignore-lock'], { stdio: 'ignore', detached: true });
try {
  const url = `http://localhost:${PORT}/letter/${slug}/`;
  await waitFor(url);
  mkdirSync('resume-private', { recursive: true });
  await promisify(execFile)(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=5000', `--print-to-pdf=${resolve(file)}`, url]);
  console.log(`wrote ${file}`);
} finally {
  try { process.kill(-dev.pid); } catch {}
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
