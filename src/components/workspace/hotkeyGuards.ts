// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export type HotkeyIntent =
  | 'toggle_left_rail'
  | 'toggle_insights'
  | 'toggle_composer'
  | 'toggle_all_panels'
  | 'insight_nav_left'
  | 'insight_nav_right'
  | 'type_to_open_composer';

export type HotkeyScope =
  | 'none'
  | 'composer'
  | 'canvas'
  | 'branch-actions'
  | 'input'
  | 'textarea'
  | 'select'
  | 'contenteditable';

const EDITABLE_SCOPES: ReadonlySet<HotkeyScope> = new Set(['composer', 'canvas', 'branch-actions', 'input', 'textarea', 'select', 'contenteditable']);

function parseScope(value: string | null): HotkeyScope | null {
  if (!value) return null;
  if (
    value === 'none' ||
    value === 'composer' ||
    value === 'canvas' ||
    value === 'branch-actions' ||
    value === 'input' ||
    value === 'textarea' ||
    value === 'select' ||
    value === 'contenteditable'
  ) {
    return value;
  }
  return null;
}

export function resolveHotkeyScope(target: EventTarget | null): HotkeyScope {
  if (!(target instanceof HTMLElement)) return 'none';

  const scopedAncestor = target.closest<HTMLElement>('[data-hotkey-scope]');
  const scopedValue = parseScope(scopedAncestor?.getAttribute('data-hotkey-scope') ?? null);
  if (scopedValue) {
    return scopedValue;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === 'input') return 'input';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (target.isContentEditable) return 'contenteditable';

  return 'none';
}

export function isEditableHotkeyScope(scope: HotkeyScope): boolean {
  return EDITABLE_SCOPES.has(scope);
}

export function shouldBlockHotkey(intent: HotkeyIntent, scope: HotkeyScope): boolean {
  if (intent === 'insight_nav_left' || intent === 'insight_nav_right' || intent === 'type_to_open_composer') {
    return isEditableHotkeyScope(scope);
  }

  if (intent === 'toggle_left_rail' || intent === 'toggle_insights' || intent === 'toggle_all_panels' || intent === 'toggle_composer') {
    if (scope === 'composer') return false;
    if (scope === 'branch-actions') return true;
    if (isEditableHotkeyScope(scope)) return true;
    return false;
  }

  return false;
}
