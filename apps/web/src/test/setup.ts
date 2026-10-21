import '@testing-library/jest-dom/vitest';

window.scrollTo = () => undefined;
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
