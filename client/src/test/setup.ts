import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 26 exposes its own optional localStorage. Tests must use the browser's storage.
vi.stubGlobal('localStorage', window.localStorage);
vi.stubGlobal('sessionStorage', window.sessionStorage);
afterEach(cleanup);
