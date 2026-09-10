/**
 * Validation for pictures uploaded into a blog post.
 *
 * `next.config.ts` permits remote images from exactly one host — the public
 * Supabase Storage bucket — so partners upload rather than paste a URL.
 * Widening `remotePatterns` to accept their link instead would let any site's
 * images render on Empiria's domain.
 *
 * Everything below distrusts what the file says about itself. The name and the
 * declared content type both arrive from whoever is uploading, so the only
 * statement worth believing is the bytes.
 *
 * See docs/BLOG.md, "Pictures are uploaded, not linked".
 */

export const MAX_BLOG_IMAGE_BYTES = 5 * 1024 * 1024;

export type BlogImageExt = 'jpg' | 'png' | 'webp';

export type BlogImageCheck =
  | { ok: true; ext: BlogImageExt; contentType: string }
  | { ok: false; reason: string };

/** `.jpeg` and `.jpg` are the same picture; store one spelling. */
const BY_EXTENSION: Record<string, BlogImageExt> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

const BY_CONTENT_TYPE: Record<string, BlogImageExt> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const CONTENT_TYPE: Record<BlogImageExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * What the first bytes actually say.
 *
 * SVG is absent on purpose and is not an oversight to be corrected later: it
 * is an image format that can carry script, and it would be served from the
 * same origin as the booking flow. There is no safe way to add it here.
 */
function sniff(bytes: Uint8Array): BlogImageExt | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }
  // RIFF....WEBP — the four-byte size sits between the two markers.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Refuse in this order: size, then the two claims, then the bytes.
 *
 * Size first is the point of the ordering — it is the only check that can be
 * made without pulling the file into memory, and a partner choosing the size
 * is exactly who should not be able to make the server read first and decide
 * afterwards.
 */
export async function validateBlogImage(file: File): Promise<BlogImageCheck> {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, reason: 'No file was supplied.' };
  }
  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' };
  }
  if (file.size > MAX_BLOG_IMAGE_BYTES) {
    return { ok: false, reason: 'Images must be 5 MB or smaller.' };
  }

  const byExt = BY_EXTENSION[extensionOf(file.name ?? '')];
  if (!byExt) {
    return { ok: false, reason: 'Images must be a .jpg, .png or .webp file.' };
  }

  const byType = BY_CONTENT_TYPE[(file.type ?? '').toLowerCase()];
  if (!byType) {
    return { ok: false, reason: 'That file type is not supported.' };
  }

  const head = new Uint8Array(await file.arrayBuffer());
  const actual = sniff(head);
  if (!actual) {
    return { ok: false, reason: 'That file is not a JPEG, PNG or WebP image.' };
  }
  // The name and the type are claims; the bytes are the file. All three have
  // to agree, so a PNG called .jpg is refused rather than quietly renamed —
  // a file whose bytes disagree with its name is a file worth refusing.
  if (actual !== byExt || actual !== byType) {
    return { ok: false, reason: 'That file does not match its extension.' };
  }

  return { ok: true, ext: actual, contentType: CONTENT_TYPE[actual] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `<author_id>/<uuid>.<ext>`, so every object is attributable and a hard
 * delete of a post can find its pictures.
 *
 * The author id is checked against the UUID shape rather than trusted: it
 * becomes a storage path, and a path segment supplied by a caller is how
 * traversal happens.
 */
export function blogObjectPath(authorId: string, ext: BlogImageExt): string {
  if (!UUID.test(authorId)) {
    throw new Error('blogObjectPath: author id must be a uuid');
  }
  return `${authorId}/${crypto.randomUUID()}.${ext}`;
}
