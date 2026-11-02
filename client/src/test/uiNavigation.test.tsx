import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import LogTabs from '../LogTabs';
import LogModal from '../LogModal';
import GoToLineDialog from '../components/GoToLineDialog';
import { parseLogContent } from '../LogParser';

it('keeps sorted tabs mapped to their original sources during keyboard selection, export and close', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const onExport = vi.fn();
  const onCombined = vi.fn();
  function Tabs() {
    const [active, setActive] = useState(1);
    const [combined, setCombined] = useState(false);
    return (
      <LogTabs
        files={[
          { id: 'z.log', name: 'z.log' },
          { id: 'a.log', name: 'a.log' },
        ]}
        activeFileIndex={active}
        showingCombinedView={combined}
        onFileSelect={(index) => {
          setActive(index);
          setCombined(false);
          onSelect(index);
        }}
        onCombinedViewSelect={() => {
          setCombined(true);
          onCombined();
        }}
        onFileClose={onClose}
        onCloseAll={vi.fn()}
        onExportActive={onExport}
      />
    );
  }
  render(<Tabs />);
  const list = screen.getByRole('tablist', { name: 'Log files' });
  expect(
    within(list)
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['a.log', 'z.log', 'All Files']);
  screen.getByRole('tab', { name: 'a.log' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(onSelect).toHaveBeenLastCalledWith(0);
  expect(screen.getByRole('tab', { name: 'z.log' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'z.log' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  expect(onCombined).toHaveBeenCalledOnce();
  expect(screen.getByRole('tab', { name: 'All Files' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Export all files' }));
  expect(onExport).toHaveBeenCalledOnce();
  onSelect.mockClear();
  await user.click(screen.getByRole('button', { name: 'Close a.log' }));
  expect(onClose).toHaveBeenCalledExactlyOnceWith(1);
  expect(onSelect).not.toHaveBeenCalled();
  expect(document.querySelector('button button')).toBeNull();
});

it('keeps JSON search arrow keys inside the field and copies the selected detail format', async () => {
  const user = userEvent.setup();
  const [record] = parseLogContent(
    '2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] payload {"message":"<script>alert(1)</script>","count":2}',
  );
  const onPrev = vi.fn();
  const onNext = vi.fn();
  render(
    <LogModal log={record} onClose={vi.fn()} onPrev={onPrev} onNext={onNext} hasPrev hasNext />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Log details' });
  const search = within(dialog).getByRole('textbox', { name: 'Search JSON' });
  await user.click(search);
  await user.keyboard('count{ArrowLeft}{ArrowRight}');
  expect(onPrev).not.toHaveBeenCalled();
  expect(onNext).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Copy JSON' }));
  expect(await navigator.clipboard.readText()).toBe(
    '{"message":"<script>alert(1)</script>","count":2}',
  );
  await user.click(within(dialog).getByRole('button', { name: 'Text' }));
  await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
  expect(await navigator.clipboard.readText()).toBe(record.raw);
  expect(dialog.querySelector('script')).toBeNull();
  await user.click(within(dialog).getByRole('button', { name: 'Next log (→)' }));
  expect(onNext).toHaveBeenCalledOnce();
});

it('rejects fractional source lines and accepts a valid line through Enter', () => {
  const onSelect = vi.fn();
  render(<GoToLineDialog maximumLine={100} onClose={vi.fn()} onSelect={onSelect} />);
  const input = screen.getByRole('spinbutton', { name: 'Line number' });
  fireEvent.change(input, { target: { value: '1.5' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '40' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(40);
});
