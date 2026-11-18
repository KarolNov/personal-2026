import { getPosts } from '../lib/posts';
import { HEADER, SITE, markdownResponse, postMarkdownUrl } from '../lib/llms';

export async function GET() {
  const posts = await getPosts();
  const text = `${HEADER}

Every blog post is also available as plain Markdown at the links below, and all of them together at ${SITE}/llms-full.txt.

## Blog

${posts.map((post) => `- [${post.data.title}](${postMarkdownUrl(post)}): ${post.data.description}`).join('\n')}

## Pages

- [About](${SITE}/about/): Work history, how I work, and background
- [Contact](${SITE}/contact/): How to get in touch
- [RSS feed](${SITE}/rss.xml): New posts

## Optional

- [GitHub](https://github.com/KarolNov): Open-source work, including y-providers
- [LinkedIn](https://www.linkedin.com/in/karol-nov/)
`;
  return markdownResponse(text, 'text/plain');
}
