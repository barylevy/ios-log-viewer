import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { parseLogContent } from '../LogParser';
import type { LogRecord } from '../domain/logRecord';
import { clearSession, saveSession } from '../utils/sessionStorage';
import { createDefaultFilters } from '../domain/logRecord';

const scrollToIndex = vi.hoisted(() => vi.fn());

vi.mock('react-virtuoso', () => ({
  Virtuoso: forwardRef<
    { scrollToIndex: () => void },
    { data: LogRecord[]; itemContent: (index: number, log: LogRecord) => ReactNode }
  >(({ data, itemContent }, ref) => {
    useImperativeHandle(ref, () => ({ scrollToIndex }));
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
  scrollToIndex.mockClear();
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

it('restores the combined view and returns to the remaining source when a tab closes', async () => {
  const logs = (message: string) =>
    parseLogContent(`2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] ${message}`);
  await saveSession({
    files: [
      { id: 'a.log', name: 'a.log' },
      { id: 'b.log', name: 'b.log' },
    ],
    activeFileIndex: 1,
    showingCombinedView: true,
    allFileLogs: { 'a.log': logs('combined-first'), 'b.log': logs('combined-second') },
  });
  render(<App />);
  await screen.findByText('combined-first');
  expect(screen.getByText('combined-second')).toBeInTheDocument();
  fireEvent.click(within(screen.getByTitle('a.log')).getByTitle('Close file'));
  expect(screen.queryByText('combined-first')).not.toBeInTheDocument();
  expect(screen.getByText('combined-second')).toBeInTheDocument();
  expect(screen.queryByText('All Files')).not.toBeInTheDocument();
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
  expect(screen.getByRole('menuitem', { name: 'Clear Pivot Time' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Set Pivot Time' }));
  expect(second.closest('[data-log-id]')?.firstElementChild).toHaveClass('ring-orange-400');
  expect(
    screen.getByText('first-record').closest('[data-log-id]')?.firstElementChild,
  ).not.toHaveClass('ring-orange-400');
  await waitFor(() => expect(screen.queryByLabelText('Log actions')).not.toBeInTheDocument());

  fireEvent.contextMenu(second);
  fireEvent.keyDown(screen.getByRole('menu', { name: 'Log actions' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByLabelText('Log actions')).not.toBeInTheDocument());
  expect(screen.queryByRole('dialog', { name: 'Log details' })).not.toBeInTheDocument();
  fireEvent.contextMenu(second);
  fireEvent.click(document.querySelector('.MuiMenu-root .MuiBackdrop-root')!);
  await waitFor(() => expect(screen.queryByLabelText('Log actions')).not.toBeInTheDocument());
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

it('updates header metadata and time range with the active tab and clears them on close', async () => {
  const first = parseLogContent('2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] header-record');
  const second = parseLogContent('2026-10-31 15:00:00:000 [Main:1] [D] [t:1] [p:2] plain-record');
  await saveSession({
    files: [
      { id: 'a.log', name: 'a.log' },
      { id: 'b.log', name: 'b.log' },
    ],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: { 'a.log': first, 'b.log': second },
    logFileHeaders: { 'a.log': { user: 'source-user' } },
  });
  render(<App />);
  await screen.findByText('header-record');
  expect(screen.getByText('source-user')).toBeInTheDocument();
  expect(
    screen.getByText('31-Oct-2026 12:00:00.000 → 31-Oct-2026 12:00:00.000'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'b.log' }));
  expect(screen.queryByText('source-user')).not.toBeInTheDocument();
  expect(
    screen.getByText('31-Oct-2026 15:00:00.000 → 31-Oct-2026 15:00:00.000'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Close all files'));
  expect(screen.queryByText(/31-Oct-2026.*→/)).not.toBeInTheDocument();
});

it('applies column visibility changes and resets to the shared defaults', async () => {
  await saveSession({
    files: [{ id: 'a', name: 'a.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: {
      a: parseLogContent('2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] settings-record'),
    },
  });
  const { container } = render(<App />);
  await screen.findByText('settings-record');
  expect(container.querySelector('[data-col-id="module"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Column Settings' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Module' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(container.querySelector('[data-col-id="module"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Column Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(container.querySelector('[data-col-id="module"]')).toBeNull();
});

it('opens numbered files together under the same group name', async () => {
  const { container } = render(<App />);
  const input = container.querySelector('input[type="file"]:not([webkitdirectory])')!;
  fireEvent.change(input, {
    target: {
      files: [1, 2].map(
        (index) =>
          new File(
            [`2026-10-31 12:00:0${index}:000 [Main:1] [D] [t:1] [p:2] opened-record-${index}`],
            `client.${index}.log`,
          ),
      ),
    },
  });
  await screen.findByText('opened-record-1');
  expect(screen.getByText('opened-record-2')).toBeInTheDocument();
  expect(screen.getByText('client (2)')).toBeInTheDocument();
});

it('validates source line numbers, navigates to the nearest visible record, and resets on reopen', async () => {
  const logs = parseLogContent(
    [
      '2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] earlier-record',
      '2026-10-31 12:00:01:000 [Main:1] [D] [t:1] [p:2] later-record',
    ].join('\n'),
  );
  logs[0].lineNumber = 10;
  logs[1].lineNumber = 30;
  await saveSession({
    files: [{ id: 'a', name: 'a.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: { a: logs },
  });
  render(<App />);
  await screen.findByText('later-record');
  fireEvent.keyDown(document, { key: 'l', ctrlKey: true });
  const dialog = screen.getByRole('dialog', { name: 'Go to Line' });
  const input = within(dialog).getByRole('spinbutton');
  expect(input).toHaveAttribute('max', '30');
  fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
  expect(input).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(input, { target: { value: '31' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(dialog).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(input, { target: { value: '29' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'center', behavior: 'auto' });
  expect(screen.queryByRole('dialog', { name: 'Go to Line' })).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'l', ctrlKey: true });
  const reopened = within(screen.getByRole('dialog', { name: 'Go to Line' })).getByRole(
    'spinbutton',
  );
  expect(reopened).toHaveValue(null);
  expect(reopened).toHaveAttribute('aria-invalid', 'false');
  fireEvent.keyDown(reopened, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Go to Line' })).not.toBeInTheDocument();
});

it('keeps Space on a focused tab from opening a hovered record', async () => {
  await saveSession({
    files: [{ id: 'keyboard.log', name: 'keyboard.log' }],
    activeFileIndex: 0,
    showingCombinedView: false,
    allFileLogs: {
      'keyboard.log': parseLogContent(
        '2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] keyboard-record',
      ),
    },
  });
  render(<App />);
  const record = await screen.findByText('keyboard-record');
  fireEvent.mouseEnter(record.closest('[data-log-id]')!.firstElementChild!);
  const tab = screen.getByRole('tab', { name: 'keyboard.log' });
  tab.focus();
  fireEvent.keyDown(tab, { key: ' ' });
  expect(screen.queryByRole('dialog', { name: 'Log details' })).not.toBeInTheDocument();
});
