import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import LogViewerFilters from '../LogViewerFilters';
import { createDefaultFilters, type LogFilters } from '../domain/logRecord';

beforeEach(() => localStorage.clear());

function controls(filters: LogFilters, onChange = vi.fn()) {
  return (
    <LogViewerFilters
      filters={filters}
      onFiltersChange={onChange}
      logsCount={0}
      filteredLogsCount={0}
      searchMatchCount={0}
      searchMatchPos={0}
      pivotGap={null}
      stickyLogs={[]}
      onRemoveStickyLog={vi.fn()}
      onClearAllStickyLogs={vi.fn()}
      onScrollToLog={vi.fn()}
      onUpdateStickyLogTitle={vi.fn()}
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
  fireEvent.click(filterControls.getByRole('button', { name: 'Aa' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Clear History' }));
  expect(localStorage.getItem('logViewer_filterHistory')).toBeNull();
  expect(localStorage.getItem('logViewer_searchHistory')).not.toBeNull();
});
