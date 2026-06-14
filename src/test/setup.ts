// Vitest setup: load jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.)
// and auto-unmount React components between tests to prevent DOM accumulation.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
