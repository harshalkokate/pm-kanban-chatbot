import "@testing-library/jest-dom";

// scrollIntoView is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = function () {};

// jsdom in this environment provides a broken localStorage (--localstorage-file warning).
// Replace it with a working in-memory implementation.
const store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  key: (index) => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
