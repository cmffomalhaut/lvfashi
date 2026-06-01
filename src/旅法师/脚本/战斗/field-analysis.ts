import { parseString } from '../../../../util/common.ts';
import {
  type BattleApiProfile,
  type BattleFieldAnalysisPayload,
  type BattleFieldAnalysisResult,
  type BattleFieldSelectionConfig,
  type BattleFieldSuggestion,
  type BattleProfile,
  type BattlePromptTemplate,
  type BattleSelectedField,
} from './ai-profile.ts';
import { BattleAiParseError, requestBattleChatCompletion } from './api-client.ts';

const BattleFieldSuggestionSchema = z
  .object({
    path: z.string().transform(value => value.trim()).catch('').prefault(''),
    label: z.string().transform(value => value.trim()).catch('').prefault(''),
    reason: z.string().transform(value => value.trim()).catch('').prefault(''),
  })
  .prefault({});

const BattleFieldAnalysisResultSchema = z
  .object({
    fields: z.array(BattleFieldSuggestionSchema).catch([]).prefault([]),
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
  .prefault({});

export type BattleFieldAnalysisExecutionResult = {
  payload: BattleFieldAnalysisPayload;
  result: BattleFieldAnalysisResult;
  fieldSelection: BattleFieldSelectionConfig;
  rawText: string;
};

function buildFieldAnalysisSystemPrompt(): string {
  return [
    '你是战斗字段分析器。',
    '你的任务是根据战斗协议和当前 stat_data，挑出正式战斗请求必须观察或可能回写的字段路径。',
    '必须遵守：',
    '1. 只关注战斗判定、资源变化、状态变化、战利品结算直接相关的字段。',
    '2. 优先最小必要字段集，不要把无关设定、纯背景文本或 battle_session 带进去。',
    '3. path 使用 stat_data 内部路径，不要带最外层 stat_data. 前缀。',
    '4. 若某些关键字段名称不明确，可在 warnings 里提醒玩家人工补查。',
    '5. 只能返回 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildFieldAnalysisUserPrompt(): string {
  return [
    '请分析下面的战斗字段请求，返回推荐字段列表。',
    '若你判断某条战斗协议需要观察 HP、MP、护盾、状态、背包、敌方单位等信息，请明确列出路径。',
    '若不同 run_mode 对字段依赖不同，也请按当前 run_mode 保守裁定。',
  ].join('\n');
}

function buildFieldAnalysisOutputContractPrompt(): string {
  return [
    '返回 JSON 结构：',
    '{',
    '  "fields": [{ "path": "主角.当前化身.HP当前", "label": "主角当前 HP", "reason": "..." }],',
    '  "warnings": ["..."]',
    '}',
    '要求：fields 和 warnings 必须始终存在。',
  ].join('\n');
}

function resolvePromptContent(prompt: BattlePromptTemplate) {
  if (!prompt.enabled) {
    throw new Error('字段分析 Prompt 已禁用，请先在 Prompt 配置中启用');
  }

  return {
    systemPrompt: prompt.system_prompt.trim() || buildFieldAnalysisSystemPrompt(),
    userPrompt: prompt.user_prompt.trim() || buildFieldAnalysisUserPrompt(),
    outputContractPrompt: prompt.output_contract_prompt.trim() || buildFieldAnalysisOutputContractPrompt(),
  };
}

function normalizeFieldPath(path: string): string {
  return path.replace(/^stat_data\./u, '').replace(/^\.+/u, '').trim();
}

function inferFieldLabel(path: string): string {
  const normalizedPath = normalizeFieldPath(path);
  if (!normalizedPath) {
    return '未命名字段';
  }
  const segments = normalizedPath.split('.');
  return segments[segments.length - 1] || normalizedPath;
}

function createAnalysisInputHash(payload: BattleFieldAnalysisPayload): string {
  const source = JSON.stringify({
    run_mode: payload.run_mode,
    battle_protocol: payload.battle_protocol,
    stat_data: payload.stat_data,
    worldbook_context: payload.worldbook_context,
    extra_instructions: payload.extra_instructions,
  });

  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33 + source.charCodeAt(index)) >>> 0;
  }
  return `fa-${hash.toString(16)}`;
}

function normalizeFieldSuggestions(fields: BattleFieldSuggestion[]): BattleSelectedField[] {
  const usedPaths = new Set<string>();

  return fields.flatMap(field => {
    const normalizedPath = normalizeFieldPath(field.path);
    if (!normalizedPath || usedPaths.has(normalizedPath)) {
      return [];
    }

    usedPaths.add(normalizedPath);
    return [
      {
        path: normalizedPath,
        label: field.label.trim() || inferFieldLabel(normalizedPath),
        enabled: true,
        source: 'ai' as const,
        reason: field.reason.trim(),
        value_kind: 'unknown' as const,
      },
    ];
  });
}

export function buildBattleFieldAnalysisPayload(
  battleProfile: BattleProfile,
  statData: Record<string, unknown>,
): BattleFieldAnalysisPayload {
  if (!battleProfile.rules.allow_full_stat_data_in_analysis) {
    throw new Error('当前战斗配置禁止在字段分析阶段发送完整 stat_data');
  }

  return {
    task: 'analyze_battle_fields',
    run_mode: battleProfile.run_mode,
    battle_protocol: battleProfile.rules.battle_protocol.trim(),
    stat_data: _.omit(statData, 'battle_session') as Record<string, unknown>,
    worldbook_context: [],
    extra_instructions: battleProfile.context.extra_context_text.trim(),
  };
}

export async function analyzeBattleFields(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  statData: Record<string, unknown>,
): Promise<BattleFieldAnalysisExecutionResult> {
  const payload = buildBattleFieldAnalysisPayload(battleProfile, statData);
  const promptContent = resolvePromptContent(battleProfile.prompts.field_analysis);
  const completion = await requestBattleChatCompletion(
    apiProfile,
    [
      { role: 'system', content: promptContent.systemPrompt },
      {
        role: 'user',
        content: [
          promptContent.userPrompt,
          '',
          'field_analysis_payload=',
          JSON.stringify(payload, null, 2),
          '',
          promptContent.outputContractPrompt,
        ].join('\n'),
      },
    ],
    {
      responseFormat: 'json_object',
      maxTokens: apiProfile.default_request_options.max_tokens,
      temperature: 0,
      topP: 1,
    },
  );

  let parsed: BattleFieldAnalysisResult;
  try {
    parsed = BattleFieldAnalysisResultSchema.parse(parseString(completion.text), { reportInput: true });
  } catch (error) {
    throw new BattleAiParseError(
      error instanceof Error ? `字段分析结果解析失败：${error.message}` : '字段分析结果解析失败',
      {
        rawText: completion.text,
        responseData: completion.data,
        payload,
        cause: error,
      },
    );
  }
  const normalizedFields = normalizeFieldSuggestions(parsed.fields);

  return {
    payload,
    result: {
      fields: normalizedFields.map(field => ({
        path: field.path,
        label: field.label,
        reason: field.reason,
      })),
      warnings: parsed.warnings,
    },
    fieldSelection: {
      selected_fields: normalizedFields,
      analysis_warnings: parsed.warnings,
      last_analysis_input_hash: createAnalysisInputHash(payload),
      last_analysis_at: Date.now(),
      manual_review_required: true,
    },
    rawText: completion.text,
  };
}
