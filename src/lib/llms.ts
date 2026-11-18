import type { CollectionEntry } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

// Plain-text versions of the site for LLMs and agents, following https://llmstxt.org:
// /llms.txt is the index, /llms-full.txt has every post inline, and each post is also at /blog/<slug>.md.

/** An absolute URL on this site, from `site` in astro.config.mjs. */
export function siteUrl(path: string) {
  return new URL(path, import.meta.env.SITE).href;
}

export function postUrl(post: CollectionEntry<'blog'>) {
  return siteUrl(`/blog/${post.id}/`);
}

export function postMarkdownUrl(post: CollectionEntry<'blog'>) {
  return siteUrl(`/blog/${post.id}.md`);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Applies `fn` to each block of prose between blank lines, skipping fenced code blocks. A fence closes only on
 * a line of the same character, at least as long and with nothing after it, so a ``` inside a ```` block
 * stays code. Returning null drops the block.
 */
function mapProseBlocks(text: string, fn: (lines: string[]) => string[] | null) {
  const out: string[] = [];
  let block: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (block.length > 0) out.push(...(fn(block) ?? []));
    block = [];
  };
  for (const line of text.split('\n')) {
    const match = line.match(FENCE);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && match[2].trim() === '') fence = null;
    } else if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
      flush();
      fence = match[1];
      out.push(line);
    } else if (line.trim() === '') {
      flush();
      out.push(line);
    } else {
      block.push(line);
    }
  }
  flush();
  return out.join('\n');
}

/**
 * Drops MDX's ESM blocks (component imports, exports). As in MDX itself, one is a whole paragraph that starts
 * with `import` or `export`, so multi-line statements go too. Plain Markdown has no ESM, so .md posts pass
 * through as written.
 */
function stripMdxModuleBlocks(body: string) {
  return mapProseBlocks(body, (lines) => (/^(import|export)\s/.test(lines[0]) ? null : lines))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}

/** Pushes every Markdown heading down one level, leaving code blocks alone. */
export function demoteHeadings(markdown: string) {
  return mapProseBlocks(markdown, (lines) => lines.map((line) => line.replace(/^(#{1,5}) /, '#$1 ')));
}

/** A post as standalone Markdown, with a header saying where it lives. */
export function postToMarkdown(post: CollectionEntry<'blog'>) {
  const { title, description, pubDate, updatedDate, tags } = post.data;
  const meta = [
    `Published: ${pubDate.toISOString().slice(0, 10)}`,
    updatedDate && `Updated: ${updatedDate.toISOString().slice(0, 10)}`,
    tags.length > 0 && `Tags: ${tags.join(', ')}`,
    `URL: ${postUrl(post)}`,
  ].filter(Boolean);
  const isMdx = post.filePath?.endsWith('.mdx');
  const interactive = isMdx
    ? '\n\n> This post has interactive components on the web page. Their tags are left in below; open the URL to use them.'
    : '';
  const body = isMdx ? stripMdxModuleBlocks(post.body ?? '') : (post.body ?? '').replace(/^\n+/, '');
  return `# ${title}\n\n> ${description}\n\n${meta.join('\n')}${interactive}\n\n${body}`.trimEnd() + '\n';
}

/** Text for one line of a Markdown list: no line breaks, and brackets escaped so link text can't end early. */
export function listText(text: string) {
  return text.replace(/\s+/g, ' ').trim().replace(/[[\]]/g, '\\$&');
}

export const ABOUT = `I'm a principal software engineer at Ceros, based in Poland, working on the architecture of a next-generation visual editor: real-time collaboration and sync engines (Y.js / CRDTs), Web Components and AI-assisted tooling. I write here about sync engines, CRDTs and building software with AI agents.`;

export const HEADER = `# ${SITE_TITLE}\n\n> ${SITE_DESCRIPTION}\n\n${ABOUT}`;
