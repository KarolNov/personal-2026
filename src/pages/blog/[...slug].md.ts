import type { GetStaticPaths } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { getPosts } from '../../lib/posts';
import { postToMarkdown } from '../../lib/llms';

// Each post as plain Markdown at /blog/<slug>.md, for agents and LLMs (see src/lib/llms.ts). A rest param,
// like the HTML route, so posts in subfolders work too.
export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

export function GET({ props }: { props: { post: CollectionEntry<'blog'> } }) {
  return new Response(postToMarkdown(props.post));
}
