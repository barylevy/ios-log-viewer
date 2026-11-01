import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import LogViewerHeader from '../LogViewerHeader';
import SelectionFilesDialog from '../SelectionFilesDialog';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
});

function sourceFile(path: string): File {
  const file = new File(['log content'], path.split('/').pop()!);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

function headerProps(): ComponentProps<typeof LogViewerHeader> {
  return {
    onFileLoad: vi.fn(),
    hasLogs: false,
    currentFileHeaders: null,
    onClearTabs: vi.fn(),
    visibleColumns: {},
    onColumnsChange: vi.fn(),
    onResetColumnDefaults: vi.fn(),
    logDuration: null,
    folderName: null,
    onPrepareFilesStart: vi.fn(),
    onPrepareFilesEnd: vi.fn(),
    onDownloadMerged: vi.fn(),
    isDownloadingMerged: false,
    onClearFilters: vi.fn(),
    onLiveToggle: vi.fn(),
    onOpenLiveSettings: vi.fn(),
  };
}

it('preserves manual folder choices across header renders and confirms the chosen sources', async () => {
  localStorage.setItem('logViewer_folderGroupNames', JSON.stringify(['demlogs']));
  const props = headerProps();
  const app = sourceFile('root/AppLogs/app.log');
  const dem = sourceFile('root/DemLogs/dem.log');
  const { container, rerender } = render(<LogViewerHeader {...props} />);
  fireEvent.change(container.querySelector('input[webkitdirectory]')!, {
    target: { files: [app, dem] },
  });
  const appChoice = await screen.findByRole('checkbox', { name: 'AppLogs' });
  expect(appChoice).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'DemLogs' })).toBeChecked();
  fireEvent.click(appChoice);
  rerender(<LogViewerHeader {...props} logDuration="updated while selecting" />);
  expect(appChoice).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Open (2)' }));
  expect(props.onClearTabs).toHaveBeenCalledOnce();
  expect(props.onFileLoad).toHaveBeenNthCalledWith(1, [app], false, 'root/AppLogs');
  expect(props.onFileLoad).toHaveBeenNthCalledWith(2, [dem], false, 'root/DemLogs');
  expect(JSON.parse(localStorage.getItem('logViewer_folderGroupNames')!)).toEqual([
    'applogs',
    'demlogs',
  ]);
  expect(screen.queryByRole('dialog', { name: 'Select files' })).not.toBeInTheDocument();
});

it('bulk selection excludes unavailable sources and preserves confirmation order', () => {
  const onConfirm = vi.fn();
  render(
    <SelectionFilesDialog
      isOpen
      onClose={vi.fn()}
      onConfirm={onConfirm}
      files={[
        { id: 'app', name: 'AppLogs (2)', fileObj: [sourceFile('a/app.log')] },
        { id: 'missing', name: 'AppExtensionLogs' },
        { id: 'dem', name: 'DemLogs', fileObj: sourceFile('b/dem.log') },
      ]}
    />,
  );
  expect(screen.getByRole('checkbox', { name: /AppExtensionLogs/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Merge (1)' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
  expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Merge (2)' }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith(['app', 'dem']);
});
