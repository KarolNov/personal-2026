import { GITHUB_URL, LINKEDIN_URL } from '../consts';
import { getPosts } from '../lib/posts';
import { getProjects } from '../lib/projects';
import { HEADER, listText, postMarkdownUrl, siteUrl } from '../lib/llms';

export async function GET() {
  const posts = await getPosts();
  const projects = await getProjects();
  const text = `${HEADER}

Every blog post is also available as plain Markdown at the links below, and all of them together at ${siteUrl('/llms-full.txt')}.

## Blog

${posts.map((post) => `- [${listText(post.data.title)}](${postMarkdownUrl(post)}): ${listText(post.data.description)}`).join('\n')}

## Projects

${projects.map((p) => `- [${listText(p.data.title)}](${siteUrl(`/projects/${p.id}/`)}): ${listText(p.data.summary)}`).join('\n')}

## Pages

- [About](${siteUrl('/about/')}): Work history, how I work, and background
- [Projects](${siteUrl('/projects/')}): Products I built at work and side projects
- [Contact](${siteUrl('/contact/')}): How to get in touch
- [RSS feed](${siteUrl('/rss.xml')}): New posts

## Optional

- [GitHub](${GITHUB_URL}): Open-source work, including y-providers
- [LinkedIn](${LINKEDIN_URL})
`;
  return new Response(text);
}
