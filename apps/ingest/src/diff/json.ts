export type DiffRule = string | RegExp;

export type JsonDiffKind = 'added' | 'removed' | 'changed';

export type JsonDiffChange = {
  path: string;
  kind: JsonDiffKind;
  before?: unknown;
  after?: unknown;
  critical: boolean;
};

export type DiffOptions = {
  ignore?: DiffRule[];
  critical?: DiffRule[];
};

export type DiffSummary = {
  totalChanges: number;
  criticalChanges: number;
  changedPaths: string[];
  criticalPaths: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeRule = (rule: DiffRule): DiffRule => {
  if (typeof rule === 'string') {
    return rule.trim();
  }
  return rule;
};

const pathMatches = (path: string, rule: DiffRule): boolean => {
  if (typeof rule === 'string') {
    if (!rule) return false;
    const normalizedPath = path.replace(/\.(\d+)/g, '.$1');
    const wildcardPath = normalizedPath.replace(/\.\d+/g, '.*');
    if (rule.endsWith('.*')) {
      const prefix = rule.slice(0, -2);
      return (
        normalizedPath === prefix ||
        normalizedPath.startsWith(`${prefix}.`) ||
        wildcardPath.startsWith(`${prefix}.`)
      );
    }
    if (rule.includes('*')) {
      const ruleTokens = rule.split('.');
      const pathTokens = normalizedPath.split('.');
      if (ruleTokens.length !== pathTokens.length) return false;
      return ruleTokens.every((token, idx) => token === '*' || token === pathTokens[idx]);
    }
    return normalizedPath === rule;
  }
  return rule.test(path);
};

const shouldIgnorePath = (path: string, options: DiffOptions): boolean => {
  const rules = options.ignore ?? [];
  return rules.some((rule) => pathMatches(path, normalizeRule(rule)));
};

const isCriticalPath = (path: string, options: DiffOptions): boolean => {
  const rules = options.critical ?? [];
  if (rules.length === 0) return false;
  return rules.some((rule) => pathMatches(path, normalizeRule(rule)));
};

const collectObjectDiff = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string,
  options: DiffOptions,
  changes: JsonDiffChange[]
) => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    const left = before[key];
    const right = after[key];
    collectDiffInternal(left, right, nextPath, options, changes);
  }
};

const collectArrayDiff = (
  before: unknown[] | undefined,
  after: unknown[] | undefined,
  path: string,
  options: DiffOptions,
  changes: JsonDiffChange[]
) => {
  const left = before ?? [];
  const right = after ?? [];
  const sameLength = left.length === right.length;
  const equal = sameLength && left.every((value, idx) => deepEqual(value, right[idx]));
  if (equal) {
    return;
  }
  const critical = isCriticalPath(path, options);
  changes.push({
    path,
    kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
    before: before === undefined ? undefined : left,
    after: after === undefined ? undefined : right,
    critical
  });
};

const collectDiffInternal = (
  before: unknown,
  after: unknown,
  path: string,
  options: DiffOptions,
  changes: JsonDiffChange[]
) => {
  if (shouldIgnorePath(path, options)) {
    return;
  }
  if (before === undefined && after === undefined) {
    return;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    collectArrayDiff(
      Array.isArray(before) ? before : undefined,
      Array.isArray(after) ? after : undefined,
      path,
      options,
      changes
    );
    return;
  }
  if (isObject(before) && isObject(after)) {
    collectObjectDiff(before, after, path, options, changes);
    return;
  }
  if (before === undefined) {
    const critical = isCriticalPath(path, options);
    changes.push({ path, kind: 'added', after, critical });
    return;
  }
  if (after === undefined) {
    const critical = isCriticalPath(path, options);
    changes.push({ path, kind: 'removed', before, critical });
    return;
  }
  if (!deepEqual(before, after)) {
    const critical = isCriticalPath(path, options);
    changes.push({ path, kind: 'changed', before, after, critical });
  }
};

export const diffJson = (before: unknown, after: unknown, options: DiffOptions = {}): JsonDiffChange[] => {
  const changes: JsonDiffChange[] = [];
  const left = before ?? {};
  const right = after ?? {};
  collectDiffInternal(left, right, '', options, changes);
  return changes.sort((a, b) => a.path.localeCompare(b.path));
};

export const summarizeDiff = (changes: JsonDiffChange[]): DiffSummary => {
  const changedPaths = new Set<string>();
  const criticalPaths = new Set<string>();
  let total = 0;
  let critical = 0;
  for (const change of changes) {
    const topLevel = change.path.split('.')[0] ?? change.path;
    if (topLevel) {
      changedPaths.add(topLevel);
      if (change.critical) {
        criticalPaths.add(topLevel);
      }
    }
    total += 1;
    if (change.critical) {
      critical += 1;
    }
  }
  return {
    totalChanges: total,
    criticalChanges: critical,
    changedPaths: Array.from(changedPaths).sort(),
    criticalPaths: Array.from(criticalPaths).sort()
  };
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
};
