import { getPosts } from '../lib/posts';
import { HEADER, demoteHeadings, postToMarkdown } from '../lib/llms';

export async function GET() {
  const posts = await getPosts();
  // Each post's own title becomes a level-2 heading under the site header.
  const bodies = posts.map((post) => demoteHeadings(postToMarkdown(post)));
  return new Response(`${HEADER}\n\n${bodies.join('\n---\n\n')}`);
}
