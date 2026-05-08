// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, { useMemo, useState } from 'react';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import {
  applyTextWrapModeToSelection,
  canOverflowIntoRightCell,
  createSheetCells,
  DEFAULT_TEXT_WRAP_MODE,
  getCellWrapMode,
  getSelectedWrapMode,
  isCellInSelection,
  normalizeSelection,
  TEXT_WRAP_MODE_DESCRIPTIONS,
  TEXT_WRAP_MODE_LABELS,
  TEXT_WRAP_MODES,
  type CellSelection,
  type SheetCell,
  type TextWrapMode
} from './textWrap';

const WRAP_MODE_ICONS: Record<TextWrapMode, string> = {
  overflow: 'lengthen-text',
  wrap: 'wrap-lines',
  clip: 'clip'
};

const DEFAULT_SHEET_VALUES = [
  ['Long project note that should overflow into empty cells when possible', '', 'Status'],
  ['Wrapped notes stay readable inside a single cell', 'Owner', 'Due date'],
  ['Clipped notes keep the sheet compact without changing row height', '', '']
];

type SheetEditorProps = {
  initialCells?: SheetCell[][];
  onCellsChange?: (cells: SheetCell[][]) => void;
};

const cloneCells = (cells: SheetCell[][]): SheetCell[][] => cells.map((row) => row.map((cell) => ({ ...cell })));

const columnName = (index: number) => String.fromCharCode(65 + index);

const selectedRangeLabel = (selection: CellSelection) => {
  const normalized = normalizeSelection(selection);
  const start = `${columnName(normalized.startCol)}${normalized.startRow + 1}`;
  const end = `${columnName(normalized.endCol)}${normalized.endRow + 1}`;
  return start === end ? start : `${start}:${end}`;
};

export function SheetEditor({ initialCells, onCellsChange }: SheetEditorProps) {
  const [cells, setCells] = useState<SheetCell[][]>(() =>
    initialCells ? cloneCells(initialCells) : createSheetCells(DEFAULT_SHEET_VALUES)
  );
  const [selection, setSelection] = useState<CellSelection>({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  const [wrapMenuOpen, setWrapMenuOpen] = useState(false);
  const selectedWrapMode = useMemo(() => getSelectedWrapMode(cells, selection), [cells, selection]);
  const columnCount = Math.max(...cells.map((row) => row.length));

  const commitCells = (nextCells: SheetCell[][]) => {
    setCells(nextCells);
    onCellsChange?.(nextCells);
  };

  const applyWrapMode = (wrapMode: TextWrapMode) => {
    commitCells(applyTextWrapModeToSelection(cells, selection, wrapMode));
    setWrapMenuOpen(false);
  };

  return (
    <section className="rounded-2xl border border-divider/80 bg-white shadow-sm" aria-label="Sheet editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider/80 bg-slate-50/80 px-3 py-2">
        <div className="rounded-lg border border-divider/70 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
          {selectedRangeLabel(selection)}
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-divider/70 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-primary/10"
            aria-haspopup="menu"
            aria-expanded={wrapMenuOpen}
            aria-label="Text wrapping"
            onClick={() => setWrapMenuOpen((open) => !open)}
          >
            <BlueprintIcon
              icon={selectedWrapMode === 'mixed' ? 'wrap-lines' : WRAP_MODE_ICONS[selectedWrapMode]}
              className="h-4 w-4 text-slate-600"
            />
            <span>{selectedWrapMode === 'mixed' ? 'Mixed wrap' : TEXT_WRAP_MODE_LABELS[selectedWrapMode]}</span>
            <BlueprintIcon icon="caret-down" className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {wrapMenuOpen ? (
            <div
              role="menu"
              aria-label="Text wrapping options"
              className="absolute left-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-divider/80 bg-white py-1 shadow-lg"
            >
              {TEXT_WRAP_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedWrapMode === mode}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-primary/10"
                  onClick={() => applyWrapMode(mode)}
                >
                  <BlueprintIcon icon={WRAP_MODE_ICONS[mode]} className="mt-0.5 h-4 w-4 text-slate-600" />
                  <span>
                    <span className="block font-semibold">{TEXT_WRAP_MODE_LABELS[mode]}</span>
                    <span className="block text-[11px] leading-snug text-slate-500">
                      {TEXT_WRAP_MODE_DESCRIPTIONS[mode]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="overflow-auto p-3">
        <div
          className="grid min-w-max border-l border-t border-slate-200 text-sm"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(9rem, 9rem))` }}
        >
          {cells.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const wrapMode = getCellWrapMode(cell);
              const selected = isCellInSelection(selection, rowIndex, colIndex);
              const canOverflowRight = canOverflowIntoRightCell(cells, rowIndex, colIndex);
              const isClippedOverflow = wrapMode === DEFAULT_TEXT_WRAP_MODE && !canOverflowRight;
              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={`relative min-h-10 border-b border-r border-slate-200 bg-white px-2 py-1 text-left align-top focus:z-20 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    selected ? 'z-10 bg-primary/10 ring-1 ring-primary/50' : ''
                  } ${canOverflowRight ? 'overflow-visible' : 'overflow-hidden'}`}
                  data-testid={`sheet-cell-${rowIndex}-${colIndex}`}
                  data-wrap-mode={wrapMode}
                  data-overflow-blocked={isClippedOverflow ? 'true' : 'false'}
                  aria-label={`${columnName(colIndex)}${rowIndex + 1}`}
                  onClick={(event) => {
                    setSelection((current) => ({
                      startRow: event.shiftKey ? current.startRow : rowIndex,
                      startCol: event.shiftKey ? current.startCol : colIndex,
                      endRow: rowIndex,
                      endCol: colIndex
                    }));
                  }}
                >
                  <span
                    className={`block ${
                      wrapMode === 'wrap'
                        ? 'whitespace-normal break-words leading-snug'
                        : 'whitespace-nowrap leading-snug'
                    } ${canOverflowRight ? 'relative z-20 min-w-max bg-white/95 pr-2' : 'truncate'}`}
                    title={cell.value}
                  >
                    {cell.value}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
