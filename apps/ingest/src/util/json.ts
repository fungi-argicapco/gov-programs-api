function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(source).sort();
    for (const key of keys) {
      normalized[key] = normalize(source[key]);
    }
    return normalized;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}
