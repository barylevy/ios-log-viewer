import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LogViewerFilters from '../LogViewerFilters';
import { createDefaultFilters, type LogFilters } from '../domain/logRecord';

beforeEach(() => localStorage.clear());
afterEach(() => Reflect.deleteProperty(window, 'showOpenFilePicker'));

function controls(
  filters: LogFilters,
  onChange = vi.fn(),
  activeFileId = 'default',
  matches = { position: 0, total: 0 },
) {
  return (
    <LogViewerFilters
      filters={filters}
      onFiltersChange={onChange}
      logsCount={0}
      filteredLogsCount={0}
      searchMatchCount={matches.total}
      searchMatchPos={matches.position}
      pivotGap={null}
      stickyLogs={[]}
      onRemoveStickyLog={vi.fn()}
      onClearAllStickyLogs={vi.fn()}
      onScrollToLog={vi.fn()}
      onUpdateStickyLogTitle={vi.fn()}
      activeFileId={activeFileId}
    />
  );
}

it('reflects model preferences and sends one change for each user action', () => {
  const filters = createDefaultFilters();
  const onChange = vi.fn();
  const { rerender } = render(controls(filters, onChange));
  expect(onChange).not.toHaveBeenCalled();

  const filterInput = screen.getByPlaceholderText(/^Filter logs:/);
  const filterControls = within(filterInput.parentElement!);
  fireEvent.change(filterControls.getByRole('combobox'), { target: { value: 'regex' } });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ filterMode: 'regex' });

  rerender(controls({ ...filters, filterMode: 'regex', filterCaseSensitive: true }, onChange));
  expect(filterControls.getByRole('combobox')).toHaveValue('regex');
  expect(localStorage.getItem('logViewer_filterMode')).toBe('regex');
  fireEvent.click(filterControls.getByRole('button', { name: 'Filter case sensitive' }));
  expect(onChange).toHaveBeenLastCalledWith({ filterCaseSensitive: false });
  expect(onChange).toHaveBeenCalledTimes(2);
});

it('keeps separate histories, newest phrases first, without duplicates', () => {
  render(
    controls({
      ...createDefaultFilters(),
      searchText: 'error || warning && error',
      searchQuery: 'timeout || error',
    }),
  );
  fireEvent.keyDown(screen.getByPlaceholderText(/^Filter logs:/), { key: 'Enter' });
  fireEvent.blur(screen.getByPlaceholderText(/^Search in record logs/));
  expect(JSON.parse(localStorage.getItem('logViewer_filterHistory')!)).toEqual([
    'error',
    'warning',
  ]);
  expect(JSON.parse(localStorage.getItem('logViewer_searchHistory')!)).toEqual([
    'error',
    'timeout',
  ]);

  fireEvent.click(screen.getByTitle('Filter history'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Clear History' }));
  expect(localStorage.getItem('logViewer_filterHistory')).toBeNull();
  expect(localStorage.getItem('logViewer_searchHistory')).not.toBeNull();
});

it('imports a preset file, keeps names with their tabs, and updates entries without replacing IDs', async () => {
  const presets = [
    { id: 'errors', name: 'Errors', data: { searchText: 'error' } },
    { id: 'warnings', name: 'Warnings', data: { searchText: 'warning' } },
  ];
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, 'showOpenFilePicker', {
    configurable: true,
    value: vi.fn().mockResolvedValue([
      {
        name: 'filters.json',
        getFile: async () =>
          new File([JSON.stringify({ version: 2, filters: presets })], 'filters.json'),
        createWritable: async () => ({ write, close }),
      },
    ]),
  });
  const onChange = vi.fn();
  const filters = { ...createDefaultFilters(), searchText: 'error && timeout' };
  const { rerender } = render(controls(filters, onChange, 'a.log'));
  fireEvent.click(screen.getByRole('button', { name: 'Load file' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({ searchText: 'error' }));
  const presetSelect = screen.getByRole('option', { name: 'Errors' }).parentElement!;
  expect(presetSelect).toHaveValue('Errors');
  rerender(controls(filters, onChange, 'b.log'));
  expect(presetSelect).toHaveValue('');
  fireEvent.change(presetSelect, { target: { value: 'Warnings' } });
  rerender(controls(filters, onChange, 'a.log'));
  expect(presetSelect).toHaveValue('Errors');
  fireEvent.click(screen.getByRole('button', { name: 'Save "Errors"' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const saved = JSON.parse(write.mock.calls[0][0]);
  expect(saved.filters).toHaveLength(2);
  expect(saved.filters[0]).toMatchObject({
    id: 'errors',
    data: { searchText: 'error && timeout' },
  });
  expect(saved.filters[1]).toMatchObject(presets[1]);

  fireEvent.click(screen.getByRole('button', { name: 'Add to file…' }));
  fireEvent.change(screen.getByPlaceholderText('Filter preset name…'), {
    target: { value: 'Timeouts' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
  expect(
    JSON.parse(write.mock.calls[1][0]).filters.map((preset: { name: string }) => preset.name),
  ).toEqual(['Errors', 'Warnings', 'Timeouts']);
});

it('imports legacy JSON through the fallback input and saves the active preset locally', async () => {
  const onChange = vi.fn();
  const { container, rerender } = render(controls(createDefaultFilters(), onChange));
  fireEvent.click(screen.getByRole('button', { name: 'Load file' }));
  fireEvent.click(screen.getByRole('button', { name: 'Browse file…' }));
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(
          [JSON.stringify({ name: 'Legacy', filters: { searchText: 'timeout' } })],
          'legacy.json',
        ),
      ],
    },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({ searchText: 'timeout' }));
  rerender(controls({ ...createDefaultFilters(), searchText: 'timeout' }, onChange));
  fireEvent.click(await screen.findByRole('button', { name: 'Save "Legacy"' }));
  const saved = JSON.parse(localStorage.getItem('logViewer_savedFilters')!);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'Legacy', data: { searchText: 'timeout' } });
});

it('keeps level toggles, module selection, and context controls connected to the model', () => {
  const onChange = vi.fn();
  const filters = { ...createDefaultFilters(), contextLines: 3 };
  const { rerender } = render(controls(filters, onChange));
  fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'all' } });
  expect(onChange).toHaveBeenLastCalledWith({ selectedModule: 'all' });
  fireEvent.change(screen.getByLabelText('Context'), { target: { value: '5' } });
  expect(onChange).toHaveBeenLastCalledWith({ contextLines: 5 });
  fireEvent.click(screen.getByRole('button', { name: 'Log levels' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Error' }));
  expect(onChange).toHaveBeenLastCalledWith({ logLevel: ['error'] });
  rerender(controls({ ...filters, logLevel: ['error'] }, onChange));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Error' }));
  expect(onChange).toHaveBeenLastCalledWith({ logLevel: ['all'], contextLines: 0 });
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('retains the filter shortcut and dispatches search navigation at the correct boundaries', () => {
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  const filters = { ...createDefaultFilters(), searchQuery: 'error' };
  const { rerender } = render(controls(filters, vi.fn(), 'default', { position: 1, total: 2 }));
  fireEvent.keyDown(document, { key: 'f', metaKey: true });
  expect(screen.getByRole('textbox', { name: 'Filter' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'nextSearchMatch' }));
  rerender(controls(filters, vi.fn(), 'default', { position: 2, total: 2 }));
  expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'prevSearchMatch' }));
});

it('deletes a saved preset without applying it and can apply the remaining preset', async () => {
  localStorage.setItem(
    'logViewer_savedFilters',
    JSON.stringify([
      { id: 'errors', name: 'Errors', data: { searchText: 'error' } },
      { id: 'warnings', name: 'Warnings', data: { searchText: 'warning' } },
    ]),
  );
  const onChange = vi.fn();
  render(controls(createDefaultFilters(), onChange));
  fireEvent.click(screen.getByRole('button', { name: 'Load file' }));
  const dialog = screen.getByRole('dialog', { name: /load filters/i });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Errors' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    JSON.parse(localStorage.getItem('logViewer_savedFilters')!).map(
      (entry: { name: string }) => entry.name,
    ),
  ).toEqual(['Warnings']);
  fireEvent.click(within(dialog).getByRole('button', { name: /^Warnings/ }));
  expect(onChange).toHaveBeenCalledWith({ searchText: 'warning' });
  await screen.findByRole('button', { name: 'Save "Warnings"' });
});
