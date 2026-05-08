// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export type SheetSelectionKind = 'cell' | 'row' | 'column';

export type SheetCellPosition = {
  rowIndex: number;
  columnIndex: number;
};

export type SheetSelection = {
  kind: SheetSelectionKind;
  active: SheetCellPosition;
  anchor: SheetCellPosition;
};

export const createCellSelection = (rowIndex: number, columnIndex: number): SheetSelection => ({
  kind: 'cell',
  active: { rowIndex, columnIndex },
  anchor: { rowIndex, columnIndex }
});

export const createRowSelection = (rowIndex: number): SheetSelection => ({
  kind: 'row',
  active: { rowIndex, columnIndex: 0 },
  anchor: { rowIndex, columnIndex: 0 }
});

export const createColumnSelection = (columnIndex: number): SheetSelection => ({
  kind: 'column',
  active: { rowIndex: 0, columnIndex },
  anchor: { rowIndex: 0, columnIndex }
});

export const moveSheetSelectionForward = (
  selection: SheetSelection,
  rowCount: number,
  columnCount: number
): SheetSelection => {
  const maxRowIndex = Math.max(0, rowCount - 1);
  const maxColumnIndex = Math.max(0, columnCount - 1);

  if (selection.kind === 'row') {
    const nextColumnIndex = Math.min(maxColumnIndex, selection.active.columnIndex + 1);
    return {
      ...selection,
      active: { rowIndex: selection.anchor.rowIndex, columnIndex: nextColumnIndex }
    };
  }

  if (selection.kind === 'column') {
    const nextRowIndex = Math.min(maxRowIndex, selection.active.rowIndex + 1);
    return {
      ...selection,
      active: { rowIndex: nextRowIndex, columnIndex: selection.anchor.columnIndex }
    };
  }

  const nextColumnIndex = selection.active.columnIndex + 1;
  if (nextColumnIndex <= maxColumnIndex) {
    return createCellSelection(selection.active.rowIndex, nextColumnIndex);
  }

  const nextRowIndex = Math.min(maxRowIndex, selection.active.rowIndex + 1);
  return createCellSelection(nextRowIndex, 0);
};

export const isCellInSelection = (
  selection: SheetSelection,
  rowIndex: number,
  columnIndex: number
): boolean => {
  if (selection.kind === 'row') return rowIndex === selection.anchor.rowIndex;
  if (selection.kind === 'column') return columnIndex === selection.anchor.columnIndex;
  return selection.active.rowIndex === rowIndex && selection.active.columnIndex === columnIndex;
};

export const isPrintableSheetEntryKey = (event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean => {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
};
