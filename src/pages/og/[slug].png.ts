import { readFile } from 'node:fs/promises';
import type { APIRoute, GetStaticPaths } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { SITE_TITLE } from '../../consts';
import { getPosts } from '../../lib/posts';

// Share cards for posts without a heroImage, rendered at build time. resvg is a native module,
// which is why the adapter prerenders in Node (astro.config.mjs).

export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: post }));
}) satisfies GetStaticPaths;

const colors = { bg: '#fbfaf8', fg: '#1c1b19', muted: '#6b6760', accent: '#c41e3a' };

// Fontsource splits Geist into subsets; satori falls back to latin-ext for glyphs like "ć".
const fonts = await Promise.all(
  (['400', '700'] as const).flatMap((weight) =>
    ['latin', 'latin-ext'].map(async (subset) => ({
      name: 'Geist',
      weight: Number(weight) as 400 | 700,
      style: 'normal' as const,
      data: await readFile(`src/assets/fonts/geist-${weight}-${subset}.ttf`),
    })),
  ),
);
const portrait = `data:image/jpeg;base64,${(await readFile('src/assets/karol.jpg')).toString('base64')}`;

// Minimal stand-in for JSX: satori takes React-element-shaped objects.
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]) => ({
  type,
  props: { style, children },
});

export const GET: APIRoute = async ({ props }) => {
  const { title, description } = (props as CollectionEntry<'blog'>).data;
  const svg = await satori(
    h(
      'div',
      {
        // Satori sizes boxes as content-box, so padding would push the footer off the canvas.
        width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '72px 90px 64px', background: colors.bg, borderTop: `12px solid ${colors.accent}`, fontFamily: 'Geist',
      },
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        h('div', {
          fontSize: title.length > 40 ? 58 : 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em',
          color: colors.fg, lineClamp: 3,
        }, title),
        h('div', { marginTop: 28, fontSize: 30, lineHeight: 1.4, color: colors.muted, lineClamp: 3 }, description),
      ),
      h(
        'div',
        { display: 'flex', alignItems: 'center', fontSize: 28 },
        {
          type: 'img',
          props: { src: portrait, width: 64, height: 64, style: { borderRadius: 32, border: `2px solid ${colors.accent}` } },
        },
        h('div', { marginLeft: 20, fontWeight: 700, color: colors.fg }, SITE_TITLE),
        h('div', { marginLeft: 'auto', fontWeight: 700, color: colors.accent }, 'karolnov.dev'),
      ),
    ) as Parameters<typeof satori>[0],
    { width: 1200, height: 630, fonts },
  );
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
