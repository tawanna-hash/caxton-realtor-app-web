function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sparsePatch<T extends Record<string, unknown>>(
  current: T,
  initial: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => !valuesEqual(value, initial[key])),
  ) as Partial<T>;
}
