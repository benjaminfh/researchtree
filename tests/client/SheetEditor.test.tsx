import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SheetEditor } from '@/src/components/sheets/SheetEditor';
import {
  applyTextWrapModeToSelection,
  canOverflowIntoRightCell,
  createSheetCells,
  getCellWrapMode
} from '@/src/components/sheets/textWrap';

describe('sheet text wrapping', () => {
  it('defaults cells to overflow mode', () => {
    const cells = createSheetCells([['Long text']]);

    expect(getCellWrapMode(cells[0][0])).toBe('overflow');
  });

  it('applies a wrap mode to an arbitrary rectangular selection', () => {
    const cells = createSheetCells([
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['A3', 'B3', 'C3']
    ]);

    const nextCells = applyTextWrapModeToSelection(
      cells,
      { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      'clip'
    );

    expect(nextCells[0][0].wrapMode).toBe('clip');
    expect(nextCells[2][1].wrapMode).toBe('clip');
    expect(nextCells[0][2].wrapMode).toBe('overflow');
  });

  it('allows overflow only when the right-adjacent cell is empty', () => {
    const cells = createSheetCells([
      ['Long text', '', 'Blocked text', 'Neighbor'],
    ]);

    expect(canOverflowIntoRightCell(cells, 0, 0)).toBe(true);
    expect(canOverflowIntoRightCell(cells, 0, 2)).toBe(false);
  });

  it('does not truncate cells rendered in wrap mode when overflow is blocked', () => {
    render(
      <SheetEditor
        initialCells={createSheetCells([
          ['Long text that should wrap inside this cell instead of truncating', 'Neighbor']
        ])}
      />
    );

    fireEvent.click(screen.getByTestId('sheet-cell-0-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Text wrapping' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Wrap/ }));

    const wrappedText = screen.getByTestId('sheet-cell-0-0').querySelector('span');
    expect(wrappedText).toHaveClass('whitespace-normal');
    expect(wrappedText).not.toHaveClass('truncate');
  });

  it('opens a toolbar submenu and applies wrap formatting to the selected range', () => {
    render(
      <SheetEditor
        initialCells={createSheetCells([
          ['A1', 'B1'],
          ['A2', 'B2']
        ])}
      />
    );

    fireEvent.click(screen.getByTestId('sheet-cell-0-0'));
    fireEvent.click(screen.getByTestId('sheet-cell-1-1'), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Text wrapping' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Wrap/ }));

    expect(screen.getByTestId('sheet-cell-0-0')).toHaveAttribute('data-wrap-mode', 'wrap');
    expect(screen.getByTestId('sheet-cell-1-1')).toHaveAttribute('data-wrap-mode', 'wrap');
  });
});
