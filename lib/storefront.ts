/**
 * Where the public storefront lives.
 *
 * The console links to it (a tour's public page, the slug hint on the new-tour
 * form) and previews images that are stored as root-relative paths on it (the
 * landing page's placeholder postcards). Configurable because the two apps
 * are deployed separately; the default is the production domain.
 *
 * The fallback matters more than it looks: unset, every storefront link and
 * every root-relative image preview in the console points at whatever this
 * says. It was empiriatours.com — a domain Empiria does not own.
 */
export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_TOUR_URL || 'https://empiria.tours').replace(/\/$/, '');
export const STOREFRONT_HOST = new URL(STOREFRONT_URL).host;
