import { arrangeDestinations, countryChoice, type DestinationRaw } from './destinations';
import { COUNTRIES, isCountryCode } from '../countries';

/**
 * The destination's country code (0036): what the select accepts, and which
 * coded place covers a place with no code of its own.
 *
 *   bun run lib/admin/destinations.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// ── what the select accepts ─────────────────────────────────────────────────
eq('none is allowed on a destination', countryChoice('', true), { ok: true, code: null });
eq('…and refused where a country is required', countryChoice('', false), { ok: false });
eq('a code on the list', countryChoice('GR', true), { ok: true, code: 'GR' });
eq('surrounding space is trimmed', countryChoice(' GR ', false), { ok: true, code: 'GR' });
eq('lower case is refused — the select sends upper case', countryChoice('gr', true), { ok: false });
eq('the right shape but not on the list is refused', countryChoice('XX', true), { ok: false });
eq('three letters are refused', countryChoice('GRC', true), { ok: false });
eq('every code on the mirrored list is accepted', COUNTRIES.every((c) => countryChoice(c.code, false).ok), true);
eq('isCountryCode, from the mirror: Canada', isCountryCode('CA'), true);
eq('isCountryCode refuses a user-assigned code', isCountryCode('ZZ'), false);
eq('isCountryCode refuses what is not a string', [isCountryCode(null), isCountryCode(undefined), isCountryCode(42)], [false, false, false]);

// ── which coded place covers a place ────────────────────────────────────────
const d = (id: string, parent: string | null, path: string, code: string | null = null, sort = 0): DestinationRaw => ({
  id, parent_id: parent, slug: path.split('/').pop() ?? path, name: id, path, description: null, hero_image: null,
  meta_title: null, meta_description: null, status: 'published', sort_order: sort, updated_at: '2026-09-27T00:00:00Z',
  country_code: code,
});
const tree = arrangeDestinations(
  [
    d('Greece', null, 'greece', 'GR', 1),
    d('Cyclades', 'Greece', 'greece/cyclades'),
    d('Santorini', 'Cyclades', 'greece/cyclades/santorini'),
    d('Europe', null, 'europe', null, 2),
    d('Italy', 'Europe', 'europe/italy', 'IT'),
    d('Sicily', 'Italy', 'europe/italy/sicily'),
    d('Region', null, 'hx036-r', 'GR', 3),
    d('Region 2', null, 'hx036-r2', null, 4),
  ],
  new Map([['Santorini', 2]])
);
const row = (id: string) => tree.find((r) => r.id === id);
eq('tree order: each place followed by what is inside it', tree.map((r) => r.id), ['Greece', 'Cyclades', 'Santorini', 'Europe', 'Italy', 'Sicily', 'Region', 'Region 2']);
eq('depth and tour count carry through', [row('Santorini')?.depth, row('Santorini')?.packageCount, row('Cyclades')?.childCount], [2, 2, 1]);
eq('a coded country is covered by nothing above it', [row('Greece')?.countryCode, row('Greece')?.coveredBy], ['GR', null]);
eq('a region inherits the country', row('Cyclades')?.coveredBy, { code: 'GR', name: 'Greece' });
eq('…and so does a place two levels down', row('Santorini')?.coveredBy, { code: 'GR', name: 'Greece' });
eq('an uncoded continent is covered by nothing', row('Europe')?.coveredBy, null);
eq('a country inside it carries its own code', [row('Italy')?.countryCode, row('Italy')?.coveredBy], ['IT', null]);
eq('the nearest code wins below it', row('Sicily')?.coveredBy, { code: 'IT', name: 'Italy' });
eq('a sibling whose address starts the same inherits nothing', row('Region 2')?.coveredBy, null);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
