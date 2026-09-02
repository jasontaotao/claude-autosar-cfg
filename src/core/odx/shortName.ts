export function legalizeShortName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_');
  const fallbackName = fallback.replace(/^[^A-Za-z0-9]+/, '');
  const base = cleaned || `Unnamed_${fallbackName}`;
  const prefixed = /^[0-9]/.test(base) ? `N_${base}` : base;
  return prefixed.slice(0, 128);
}

export function dedupeShortName(base: string, taken: ReadonlySet<string>): string {
  const legalized = legalizeShortName(base, base);
  if (!taken.has(legalized)) return legalized;

  let suffix = 1;
  let candidate = legalized;
  do {
    suffix += 1;
    candidate = `${legalized.slice(0, 124)}_${suffix}`;
  } while (taken.has(candidate));
  return candidate;
}
