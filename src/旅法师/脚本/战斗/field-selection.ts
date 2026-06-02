import { klona } from 'klona';
import type {
  BattleFieldSelectionConfig,
  BattleFieldValueKind,
  BattleSelectedField,
} from './ai-profile.ts';

export type BattleFieldTreeNode = {
  key: string;
  path: string;
  segment: string;
  valueKind: BattleFieldValueKind;
  preview: string;
  childCount: number;
  children: BattleFieldTreeNode[];
};

export type BattleSelectedDataExtractionResult = {
  selectedData: Record<string, unknown>;
  warnings: string[];
};

function normalizeFieldPath(path: string): string {
  return path.replace(/^stat_data\./u, '').replace(/^\.+/u, '').trim();
}

function stableStructureStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(entry => stableStructureStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([lhs], [rhs]) => lhs.localeCompare(rhs, 'zh-Hans-CN'))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStructureStringify(entry)}`)
      .join(',')}}`;
  }
  return typeof value;
}

export function buildBattleFieldSelectionSourceHash(statData: Record<string, unknown>): string {
  const source = stableStructureStringify(_.omit(statData, 'battle_session'));
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `stat-${hash.toString(16)}`;
}

function isSameOrAncestorPath(ancestorPath: string, targetPath: string): boolean {
  const normalizedAncestor = normalizeFieldPath(ancestorPath);
  const normalizedTarget = normalizeFieldPath(targetPath);
  return (
    normalizedAncestor === normalizedTarget ||
    normalizedTarget.startsWith(`${normalizedAncestor}.`) ||
    normalizedTarget.startsWith(`${normalizedAncestor}[`)
  );
}

export function inferBattleFieldValueKind(value: unknown): BattleFieldValueKind {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    return 'object';
  }
  if (value === undefined) {
    return 'unknown';
  }
  return 'scalar';
}

function buildFieldPreview(value: unknown, valueKind: BattleFieldValueKind): string {
  if (valueKind === 'array') {
    return `数组(${Array.isArray(value) ? value.length : 0})`;
  }
  if (valueKind === 'object') {
    return `对象(${value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).length : 0})`;
  }
  if (typeof value === 'string') {
    return value.length > 60 ? `${value.slice(0, 60)}...` : value;
  }
  if (value === undefined) {
    return '未定义';
  }
  if (value === null) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildNodePath(parentPath: string, segment: string, isArrayChild: boolean): string {
  if (!parentPath) {
    return isArrayChild ? `[${segment}]` : segment;
  }
  return isArrayChild ? `${parentPath}[${segment}]` : `${parentPath}.${segment}`;
}

function buildBattleFieldTreeInternal(value: unknown, parentPath = '', segment = ''): BattleFieldTreeNode[] {
  const valueKind = inferBattleFieldValueKind(value);

  if (valueKind === 'array') {
    return (value as unknown[]).map((entry, index) => {
      const path = buildNodePath(parentPath, String(index), true);
      const childKind = inferBattleFieldValueKind(entry);
      const children = buildBattleFieldTreeInternal(entry, path);
      return {
        key: path,
        path,
        segment: `[${index}]`,
        valueKind: childKind,
        preview: buildFieldPreview(entry, childKind),
        childCount: children.length,
        children,
      };
    });
  }

  if (valueKind === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([lhs], [rhs]) => lhs.localeCompare(rhs, 'zh-Hans-CN'))
      .map(([key, entry]) => {
        const path = buildNodePath(parentPath, key, false);
        const childKind = inferBattleFieldValueKind(entry);
        const children = buildBattleFieldTreeInternal(entry, path);
        return {
          key: path,
          path,
          segment: key,
          valueKind: childKind,
          preview: buildFieldPreview(entry, childKind),
          childCount: children.length,
          children,
        };
      });
  }

  return [];
}

export function buildBattleFieldTree(statData: Record<string, unknown>): BattleFieldTreeNode[] {
  return buildBattleFieldTreeInternal(statData);
}

export function createBattleSelectedFieldFromState(
  statData: Record<string, unknown>,
  path: string,
  source: BattleSelectedField['source'] = 'manual',
): BattleSelectedField {
  const normalizedPath = normalizeFieldPath(path);
  const value = _.get(statData, normalizedPath);
  const lastSegment = normalizedPath.match(/[^.[\]]+|\[\d+\]/gu)?.at(-1) ?? normalizedPath;
  const label = lastSegment.replace(/^\[/u, '').replace(/\]$/u, '') || normalizedPath;

  return {
    path: normalizedPath,
    label,
    enabled: true,
    source,
    reason: source === 'manual' ? '手动补选' : '',
    value_kind: inferBattleFieldValueKind(value),
  };
}

export function upsertBattleSelectedField(
  fields: BattleSelectedField[],
  nextField: BattleSelectedField,
): BattleSelectedField[] {
  const normalizedPath = normalizeFieldPath(nextField.path);
  const nextFields = klona(fields);
  const index = nextFields.findIndex(field => normalizeFieldPath(field.path) === normalizedPath);

  if (index >= 0) {
    nextFields[index] = {
      ...nextFields[index],
      ...nextField,
      path: normalizedPath,
    };
    return nextFields;
  }

  nextFields.push({
    ...nextField,
    path: normalizedPath,
  });
  return nextFields;
}

export function resolveBattleFieldSelectionState(
  selectedFields: BattleSelectedField[],
  path: string,
): 'included' | 'excluded' {
  const normalizedPath = normalizeFieldPath(path);
  const matchedField = selectedFields
    .filter(field => isSameOrAncestorPath(field.path, normalizedPath))
    .sort((lhs, rhs) => normalizeFieldPath(rhs.path).length - normalizeFieldPath(lhs.path).length)[0];

  return matchedField?.enabled ? 'included' : 'excluded';
}

export function hasIncludedBattleFieldAncestor(selectedFields: BattleSelectedField[], path: string): boolean {
  const normalizedPath = normalizeFieldPath(path);
  return selectedFields.some(
    field => field.enabled && normalizeFieldPath(field.path) !== normalizedPath && isSameOrAncestorPath(field.path, normalizedPath),
  );
}

export function removeBattleSelectedField(fields: BattleSelectedField[], path: string): BattleSelectedField[] {
  const normalizedPath = normalizeFieldPath(path);
  return fields.filter(field => normalizeFieldPath(field.path) !== normalizedPath);
}

export function extractSelectedBattleData(
  statData: Record<string, unknown>,
  selectedFields: BattleSelectedField[],
): BattleSelectedDataExtractionResult {
  const selectedData: Record<string, unknown> = {};
  const warnings: string[] = [];

  const normalizedFields = selectedFields
    .map(field => ({ ...field, path: normalizeFieldPath(field.path) }))
    .filter(field => field.path)
    .sort((lhs, rhs) => lhs.path.length - rhs.path.length);

  for (const field of normalizedFields) {
    if (!_.has(statData, field.path)) {
      warnings.push(`字段不存在：${field.path}`);
      continue;
    }
    if (field.enabled) {
      _.set(selectedData, field.path, klona(_.get(statData, field.path)));
    } else {
      _.unset(selectedData, field.path);
    }
  }

  return { selectedData, warnings };
}

export function buildUpdatedFieldSelectionConfig(
  fieldSelection: BattleFieldSelectionConfig,
  selectedFields: BattleSelectedField[],
  sourceDataHash = fieldSelection.source_data_hash,
): BattleFieldSelectionConfig {
  return {
    ...fieldSelection,
    selected_fields: selectedFields,
    source_data_hash: sourceDataHash,
    manual_review_required: false,
  };
}
