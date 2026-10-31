import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { parseLogContent } from '../LogParser';
import type { LogRecord } from '../domain/logRecord';
import { clearSession, saveSession } from '../utils/sessionStorage';
import { createDefaultFilters } from '../domain/logRecord';

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

it('uses the clicked record for menu actions even when line numbers repeat', async () => {
  const [record] = parseLogContent('2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] first-record');
  await saveSession({
    files: [{ id: 'a', name: 'a.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: { a: [record, { ...record, id: 'second', message: 'second-record' }] },
  });
  render(<App />);
  const second = await screen.findByText('second-record');
  fireEvent.contextMenu(second);
  expect(screen.getByRole('button', { name: 'Clear Pivot Time' })).toBeDisabled();

  const menu = screen.getByLabelText('Log actions');
  const measure = vi
    .spyOn(menu, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 220, 240));
  fireEvent.contextMenu(second, { clientX: window.innerWidth, clientY: window.innerHeight });
  expect(menu).toHaveStyle({
    left: `${window.innerWidth - 230}px`,
    top: `${window.innerHeight - 240}px`,
  });
  measure.mockRestore();

  fireEvent.click(screen.getByRole('button', { name: 'Set Pivot Time' }));
  expect(second.closest('[data-log-id]')?.firstElementChild).toHaveClass('ring-orange-400');
  expect(
    screen.getByText('first-record').closest('[data-log-id]')?.firstElementChild,
  ).not.toHaveClass('ring-orange-400');
  expect(screen.queryByLabelText('Log actions')).not.toBeInTheDocument();

  fireEvent.contextMenu(second);
  fireEvent.click(screen.getByText('first-record'));
  expect(screen.queryByLabelText('Log actions')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Log details' })).not.toBeInTheDocument();
});

it('persists collapsed columns across remounts and restores their default width', async () => {
  localStorage.setItem('logViewerColumnSizing', JSON.stringify({ timestamp: 120 }));
  await saveSession({
    files: [{ id: 'a', name: 'a.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: {
      a: parseLogContent('2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] column-record'),
    },
  });
  const first = render(<App />);
  await screen.findByText('column-record');
  const column = first.container.querySelector('[data-col-id="timestamp"]')!;
  expect(column).toHaveStyle({ width: '120px' });
  fireEvent.doubleClick(column.querySelector('[role="separator"]')!);
  expect(JSON.parse(localStorage.getItem('logViewerCollapsedColumns')!)).toContain('timestamp');
  first.unmount();

  const second = render(<App />);
  await screen.findByText('column-record');
  const restored = second.container.querySelector('[data-col-id="timestamp"]')!;
  expect(restored).toHaveStyle({ paddingRight: '0px' });
  fireEvent.doubleClick(restored.querySelector('[role="separator"]')!);
  expect(restored).toHaveStyle({ width: '90px' });
  expect(JSON.parse(localStorage.getItem('logViewerColumnSizing')!)).not.toHaveProperty(
    'timestamp',
  );
  expect(JSON.parse(localStorage.getItem('logViewerCollapsedColumns')!)).not.toContain('timestamp');
});

it('navigates modal records in filtered order and stops at both ends', async () => {
  localStorage.setItem(
    'logViewerFilters',
    JSON.stringify({
      a: { ...createDefaultFilters(), searchText: 'first || third' },
    }),
  );
  await saveSession({
    files: [{ id: 'a', name: 'a.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: {
      a: parseLogContent(
        ['first', 'second', 'third']
          .map(
            (message, index) =>
              `2026-10-31 12:00:0${index}:000 [Main:1] [D] [t:1] [p:2] ${message}`,
          )
          .join('\n'),
      ),
    },
  });
  render(<App />);
  fireEvent.click(await screen.findByText('first'));
  expect(screen.getByTitle('Previous log (←)')).toBeDisabled();
  fireEvent.click(screen.getByTitle('Next log (→)'));
  expect(screen.getByTitle('Next log (→)')).toBeDisabled();
  expect(screen.getByRole('dialog', { name: 'Log details' })).toHaveTextContent('third');
  fireEvent.keyDown(document, { key: 'ArrowLeft' });
  expect(screen.getByRole('dialog', { name: 'Log details' })).toHaveTextContent('first');
  expect(screen.getByTitle('Previous log (←)')).toBeDisabled();
});
