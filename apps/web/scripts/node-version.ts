const TARGET_NODE_VERSION = '22.12.0';

export function patchNodeVersion() {
  const descriptor = { value: TARGET_NODE_VERSION, configurable: true, enumerable: true } as const;
  Object.defineProperty(process.versions, 'node', descriptor);
  Object.defineProperty(process, 'version', {
    value: `v${TARGET_NODE_VERSION}`,
    configurable: true,
    enumerable: true
  });
}
