import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useLogsModel from '../useLogsModel';
import { parseLogContent } from '../LogParser';
import { combineLogs } from '../domain/combineLogs';
import { loadLogFile, type LoadedLogFile } from '../utils/fileLoader';

vi.mock('../utils/fileLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/fileLoader')>()),
  loadLogFile: vi.fn(),
}));
const logs = () => parseLogContent('2026-10-31 12:00:00.000 [Main:1] [D] [t:1] [p:2] message');
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadLogFile).mockReset();
});

describe('typed viewer state transitions', () => {
  it('keeps global matching preferences when switching to a new tab', () => {
    localStorage.setItem('logViewer_filterMode', 'regex');
    localStorage.setItem('logViewer_filterCaseSensitive', 'true');
    const { result } = renderHook(useLogsModel);
    act(() => result.current.switchToFile('new'));
    expect(result.current.filters.filterMode).toBe('regex');
    expect(result.current.filters.filterCaseSensitive).toBe(true);
  });
  it('restores each file filter while keeping current matching preferences', () => {
    const { result } = renderHook(useLogsModel);
    act(() => result.current.switchToFile('a'));
    act(() => result.current.updateFilters({ searchText: 'error', filterMode: 'regex' }));
    act(() => result.current.switchToFile('b'));
    act(() => result.current.updateFilters({ searchText: 'warning' }));
    act(() => result.current.switchToFile('a'));
    expect(result.current.filters.searchText).toBe('error');
    expect(result.current.filters.filterMode).toBe('regex');
  });
  it('refreshes the active list from its single source of data', () => {
    const { result } = renderHook(useLogsModel);
    act(() => result.current.setLogsForFile('a', logs()));
    act(() => result.current.setSelectedLog(result.current.logs[0]));
    act(() =>
      result.current.updateLogsBackground('a', [{ ...result.current.logs[0], message: 'updated' }]),
    );
    expect(result.current.selectedLog?.message).toBe('updated');
  });
  it('can add and remove a bookmark from the combined view', () => {
    const { result } = renderHook(useLogsModel);
    act(() => result.current.setLogsForFile('a', logs()));
    act(() =>
      result.current.setLogsForFile('Combined Files', combineLogs([{ id: 'a', logs: logs() }])),
    );
    act(() => result.current.addStickyLog(result.current.logs[0]));
    expect(result.current.stickyLogs).toHaveLength(1);
    act(() => result.current.removeStickyLog(result.current.stickyLogs[0].id));
    expect(result.current.stickyLogs).toHaveLength(0);
  });
  it('does not resurrect an in-flight file after reset', async () => {
    let resolveLoad!: (value: LoadedLogFile) => void;
    vi.mocked(loadLogFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { result } = renderHook(useLogsModel);
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadLogs(new File(['test'], 'a.log'));
    });
    act(() => result.current.resetModel());
    await act(async () => {
      resolveLoad({ fileId: 'a.log', logs: logs(), headerData: {} });
      await loading;
    });
    expect(result.current.allFileLogs).toEqual({});
    expect(result.current.currentFileName).toBeNull();
  });
  it('surfaces file errors and clears loading state', async () => {
    vi.mocked(loadLogFile).mockRejectedValue(new Error('File too large'));
    const { result } = renderHook(useLogsModel);
    await act(async () => result.current.loadLogs(new File(['test'], 'a.log')));
    await waitFor(() => expect(result.current.isAnyFileLoading).toBe(false));
    expect(result.current.loadError).toBe('File too large');
  });
});
