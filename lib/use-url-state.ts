// lib/use-url-state.ts
//
// useUrlState — like useState but mirrors the value into a URL query parameter
// so a full page refresh (F5, pull-to-refresh on iOS, native app cold start)
// restores the same value.
//
// Design notes
// - Uses next/navigation useSearchParams + useRouter.replace with
//   { scroll: false } so URL changes don't add history entries or scroll to
//   top.
// - Serialization is caller-controlled via parse/stringify so any JSON-serialisable
//   value works. Default handles strings and numbers.
// - Setter is stable across renders (uses refs for latest reader/router).
// - Empty string / undefined values remove the key from the URL to keep it clean.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UrlStateOptions<T> = {
  parse?: (raw: string | null) => T;
  stringify?: (value: T) => string | null;
  /** When true, ?key=value is added to history stack. Default false = router.replace. */
  push?: boolean;
};

export function useUrlState<T>(
  key: string,
  defaultValue: T,
  options: UrlStateOptions<T> = {},
): [T, (next: T | ((prev: T) => T)) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const parse = options.parse ?? ((raw: string | null) => (raw == null ? defaultValue : (raw as unknown as T)));
  const stringify = options.stringify ?? ((v: T) => (v == null || v === '' ? null : String(v)));

  // Hydrate from URL on mount. Server-rendered HTML always has the query
  // params too so this is safe on the first render.
  const initial = parse(searchParams.get(key));
  const [value, setValue] = useState<T>(initial);

  // Keep a ref to the latest search params so the setter stays stable.
  const spRef = useRef(searchParams);
  const routerRef = useRef(router);
  const pathRef = useRef(pathname);
  useEffect(() => { spRef.current = searchParams; }, [searchParams]);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  // If the URL changes externally (e.g. Back button, direct history.replace),
  // sync local state. This is a legitimate "external system → React" sync
  // (the URL is the external source of truth) so the setState-in-effect
  // is intentional; the identity check keeps it from causing cascades.
  useEffect(() => {
    const fromUrl = parse(searchParams.get(key));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue((prev) => (Object.is(prev, fromUrl) ? prev : fromUrl));
    // parse identity is intentionally not a dep — recreated per render but
    // we only care when the URL string changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, key]);

  const setter = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          const encoded = stringify(resolved);
          const params = new URLSearchParams(spRef.current?.toString() ?? '');
          if (encoded == null) {
            params.delete(key);
          } else {
            params.set(key, encoded);
          }
          const qs = params.toString();
          const url = qs ? `${pathRef.current}?${qs}` : (pathRef.current || '/');
          if (options.push) {
            routerRef.current.push(url, { scroll: false });
          } else {
            routerRef.current.replace(url, { scroll: false });
          }
        } catch {
          // If router isn't ready (SSR-mismatch races), state still updates locally.
        }
        return resolved;
      });
    },
    // key, stringify shape, and push toggle are the only inputs that should
    // rebuild the setter. Reader/router come from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, options.push],
  );

  return [value, setter];
}

/** Helper: number-typed URL state. */
export function useUrlNumber(key: string, defaultValue: number): [number, (n: number | ((p: number) => number)) => void] {
  return useUrlState<number>(key, defaultValue, {
    parse: (raw) => {
      if (raw == null || raw === '') return defaultValue;
      const n = Number(raw);
      return Number.isFinite(n) ? n : defaultValue;
    },
    stringify: (v) => (v === defaultValue ? null : String(v)),
  });
}

/** Helper: string-typed URL state where the default value is stripped from URL. */
export function useUrlString<T extends string>(key: string, defaultValue: T): [T, (v: T | ((p: T) => T)) => void] {
  return useUrlState<T>(key, defaultValue, {
    parse: (raw) => (raw == null ? defaultValue : (raw as T)),
    stringify: (v) => (v === defaultValue ? null : String(v)),
  });
}
