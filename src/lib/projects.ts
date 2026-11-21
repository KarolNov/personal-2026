import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;

const KIND_ORDER = { work: 0, side: 1 } as const;

/** Published projects in display order: work first, then side projects. Drafts are visible in `astro dev` only. */
export async function getProjects() {
  const projects = await getCollection('projects', ({ data }) => import.meta.env.DEV || !data.draft);
  return projects.sort((a, b) => KIND_ORDER[a.data.kind] - KIND_ORDER[b.data.kind] || a.data.order - b.data.order);
}

export function projectUrl(project: Project) {
  return `/projects/${project.id}/`;
}
