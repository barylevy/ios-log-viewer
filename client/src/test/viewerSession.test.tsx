import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { parseLogContent } from '../LogParser';
import type { LogRecord } from '../domain/logRecord';
import { clearSession, saveSession } from '../utils/sessionStorage';

vi.mock('react-virtuoso', () => ({
  Virtuoso: forwardRef<
    { scrollToIndex: () => void },
    { data: LogRecord[]; itemContent: (index: number, log: LogRecord) => ReactNode }
  >(({ data, itemContent }, ref) => {
    useImperativeHandle(ref, () => ({ scrollToIndex() {} }));
    return (
      <div>
        {data.map((log, index) => (
          <div key={log.id}>{itemContent(index, log)}</div>
        ))}
      </div>
    );
  }),
}));

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await clearSession(true);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

it('restores the selected tab without the initial alphabetical selection overriding it', async () => {
  const makeLogs = (message: string) =>
    parseLogContent(`2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] ${message}`);
  await saveSession({
    files: [
      { id: 'a', name: 'a.log' },
      { id: 'b', name: 'b.log' },
    ],
    activeFileIndex: 1,
    showingCombinedView: false,
    allFileLogs: { a: makeLogs('first-tab-record'), b: makeLogs('restored-tab-record') },
  });
  render(<App />);
  await waitFor(() => expect(screen.getByText('restored-tab-record')).toBeInTheDocument());
  expect(screen.queryByText('first-tab-record')).not.toBeInTheDocument();
});
