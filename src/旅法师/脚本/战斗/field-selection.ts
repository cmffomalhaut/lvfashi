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

export function extractSelectedBattleData(
  statData: Record<string, unknown>,
  selectedFields: BattleSelectedField[],
): BattleSelectedDataExtractionResult {
  const selectedData: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const field of selectedFields) {
    if (!field.enabled) {
      continue;
    }

    const normalizedPath = normalizeFieldPath(field.path);
    if (!normalizedPath) {
      continue;
    }

    if (!_.has(statData, normalizedPath)) {
      warnings.push(`字段不存在：${normalizedPath}`);
      continue;
    }

    _.set(selectedData, normalizedPath, klona(_.get(statData, normalizedPath)));
  }

  return { selectedData, warnings };
}

export function buildUpdatedFieldSelectionConfig(
  fieldSelection: BattleFieldSelectionConfig,
  selectedFields: BattleSelectedField[],
): BattleFieldSelectionConfig {
  return {
    ...fieldSelection,
    selected_fields: selectedFields,
    manual_review_required: false,
  };
}
