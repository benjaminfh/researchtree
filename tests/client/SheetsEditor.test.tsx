// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SheetsEditor } from '@/src/components/sheets/SheetsEditor';
import { createColumnSelection, createRowSelection, moveSheetSelectionForward } from '@/src/components/sheets/sheetSelection';

const sampleData = [
  ['A1', 'B1', 'C1'],
  ['A2', 'B2', 'C2'],
  ['A3', 'B3', 'C3']
];

describe('SheetsEditor', () => {
  it('selects an entire row from the row key and makes the first column active', async () => {
    const user = userEvent.setup();
    render(<SheetsEditor data={sampleData} />);

    await user.click(screen.getByRole('button', { name: 'Select row 2' }));

    const selectedCells = screen.getAllByRole('gridcell').filter((cell) => cell.getAttribute('aria-selected') === 'true');
    expect(selectedCells).toHaveLength(3);
    expect(selectedCells.map((cell) => within(cell).getByRole('button').textContent)).toEqual(['A2', 'B2', 'C2']);
    expect(within(selectedCells[0]).getByRole('button')).toHaveTextContent('A2');
    expect(selectedCells[0]).toHaveAttribute('data-active', 'true');
  });

  it('selects an entire column from the column key and makes the first row active', async () => {
    const user = userEvent.setup();
    render(<SheetsEditor data={sampleData} />);

    await user.click(screen.getByRole('button', { name: 'Select column B' }));

    const selectedCells = screen.getAllByRole('gridcell').filter((cell) => cell.getAttribute('aria-selected') === 'true');
    expect(selectedCells).toHaveLength(3);
    expect(selectedCells.map((cell) => within(cell).getByRole('button').textContent)).toEqual(['B1', 'B2', 'B3']);
    expect(selectedCells[0]).toHaveAttribute('data-active', 'true');
  });

  it('advances the active cell through row and column selections with tab or enter', async () => {
    const user = userEvent.setup();
    render(<SheetsEditor data={sampleData} />);

    await user.click(screen.getByRole('button', { name: 'Select row 1' }));
    await user.tab();
    expect(screen.getAllByRole('gridcell')[1]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('gridcell')[2]).toHaveAttribute('data-active', 'true');

    await user.click(screen.getByRole('button', { name: 'Select column A' }));
    await user.tab();
    expect(screen.getAllByRole('gridcell')[3]).toHaveAttribute('data-active', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('gridcell')[6]).toHaveAttribute('data-active', 'true');
  });

  it('starts editing the active cell with printable text immediately after a row key selection', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<SheetsEditor data={sampleData} onChange={handleChange} />);

    await user.click(screen.getByRole('button', { name: 'Select row 2' }));
    await user.keyboard('x');

    const input = screen.getByRole('textbox', { name: 'Edit cell 2, 1' });
    expect(input).toHaveValue('x');

    await user.keyboard('yz{Enter}');
    expect(handleChange).toHaveBeenLastCalledWith([
      ['A1', 'B1', 'C1'],
      ['xyz', 'B2', 'C2'],
      ['A3', 'B3', 'C3']
    ]);
  });
});

describe('sheet selection helpers', () => {
  it('keeps header selections while moving active cell by one index', () => {
    expect(moveSheetSelectionForward(createRowSelection(3), 10, 10)).toEqual({
      kind: 'row',
      anchor: { rowIndex: 3, columnIndex: 0 },
      active: { rowIndex: 3, columnIndex: 1 }
    });
    expect(moveSheetSelectionForward(createColumnSelection(4), 10, 10)).toEqual({
      kind: 'column',
      anchor: { rowIndex: 0, columnIndex: 4 },
      active: { rowIndex: 1, columnIndex: 4 }
    });
  });
});
