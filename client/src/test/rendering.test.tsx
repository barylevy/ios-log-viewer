import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HighlightedText from '../components/HighlightedText';
import ViewerDialog from '../components/ViewerDialog';
import { compileQuery } from '../domain/logQuery';

describe('safe text and shared dialogs', () => {
  it('displays log markup as text while preserving highlights', () => {
    const text = '<img src=x onerror="alert(1)"> error';
    const { container } = render(
      <HighlightedText text={text} filter={compileQuery('error')} search={compileQuery('')} />,
    );
    expect(container.textContent).toBe(text);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('mark')?.textContent).toBe('error');
  });
  it('does not search inside previously generated highlight markup', () => {
    const { container } = render(
      <HighlightedText
        text="error class"
        filter={compileQuery('error')}
        search={compileQuery('class')}
      />,
    );
    expect(container.textContent).toBe('error class');
    expect(container.querySelectorAll('mark')).toHaveLength(2);
  });
  it('provides an accessible modal and Escape closes it', () => {
    const onClose = vi.fn();
    render(
      <ViewerDialog open onClose={onClose} label="Test dialog">
        <button>Inside</button>
      </ViewerDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
