/**
 * A safe Markdown subset for blog bodies.
 *
 * The author of a post is a partner — a semi-trusted external business — and
 * the storefront shares an origin with the booking flow and the payment pages.
 * So this module never inserts an author's string as markup. It parses their
 * source and returns React elements *we* construct; their text only ever
 * arrives as element children, which React escapes.
 *
 * That is the whole security argument, and it is deliberately not
 * sanitisation: there is no allowlist of tags to keep current and no parser
 * bypass to discover, because the code path that turns a string into markup
 * does not exist here. React's raw-HTML escape hatch must never appear in
 * this file; lib/blogMarkdown.test.ts asserts by name that it does not.
 *
 * It also adds no dependency, which keeps §5.7 out of it, for the same reason
 * lib/pdf/ has no PDF library and the mailer has no SDK.
 *
 * Supported: `##`/`###` headings, paragraphs, `**bold**`, `*italic*`,
 * `` `code` ``, `- ` lists, `1. ` lists, `> ` quotes, `---` rules,
 * `[text](url)` links, `![alt](url)` images.
 */

import { createElement, type ReactNode } from 'react';

/** How deep inline marks may nest before we stop and treat the rest as text. */
const MAX_INLINE_DEPTH = 4;

// ── URLs ──────────────────────────────────────────────────────────────────

/**
 * Control characters are stripped before any scheme test. `java&#9;script:` is a
 * real payload: browsers ignore the tab, so a check against the raw string
 * would see something that is not `javascript:` and pass it through.
 */
function normalise(raw: string): string {
  return raw.replace(/[\u0000-\u0020\u007F]/g, '');
}

/**
 * Links may be http, https, or site-relative. Everything else — `javascript:`,
 * `data:`, `vbscript:`, and protocol-relative `//host` — becomes plain text.
 * Rejecting rather than escaping means the dangerous value never reaches an
 * `href` at all.
 */
export function safeHref(raw: string): string | null {
  const url = normalise(raw);
  if (!url) return null;
  if (url.startsWith('//')) return null;
  if (url.startsWith('/')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

/** A site-relative link is ours; anything else is somebody else's. */
export function isExternalHref(href: string): boolean {
  return !href.startsWith('/');
}

/**
 * Images must come from the public Supabase Storage bucket. Widening this to
 * accept any host would let any site's images render on Empiria's domain, and
 * would mean partners could hotlink — or track readers — from anywhere.
 *
 * Parsed with `URL` rather than matched with a regex so that
 * `https://supabase.co.evil.com/...` fails on the hostname, which a substring
 * test would wave through.
 */
export function isAllowedImageUrl(raw: string): boolean {
  const url = normalise(raw);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.hostname !== 'supabase.co' && !u.hostname.endsWith('.supabase.co')) return false;
  return u.pathname.startsWith('/storage/v1/object/public/');
}

/** How far a URL may run before we stop looking for its closing paren. */
const MAX_URL_LENGTH = 2048;

/**
 * The balanced `)` that closes a URL opened at `from`, or -1.
 *
 * Taking the first `)` instead truncates any real URL that contains brackets
 * — `..._(island)` is the common one — and leaves the surplus `)` sitting in
 * the prose. The scan is capped so that a body full of unclosed `[a](` cannot
 * turn this into a quadratic walk.
 */
function closingParen(src: string, from: number): number {
  let depth = 1;
  const limit = Math.min(src.length, from + MAX_URL_LENGTH);
  for (let i = from; i < limit; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── Inline ────────────────────────────────────────────────────────────────

/**
 * A scanner, not a regular expression.
 *
 * `[`.repeat(20000) makes a backtracking matcher like /\[([^\]]*)\]/ quadratic:
 * every `[` scans to the end looking for a `]` that is not there. Here a search
 * that comes back empty is remembered — if there is no `]` after position i,
 * there is none after any later position either — which keeps a hostile body
 * linear. lib/blogMarkdown.test.ts holds the timing case.
 */
function parseInline(src: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let key = 0;

  const exhausted = new Set<string>();
  const find = (needle: string, from: number): number => {
    if (exhausted.has(needle)) return -1;
    const at = src.indexOf(needle, from);
    if (at === -1) exhausted.add(needle);
    return at;
  };

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = '';
    }
  };
  const push = (node: ReactNode) => {
    flush();
    out.push(node);
  };
  /** Nested marks are parsed too, until the depth cap. */
  const inner = (text: string): ReactNode[] =>
    depth >= MAX_INLINE_DEPTH ? [text] : parseInline(text, depth + 1);

  while (i < src.length) {
    const c = src[i];

    // `code` — its content is never re-parsed, so `**b**` inside stays literal.
    if (c === '`') {
      const end = find('`', i + 1);
      if (end !== -1) {
        push(createElement('code', { key: key++ }, src.slice(i + 1, end)));
        i = end + 1;
        continue;
      }
    }

    // ![alt](url) — refused entirely if the host is not the storage bucket.
    if (c === '!' && src[i + 1] === '[') {
      const close = find(']', i + 2);
      if (close !== -1 && src[close + 1] === '(') {
        const paren = closingParen(src, close + 2);
        if (paren !== -1) {
          const alt = src.slice(i + 2, close);
          const url = src.slice(close + 2, paren);
          if (isAllowedImageUrl(url)) {
            push(
              createElement('img', {
                key: key++,
                src: normalise(url),
                alt,
                loading: 'lazy',
                className: 'my-6 h-auto w-full rounded-card',
              })
            );
            i = paren + 1;
            continue;
          }
          // Off-allowlist: the whole thing is text, not a broken image and not
          // a link to wherever they pointed it.
          buf += src.slice(i, paren + 1);
          i = paren + 1;
          continue;
        }
      }
    }

    // [text](url)
    if (c === '[') {
      const close = find(']', i + 1);
      if (close !== -1 && src[close + 1] === '(') {
        const paren = closingParen(src, close + 2);
        if (paren !== -1) {
          const text = src.slice(i + 1, close);
          const href = safeHref(src.slice(close + 2, paren));
          if (href) {
            const external = isExternalHref(href);
            push(
              createElement(
                'a',
                {
                  key: key++,
                  href,
                  className: 'ul text-ember',
                  ...(external
                    ? { rel: 'nofollow noopener noreferrer', target: '_blank' }
                    : {}),
                },
                ...inner(text)
              )
            );
          } else {
            // Refused: keep the words, drop the destination.
            push(createElement('span', { key: key++ }, ...inner(text)));
          }
          i = paren + 1;
          continue;
        }
      }
    }

    // **bold** before *italic*, so ** is never read as two emphases.
    if (c === '*' && src[i + 1] === '*') {
      const end = find('**', i + 2);
      if (end !== -1 && end > i + 2) {
        push(createElement('strong', { key: key++ }, ...inner(src.slice(i + 2, end))));
        i = end + 2;
        continue;
      }
    }

    if (c === '*') {
      const end = find('*', i + 1);
      if (end !== -1 && end > i + 1) {
        push(createElement('em', { key: key++ }, ...inner(src.slice(i + 1, end))));
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i++;
  }

  flush();
  return out;
}

// ── Blocks ────────────────────────────────────────────────────────────────

const RULE = /^ {0,3}-{3,}\s*$/;
const HEADING = /^ {0,3}(#{2,3})\s+(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^ {0,3}[-*]\s+(.*)$/;
const ORDERED = /^ {0,3}\d+\.\s+(.*)$/;

/**
 * Parse a post body into React elements.
 *
 * Blocks are split on blank lines, which is also what keeps one malformed
 * paragraph from swallowing the rest of a post: an unclosed `**` or `[` can
 * only ever affect its own block.
 */
export function renderBlogMarkdown(source: string): ReactNode[] {
  if (!source) return [];

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Rules are tested before bullets: `---` is a rule, `- x` is a list.
    if (RULE.test(line)) {
      out.push(createElement('hr', { key: key++, className: 'my-10 border-line' }));
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const tag = heading[1].length === 2 ? 'h2' : 'h3';
      out.push(createElement(tag, { key: key++ }, ...parseInline(heading[2].trim())));
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      out.push(
        createElement('blockquote', { key: key++ }, ...parseInline(body.join('\n')))
      );
      continue;
    }

    for (const [pattern, tag] of [
      [BULLET, 'ul'],
      [ORDERED, 'ol'],
    ] as const) {
      if (!pattern.test(line)) continue;
      const items: ReactNode[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(
          createElement('li', { key: items.length }, ...parseInline(pattern.exec(lines[i])![1]))
        );
        i++;
      }
      out.push(createElement(tag, { key: key++ }, ...items));
      break;
    }
    if (BULLET.test(line) || ORDERED.test(line)) continue;

    // Otherwise a paragraph, running until a blank line or the next block.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim() || RULE.test(l) || HEADING.test(l) || QUOTE.test(l) || BULLET.test(l) || ORDERED.test(l)) break;
      para.push(l);
      i++;
    }
    out.push(createElement('p', { key: key++ }, ...parseInline(para.join('\n'))));
  }

  return out;
}

/**
 * The body as plain text — for excerpts and meta descriptions. One definition
 * of "the short version of this", shared with lib/seo.ts rather than repeated.
 */
export function blogBodyToText(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}#{2,3}\s+/gm, '')
    .replace(/^ {0,3}> ?/gm, '')
    .replace(/^ {0,3}[-*]\s+/gm, '')
    .replace(/^ {0,3}\d+\.\s+/gm, '')
    .replace(/^ {0,3}-{3,}\s*$/gm, '')
    .replace(/\*\*|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
