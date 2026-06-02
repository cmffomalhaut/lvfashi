import { klona } from 'klona';
import type { BattleFlatUpdates } from './ai-profile.ts';
import { stateAccess, type StateAccessApi, type StateAccessTransactionResult } from '../MVU/state-access.ts';

const STAT_DATA_PREFIX = 'stat_data.';
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export type BattleValidatedUpdate = {
  fullPath: string;
  statePath: string;
  value: unknown;
};

export type BattleFlatUpdateValidationResult = {
  valid: BattleValidatedUpdate[];
  invalid: string[];
};

function normalizeBattleUpdatePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith(STAT_DATA_PREFIX)) {
    return null;
  }

  const statePath = trimmed.slice(STAT_DATA_PREFIX.length).trim();
  if (!statePath) {
    return null;
  }

  const segments = _.toPath(statePath).map(segment => String(segment).trim());
  if (!segments.length || segments.some(segment => !segment || FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    return null;
  }

  return segments.join('.');
}

export function isValidBattleUpdatePath(path: string): boolean {
  return normalizeBattleUpdatePath(path) !== null;
}

export function validateBattleFlatUpdates(updates: BattleFlatUpdates): BattleFlatUpdateValidationResult {
  if (!_.isPlainObject(updates)) {
    return {
      valid: [],
      invalid: ['更新结果必须是扁平对象，不能是数组或其他类型'],
    };
  }

  const valid: BattleValidatedUpdate[] = [];
  const invalid: string[] = [];

  for (const [fullPath, value] of Object.entries(updates)) {
    const normalized = normalizeBattleUpdatePath(fullPath);
    if (!normalized) {
      invalid.push(`非法更新路径：${fullPath}`);
      continue;
    }

    valid.push({
      fullPath,
      statePath: normalized,
      value: klona(value),
    });
  }

  return { valid, invalid };
}

export function assertBattleFlatUpdates(updates: BattleFlatUpdates): BattleValidatedUpdate[] {
  const validation = validateBattleFlatUpdates(updates);
  if (validation.invalid.length) {
    throw new Error(validation.invalid.join('\n'));
  }
  return validation.valid;
}

export function mergeBattleFlatUpdates(
  baseUpdates: BattleFlatUpdates,
  nextUpdates: BattleFlatUpdates,
): BattleFlatUpdates {
  const merged = _.fromPairs(
    [...assertBattleFlatUpdates(baseUpdates), ...assertBattleFlatUpdates(nextUpdates)].map(update => [
      `${STAT_DATA_PREFIX}${update.statePath}`,
      klona(update.value),
    ]),
  );
  return merged;
}

function normalizeBattleRuntimeUpdatePath(path: string): string | null {
  const trimmed = path.trim().replace(/^selected_data\./u, '').replace(/^stat_data\./u, '');
  if (!trimmed) {
    return null;
  }

  const segments = _.toPath(trimmed).map(segment => String(segment).trim());
  if (!segments.length || segments.some(segment => !segment || FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    return null;
  }

  return segments.join('.');
}

function mergeRuntimeValue(current: unknown, incoming: unknown): unknown {
  if (_.isPlainObject(current) && _.isPlainObject(incoming)) {
    const merged = klona(current) as Record<string, unknown>;
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      merged[key] = mergeRuntimeValue(merged[key], value);
    }
    return merged;
  }

  return klona(incoming);
}

function setRuntimeUpdate(target: BattleFlatUpdates, path: string, value: unknown) {
  const existing = _.get(target, path);
  _.set(target, path, mergeRuntimeValue(existing, value));
}

export function mergeBattleRuntimeUpdates(
  baseUpdates: BattleFlatUpdates,
  nextUpdates: BattleFlatUpdates,
): BattleFlatUpdates {
  const merged: BattleFlatUpdates = {};
  for (const updates of [baseUpdates, nextUpdates]) {
    if (!_.isPlainObject(updates)) {
      continue;
    }
    for (const [path, value] of Object.entries(updates)) {
      const normalized = normalizeBattleRuntimeUpdatePath(path);
      if (normalized) {
        setRuntimeUpdate(merged, normalized, value);
      }
    }
  }
  return merged;
}

function resolveRuntimeApplyPath(state: Record<string, unknown>, normalizedPath: string): string {
  if (_.has(state, normalizedPath)) {
    return normalizedPath;
  }

  const firstSegment = _.toPath(normalizedPath)[0];
  if (
    firstSegment &&
    !_.has(state, firstSegment) &&
    _.isPlainObject(_.get(state, '角色数据')) &&
    _.has(state, `角色数据.${normalizedPath}`)
  ) {
    return `角色数据.${normalizedPath}`;
  }

  return normalizedPath;
}

export function applyBattleRuntimeUpdates<T extends Record<string, unknown>>(state: T, updates: BattleFlatUpdates): T {
  const nextState = klona(state);
  if (!_.isPlainObject(updates)) {
    return nextState;
  }

  for (const [path, value] of Object.entries(updates)) {
    const normalized = normalizeBattleRuntimeUpdatePath(path);
    if (normalized) {
      const applyPath = resolveRuntimeApplyPath(nextState, normalized);
      setRuntimeUpdate(nextState, applyPath, value);
    }
  }
  return nextState;
}

export function applyValidatedBattleUpdates<T extends Record<string, unknown>>(
  state: T,
  updates: BattleValidatedUpdate[],
): T {
  const nextState = klona(state);
  for (const update of updates) {
    _.set(nextState, update.statePath, klona(update.value));
  }
  return nextState;
}

export function applyBattleFlatUpdates<T extends Record<string, unknown>>(state: T, updates: BattleFlatUpdates): T {
  return applyValidatedBattleUpdates(state, assertBattleFlatUpdates(updates));
}

export async function writeBattleFlatUpdatesToMainState(
  updates: BattleFlatUpdates,
  options: {
    access?: StateAccessApi;
    sourceMessageId?: number;
  } = {},
): Promise<StateAccessTransactionResult> {
  const { access = stateAccess, sourceMessageId } = options;
  const validated = assertBattleFlatUpdates(updates);
  return access.editMainState({
    sourceMessageId,
    mutate: draft => {
      for (const update of validated) {
        _.set(draft, update.statePath, klona(update.value));
      }
    },
  });
}
