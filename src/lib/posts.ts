import { getCollection } from 'astro:content';

/** Published posts, newest first. Drafts are visible in `astro dev` only. */
export async function getPosts() {
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** A `view-transition-name` that pairs a post's title in lists with its heading on the post page. */
export function titleTransitionName(id: string) {
  return `post-${id.replace(/[^a-z0-9-]/gi, '-')}`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
