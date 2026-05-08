// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export const TEXT_WRAP_MODES = ['overflow', 'wrap', 'clip'] as const;

export type TextWrapMode = (typeof TEXT_WRAP_MODES)[number];

export type SheetCell = {
  value: string;
  wrapMode?: TextWrapMode;
};

export type CellSelection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export const DEFAULT_TEXT_WRAP_MODE: TextWrapMode = 'overflow';

export const TEXT_WRAP_MODE_LABELS: Record<TextWrapMode, string> = {
  overflow: 'Overflow',
  wrap: 'Wrap',
  clip: 'Clip'
};

export const TEXT_WRAP_MODE_DESCRIPTIONS: Record<TextWrapMode, string> = {
  overflow: 'Let text continue into empty cells to the right.',
  wrap: 'Wrap text onto multiple lines inside the cell.',
  clip: 'Hide text that does not fit inside the cell.'
};

export const getCellWrapMode = (cell: SheetCell | undefined): TextWrapMode =>
  cell?.wrapMode ?? DEFAULT_TEXT_WRAP_MODE;

export const normalizeSelection = (selection: CellSelection): CellSelection => ({
  startRow: Math.min(selection.startRow, selection.endRow),
  startCol: Math.min(selection.startCol, selection.endCol),
  endRow: Math.max(selection.startRow, selection.endRow),
  endCol: Math.max(selection.startCol, selection.endCol)
});

export const isCellInSelection = (selection: CellSelection, rowIndex: number, colIndex: number): boolean => {
  const normalized = normalizeSelection(selection);
  return (
    rowIndex >= normalized.startRow &&
    rowIndex <= normalized.endRow &&
    colIndex >= normalized.startCol &&
    colIndex <= normalized.endCol
  );
};

export const getSelectedWrapMode = (cells: SheetCell[][], selection: CellSelection): TextWrapMode | 'mixed' => {
  const normalized = normalizeSelection(selection);
  let firstMode: TextWrapMode | null = null;
  for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
    for (let colIndex = normalized.startCol; colIndex <= normalized.endCol; colIndex += 1) {
      const mode = getCellWrapMode(cells[rowIndex]?.[colIndex]);
      if (!firstMode) {
        firstMode = mode;
      } else if (firstMode !== mode) {
        return 'mixed';
      }
    }
  }
  return firstMode ?? DEFAULT_TEXT_WRAP_MODE;
};

export const applyTextWrapModeToSelection = (
  cells: SheetCell[][],
  selection: CellSelection,
  wrapMode: TextWrapMode
): SheetCell[][] => {
  const normalized = normalizeSelection(selection);
  return cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (!isCellInSelection(normalized, rowIndex, colIndex)) {
        return cell;
      }
      return { ...cell, wrapMode };
    })
  );
};

export const hasBlockingCellToRight = (cells: SheetCell[][], rowIndex: number, colIndex: number): boolean => {
  const nextCell = cells[rowIndex]?.[colIndex + 1];
  return Boolean(nextCell?.value.trim());
};

export const canOverflowIntoRightCell = (cells: SheetCell[][], rowIndex: number, colIndex: number): boolean => {
  const cell = cells[rowIndex]?.[colIndex];
  return Boolean(
    cell?.value.trim() &&
      getCellWrapMode(cell) === 'overflow' &&
      cells[rowIndex]?.[colIndex + 1] &&
      !hasBlockingCellToRight(cells, rowIndex, colIndex)
  );
};

export const createSheetCells = (values: string[][]): SheetCell[][] =>
  values.map((row) => row.map((value) => ({ value, wrapMode: DEFAULT_TEXT_WRAP_MODE })));
