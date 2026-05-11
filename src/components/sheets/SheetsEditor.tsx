// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCellSelection,
  createColumnSelection,
  createRowSelection,
  isCellInSelection,
  isPrintableSheetEntryKey,
  moveSheetSelectionForward,
  type SheetCellPosition,
  type SheetSelection
} from './sheetSelection';

type SheetsEditorProps = {
  data: string[][];
  readOnly?: boolean;
  rowLabels?: string[];
  columnLabels?: string[];
  onChange?: (nextData: string[][]) => void;
};

type EditingCell = SheetCellPosition & {
  value: string;
};

const toColumnLabel = (columnIndex: number): string => {
  let value = columnIndex + 1;
  let label = '';
  while (value > 0) {
    const modulo = (value - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    value = Math.floor((value - modulo) / 26);
  }
  return label;
};

const normalizeData = (data: string[][]): string[][] => {
  const columnCount = Math.max(1, ...data.map((row) => row.length));
  const rowCount = Math.max(1, data.length);
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => data[rowIndex]?.[columnIndex] ?? '')
  );
};

export const SheetsEditor = ({ data, readOnly = false, rowLabels, columnLabels, onChange }: SheetsEditorProps) => {
  const normalizedData = useMemo(() => normalizeData(data), [data]);
  const rowCount = normalizedData.length;
  const columnCount = normalizedData[0]?.length ?? 1;
  const [selection, setSelection] = useState<SheetSelection>(() => createCellSelection(0, 0));
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const editingCellRef = useRef<EditingCell | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelection((current) => {
      const rowIndex = Math.min(current.active.rowIndex, rowCount - 1);
      const columnIndex = Math.min(current.active.columnIndex, columnCount - 1);
      if (rowIndex === current.active.rowIndex && columnIndex === current.active.columnIndex) return current;
      return createCellSelection(rowIndex, columnIndex);
    });
  }, [columnCount, rowCount]);

  const updateEditingCell = (nextEditingCell: EditingCell | null) => {
    editingCellRef.current = nextEditingCell;
    setEditingCell(nextEditingCell);
  };

  const commitEdit = (nextValue = editingCellRef.current?.value ?? '') => {
    const cellToCommit = editingCellRef.current;
    if (!cellToCommit) return;
    editingCellRef.current = null;
    const nextData = normalizedData.map((row) => [...row]);
    nextData[cellToCommit.rowIndex][cellToCommit.columnIndex] = nextValue;
    onChange?.(nextData);
    updateEditingCell(null);
  };

  const focusGrid = () => gridRef.current?.focus();

  const handleHeaderSelection = (nextSelection: SheetSelection) => {
    updateEditingCell(null);
    setSelection(nextSelection);
    focusGrid();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;

    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      setSelection((current) => moveSheetSelectionForward(current, rowCount, columnCount));
      return;
    }

    if (!readOnly && isPrintableSheetEntryKey(event.nativeEvent)) {
      event.preventDefault();
      updateEditingCell({ ...selection.active, value: event.key });
    }
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      aria-label="Sheets editor"
      aria-readonly={readOnly}
      data-selection-kind={selection.kind}
      className="max-w-full overflow-auto rounded-xl border border-divider/80 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      onKeyDownCapture={handleKeyDown}
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 border-b border-r border-divider/80 bg-slate-50 px-3 py-2" aria-hidden="true" />
            {Array.from({ length: columnCount }, (_, columnIndex) => {
              const isSelected = selection.kind === 'column' && selection.anchor.columnIndex === columnIndex;
              return (
                <th key={columnIndex} className="border-b border-r border-divider/80 bg-slate-50 p-0">
                  <button
                    type="button"
                    className={`h-full w-full px-3 py-2 text-xs font-semibold ${isSelected ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-primary/5'}`}
                    aria-label={`Select column ${columnLabels?.[columnIndex] ?? toColumnLabel(columnIndex)}`}
                    aria-pressed={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleHeaderSelection(createColumnSelection(columnIndex))}
                  >
                    {columnLabels?.[columnIndex] ?? toColumnLabel(columnIndex)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {normalizedData.map((row, rowIndex) => {
            const isRowSelected = selection.kind === 'row' && selection.anchor.rowIndex === rowIndex;
            return (
              <tr key={rowIndex}>
                <th className="sticky left-0 z-10 border-b border-r border-divider/80 bg-slate-50 p-0">
                  <button
                    type="button"
                    className={`h-full w-full px-3 py-2 text-xs font-semibold ${isRowSelected ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-primary/5'}`}
                    aria-label={`Select row ${rowLabels?.[rowIndex] ?? rowIndex + 1}`}
                    aria-pressed={isRowSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleHeaderSelection(createRowSelection(rowIndex))}
                  >
                    {rowLabels?.[rowIndex] ?? rowIndex + 1}
                  </button>
                </th>
                {row.map((cell, columnIndex) => {
                  const isActive =
                    selection.active.rowIndex === rowIndex && selection.active.columnIndex === columnIndex;
                  const isSelected = isCellInSelection(selection, rowIndex, columnIndex);
                  const isEditing =
                    editingCell?.rowIndex === rowIndex && editingCell.columnIndex === columnIndex;
                  return (
                    <td
                      key={columnIndex}
                      role="gridcell"
                      aria-selected={isSelected}
                      data-active={isActive || undefined}
                      className={`min-w-28 border-b border-r border-divider/80 p-0 ${isSelected ? 'bg-primary/5' : ''} ${isActive ? 'outline outline-2 -outline-offset-2 outline-primary' : ''}`}
                      onMouseDown={() => {
                        updateEditingCell(null);
                        setSelection(createCellSelection(rowIndex, columnIndex));
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          aria-label={`Edit cell ${rowIndex + 1}, ${columnIndex + 1}`}
                          className="h-full w-full bg-white px-3 py-2 outline-none"
                          value={editingCell.value}
                          onChange={(event) => updateEditingCell({ rowIndex, columnIndex, value: event.target.value })}
                          onBlur={() => commitEdit()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === 'Tab') {
                              event.preventDefault();
                              commitEdit(editingCell.value);
                              setSelection((current) => moveSheetSelectionForward(current, rowCount, columnCount));
                              focusGrid();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              updateEditingCell(null);
                              focusGrid();
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="block h-full min-h-9 w-full px-3 py-2 text-left"
                          onDoubleClick={() => {
                            if (!readOnly) updateEditingCell({ rowIndex, columnIndex, value: cell });
                          }}
                        >
                          {cell}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
