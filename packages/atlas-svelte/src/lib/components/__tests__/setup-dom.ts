import { Window } from 'happy-dom';

const globalAny = globalThis as any;

function ensureWindowInstance() {
  if (globalAny.window) {
    return globalAny.window as Window;
  }

  const instance = new Window();
  globalAny.window = instance;
  globalAny.document = instance.document;
  globalAny.navigator = instance.navigator;
  globalAny.HTMLElement = instance.HTMLElement;
  globalAny.CustomEvent = instance.CustomEvent;
  globalAny.Event = instance.Event;
  globalAny.Node = instance.Node;
  globalAny.MutationObserver = instance.MutationObserver;
  return instance;
}

const windowInstance = ensureWindowInstance();

if (!globalAny.document) globalAny.document = windowInstance.document;
if (!globalAny.navigator) globalAny.navigator = windowInstance.navigator;
if (!globalAny.HTMLElement) globalAny.HTMLElement = windowInstance.HTMLElement;
if (!globalAny.CustomEvent) globalAny.CustomEvent = windowInstance.CustomEvent;
if (!globalAny.Event) globalAny.Event = windowInstance.Event;
if (!globalAny.Node) globalAny.Node = windowInstance.Node;
if (!globalAny.MutationObserver) globalAny.MutationObserver = windowInstance.MutationObserver;

if (!globalAny.requestAnimationFrame) {
  globalAny.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(() => callback(Date.now()), 16);
  };
}

if (!globalAny.cancelAnimationFrame) {
  globalAny.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}
