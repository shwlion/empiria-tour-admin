/**
 * Blog image validation.
 *
 *   bun run lib/blogUpload.test.ts
 *
 * The uploader is a partner, and the bucket is served from the same origin as
 * the booking flow — so a file's own claim about what it is counts for
 * nothing. See docs/BLOG.md, "Pictures are uploaded, not linked".
 */

import { validateBlogImage, blogObjectPath, MAX_BLOG_IMAGE_BYTES } from './blogUpload';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);

// ── Real file headers ─────────────────────────────────────────────────────
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = () => {
  const b = new Uint8Array(16);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  b.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return b;
};
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = new TextEncoder().encode('GIF89a......');

const file = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as unknown as BlobPart], name, { type });

// ── 1. The three accepted formats ─────────────────────────────────────────
{
  const j = await validateBlogImage(file(JPEG, 'a.jpg', 'image/jpeg'));
  eq('jpeg accepted', j.ok, true);
  eq('jpeg extension normalised', j.ok && j.ext, 'jpg');

  eq('jpeg accepted as .jpeg', (await validateBlogImage(file(JPEG, 'a.jpeg', 'image/jpeg'))).ok, true);
  eq('png accepted', (await validateBlogImage(file(PNG, 'a.png', 'image/png'))).ok, true);
  eq('webp accepted', (await validateBlogImage(file(webp(), 'a.webp', 'image/webp'))).ok, true);
  eq('uppercase extension accepted', (await validateBlogImage(file(PNG, 'A.PNG', 'image/png'))).ok, true);
}

// ── 2. Magic bytes overrule the name and the declared type ────────────────
{
  const renamed = await validateBlogImage(file(PNG, 'a.jpg', 'image/jpeg'));
  eq('a PNG renamed .jpg is refused', renamed.ok, false);

  const lying = await validateBlogImage(file(JPEG, 'a.png', 'image/png'));
  eq('a JPEG renamed .png is refused', lying.ok, false);

  const svgAsPng = await validateBlogImage(file(SVG, 'a.png', 'image/png'));
  eq('an SVG called .png is refused', svgAsPng.ok, false);

  const gif = await validateBlogImage(file(GIF, 'a.png', 'image/png'));
  eq('a GIF called .png is refused', gif.ok, false);
}

// ── 3. SVG is refused however it is dressed ───────────────────────────────
{
  eq('svg by name and type', (await validateBlogImage(file(SVG, 'a.svg', 'image/svg+xml'))).ok, false);
  eq('svg by name only', (await validateBlogImage(file(SVG, 'a.svg', 'image/png'))).ok, false);
  eq('svg by type only', (await validateBlogImage(file(SVG, 'a.png', 'image/svg+xml'))).ok, false);
}

// ── 4. Extension and declared type must both be in the set ────────────────
{
  eq('unknown extension refused', (await validateBlogImage(file(PNG, 'a.bmp', 'image/png'))).ok, false);
  eq('unknown declared type refused', (await validateBlogImage(file(PNG, 'a.png', 'application/pdf'))).ok, false);
  eq('no extension refused', (await validateBlogImage(file(PNG, 'noext', 'image/png'))).ok, false);
  eq('double extension refused on the last one', (await validateBlogImage(file(PNG, 'a.png.svg', 'image/png'))).ok, false);
}

// ── 5. The size cap comes before the read ─────────────────────────────────
{
  eq('cap is 5 MB', MAX_BLOG_IMAGE_BYTES, 5 * 1024 * 1024);

  const oversize = file(PNG, 'a.png', 'image/png');
  Object.defineProperty(oversize, 'size', { value: 6 * 1024 * 1024 });
  eq('6 MB refused', (await validateBlogImage(oversize)).ok, false);

  // If the cap were checked after the read, this would throw rather than
  // return — which is the difference between "refused" and "loaded 6 MB of a
  // partner's choosing into the server's memory first".
  const exploding = {
    name: 'big.png',
    type: 'image/png',
    size: 6 * 1024 * 1024,
    arrayBuffer: () => { throw new Error('the file was read before the size was checked'); },
  } as unknown as File;
  let threw = false;
  let res: Awaited<ReturnType<typeof validateBlogImage>> | null = null;
  try { res = await validateBlogImage(exploding); } catch { threw = true; }
  ok('oversize file is never read', !threw);
  eq('oversize file is refused', res?.ok, false);

  eq('empty file refused', (await validateBlogImage(file(new Uint8Array(0), 'a.png', 'image/png'))).ok, false);
}

// ── 6. Object paths are scoped to the author ──────────────────────────────
{
  const author = '11111111-2222-3333-4444-555555555555';
  const path = blogObjectPath(author, 'png');
  ok('path is under the author id', path.startsWith(`${author}/`));
  ok('path ends with the extension', path.endsWith('.png'));
  ok('path has no traversal', !path.includes('..') && !path.includes('//'));

  const a = blogObjectPath(author, 'png');
  const b = blogObjectPath(author, 'png');
  ok('two uploads do not collide', a !== b);

  let rejected = false;
  try { blogObjectPath('../../etc', 'png'); } catch { rejected = true; }
  ok('a non-uuid author is rejected', rejected);
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
