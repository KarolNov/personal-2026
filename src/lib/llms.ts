import type { CollectionEntry } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

// Plain-text versions of the site for LLMs and agents, following https://llmstxt.org:
// /llms.txt is the index, /llms-full.txt has every post inline, and each post is also at /blog/<slug>.md.

export const SITE = 'https://karolnov.dev';

export function postUrl(post: CollectionEntry<'blog'>) {
  return `${SITE}/blog/${post.id}/`;
}

export function postMarkdownUrl(post: CollectionEntry<'blog'>) {
  return `${SITE}/blog/${post.id}.md`;
}

/** Applies `fn` to each line outside fenced code blocks; returning null drops the line. */
function mapProseLines(text: string, fn: (line: string) => string | null) {
  let inFence = false;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const mapped = inFence || /^\s*(```|~~~)/.test(line) ? line : fn(line);
    if (mapped !== null) out.push(mapped);
  }
  return out.join('\n');
}

/** Drops MDX's top-level ESM lines (component imports, exports); the prose and code blocks stay as written. */
function stripMdxModuleLines(body: string) {
  return mapProseLines(body, (line) => (/^(import|export)\s/.test(line) ? null : line)).replace(/^\n+/, '');
}

/** Pushes every Markdown heading down one level, leaving code blocks alone. */
export function demoteHeadings(markdown: string) {
  return mapProseLines(markdown, (line) => line.replace(/^(#{1,5}) /, '#$1 '));
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
  const interactive = post.filePath?.endsWith('.mdx')
    ? '\n\n> This post has interactive components on the web page. Their tags are left in below; open the URL to use them.'
    : '';
  return `# ${title}\n\n> ${description}\n\n${meta.join('\n')}${interactive}\n\n${stripMdxModuleLines(post.body ?? '')}`.trimEnd() + '\n';
}

export const ABOUT = `I'm a principal software engineer at Ceros, based in Poland, working on the architecture of a next-generation visual editor: real-time collaboration and sync engines (Y.js / CRDTs), Web Components and AI-assisted tooling. I write here about sync engines, CRDTs and building software with AI agents.`;

export const HEADER = `# ${SITE_TITLE}\n\n> ${SITE_DESCRIPTION}\n\n${ABOUT}`;

export function markdownResponse(text: string, type = 'text/markdown') {
  return new Response(text, { headers: { 'Content-Type': `${type}; charset=utf-8` } });
}
