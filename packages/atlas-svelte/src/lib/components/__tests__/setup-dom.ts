import { Window } from 'happy-dom';

const windowInstance = new Window();
const globalAny = globalThis as any;

globalAny.window = windowInstance;
globalAny.document = windowInstance.document;
globalAny.navigator = windowInstance.navigator;
globalAny.HTMLElement = windowInstance.HTMLElement;
globalAny.CustomEvent = windowInstance.CustomEvent;
globalAny.Event = windowInstance.Event;
globalAny.Node = windowInstance.Node;
globalAny.MutationObserver = windowInstance.MutationObserver;

globalAny.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(Date.now()), 16);
};

globalAny.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
