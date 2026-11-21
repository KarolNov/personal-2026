import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

// One file per project on /projects/. Work projects come from the About page's roles; side projects
// are things with a repo or a live demo.
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** One line under the name, on the card and in the page's description. */
      summary: z.string(),
      kind: z.enum(['work', 'side']),
      /** Lower comes first within its section. */
      order: z.number(),
      /** My role, for work projects. */
      role: z.string().optional(),
      when: z.string(),
      status: z.enum(['Live', 'In progress', 'Open source', 'Sunset']),
      stack: z.array(z.string()).default([]),
      links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog, projects };
