'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * True once React has hydrated, false during the server render and the
 * hydration pass itself. The storefront's lib/hydrated.ts, copied.
 *
 * For text only a browser can produce faithfully — chiefly a timestamp in the
 * viewer's own zone. The server renders in its zone (UTC on Vercel) and with
 * its own ICU (Bun's prints "PM" where Chrome prints "p.m."), so formatting a
 * date during render gives two different strings and React 19 throws the
 * server's tree away. `useSyncExternalStore` answers false for the server and
 * the hydration pass, then true, with no effect and no extra render of its own.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
