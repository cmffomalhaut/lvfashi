const boundedInteger = (min: number, max: number, fallback = min) =>
  z.coerce.number().transform(value => {
    const numeric = Number.isFinite(value) ? Math.round(value) : fallback;
    return _.clamp(numeric, min, max);
  });

const nonNegativeInteger = (fallback = 0) => boundedInteger(0, Number.MAX_SAFE_INTEGER, fallback);
const percentage = (fallback = 0) => boundedInteger(0, 100, fallback);
const trimmedString = (fallback = '') => z.string().transform(value => value.trim()).prefault(fallback);
const stringList = () => z.array(z.string()).prefault([]);

const 五维Schema = z
  .object({
    力量: percentage(10).prefault(10),
    敏捷: percentage(10).prefault(10),
    体质: percentage(10).prefault(10),
    感知: percentage(10).prefault(10),
    意志: percentage(10).prefault(10),
  })
  .prefault({});

const 状态效果Schema = z
  .object({
    名称: trimmedString().prefault('未命名状态'),
    时间: nonNegativeInteger().prefault(0),
    描述: trimmedString().prefault(''),
  })
  .prefault({});

const 消耗Schema = z
  .object({
    HP: nonNegativeInteger().prefault(0),
    MP: nonNegativeInteger().prefault(0),
    道具: z.record(z.string(), nonNegativeInteger()).prefault({}),
  })
  .prefault({});

const 技能Schema = z
  .object({
    id: trimmedString().prefault(''),
    名称: trimmedString().prefault('未命名技能'),
    稀有度: z.enum(['普通', '稀有', '史诗', '传说', '神话']).prefault('普通'),
    标签: stringList(),
    描述: trimmedString().prefault(''),
    消耗: 消耗Schema.prefault({}),
  })
  .prefault({});

const 装备Schema = z
  .object({
    名称: trimmedString().prefault(''),
    描述: trimmedString().prefault(''),
    标签: stringList(),
  })
  .prefault({});

const 单位Schema = z
  .object({
    id: trimmedString().prefault(''),
    名称: trimmedString().prefault('未命名单位'),
    五维: 五维Schema.prefault({}),
    HP当前: nonNegativeInteger(10).prefault(10),
    HP上限: nonNegativeInteger(10).prefault(10),
    MP当前: nonNegativeInteger().prefault(0),
    MP上限: nonNegativeInteger().prefault(0),
    护盾量: nonNegativeInteger().prefault(0),
    物攻: nonNegativeInteger(1).prefault(1),
    魔攻: nonNegativeInteger().prefault(0),
    物防: nonNegativeInteger().prefault(0),
    魔防: nonNegativeInteger().prefault(0),
    技能列表: z.record(z.string(), 技能Schema).prefault({}),
    状态效果: z.array(状态效果Schema).prefault([]),
    装备: z.record(z.string(), 装备Schema).prefault({}),
  })
  .prefault({});

const 旅法师Schema = z
  .object({
    当前火花阶段: trimmedString().prefault('火花初燃'),
    当前阶段进度: percentage().prefault(0),
    已锚定位面: z.record(z.string(), trimmedString()).prefault({}),
    已收录地印: z.record(z.string(), trimmedString()).prefault({}),
    半位面总数: nonNegativeInteger().prefault(0),
    已立界徽: z.record(z.string(), trimmedString()).prefault({}),
    激活卡牌上限: nonNegativeInteger(3).prefault(3),
    下一阶段: trimmedString().prefault('未定'),
    下一阶段条件: trimmedString().prefault('未定'),
    金钱: nonNegativeInteger().prefault(0),
  })
  .prefault({});

const 主角Schema = z
  .object({
    当前化身: 单位Schema.prefault({}),
    旅法师: 旅法师Schema.prefault({}),
  })
  .prefault({});

const 世界Schema = z
  .object({
    当前时间: trimmedString().prefault('07:00'),
    当前日期: trimmedString().prefault('未定'),
    当前位面: trimmedString().prefault('未定'),
    当前地点: trimmedString().prefault('未定'),
    当前天气: trimmedString().prefault('未定'),
    近期事务: z
      .preprocess(value => {
        if (value === null || value === undefined) {
          return {};
        }
        return typeof value === 'string' ? {} : value;
      }, z.record(z.string(), trimmedString()))
      .catch({})
      .prefault({}),
  })
  .prefault({});

const 背包物品Schema = z
  .object({
    id: trimmedString().prefault(''),
    名称: trimmedString().prefault('未命名物品'),
    数量: nonNegativeInteger(1).prefault(1),
    标签: stringList(),
    描述: trimmedString().prefault(''),
    效果: trimmedString().prefault(''),
  })
  .prefault({});

const 任务Schema = z
  .object({
    id: trimmedString().prefault(''),
    名称: trimmedString().prefault('未命名任务'),
    描述: trimmedString().prefault(''),
    目标: trimmedString().prefault(''),
    奖励: trimmedString().prefault(''),
    状态: z.enum(['未开始', '进行中', '已完成', '已失败']).prefault('未开始'),
  })
  .prefault({});

const 可见卡Schema = z
  .object({
    id: trimmedString().prefault(''),
    名称: trimmedString().prefault('未命名卡牌'),
    描述: trimmedString().prefault(''),
    标签: stringList(),
  })
  .prefault({});

export const PendingPreviewSchema = z
  .object({
    summary: trimmedString().prefault(''),
    proposed_world_events: z.record(z.string(), trimmedString()).prefault({}),
    proposed_combatants: z
      .object({
        allies: z.record(z.string(), 单位Schema).prefault({}),
        enemies: z.record(z.string(), 单位Schema).prefault({}),
      })
      .prefault({}),
    proposed_loot: z.record(z.string(), 背包物品Schema).prefault({}),
  })
  .prefault({});

export const PrebattleSnapshotSchema = z
  .object({
    source_message_id: boundedInteger(-1, Number.MAX_SAFE_INTEGER, -1).prefault(-1),
    世界: 世界Schema.prefault({}),
    主角: 主角Schema.prefault({}),
    队伍: z.record(z.string(), 单位Schema).prefault({}),
    敌方: z.record(z.string(), 单位Schema).prefault({}),
    背包: z.record(z.string(), 背包物品Schema).prefault({}),
    任务: z.record(z.string(), 任务Schema).prefault({}),
    当前可见卡: z.record(z.string(), 可见卡Schema).prefault({}),
  })
  .prefault({});

export const PlayerCheckSchema = z
  .object({
    strategy_text: trimmedString().prefault(''),
    roll: boundedInteger(0, 20, 0).prefault(0),
    reroll_used: boundedInteger(0, 99, 0).prefault(0),
    confirmed: z.boolean().prefault(false),
  })
  .prefault({});

const BattlePhaseSchema = z.enum([
  'idle',
  'initiative',
  'player_input',
  'player_roll',
  'ai_resolve',
  'preview',
  'finished',
  'aborted',
]);

const ActingSideSchema = z.enum(['无', '玩家方', '敌方', '中立']);

const BattleRoundSchema = z
  .object({
    round_no: nonNegativeInteger().prefault(0),
    acting_side: ActingSideSchema.prefault('无'),
  })
  .prefault({});

const SharedDarkPoolSchema = z
  .object({
    values: z.array(boundedInteger(1, 20, 1)).prefault([]),
    cursor: nonNegativeInteger().prefault(0),
  })
  .prefault({});

const BattleRuntimeSettlementSchema = z
  .object({
    mode: z.enum(['no_loot', 'direct_loot', 'checked_loot']).prefault('no_loot'),
    mvu_commit_ready: z.boolean().prefault(false),
    loot_ready: z.boolean().prefault(false),
    loot_context: z.record(z.string(), z.unknown()).prefault({}),
    check_prompt_needed: z.boolean().prefault(false),
  })
  .prefault({});

const BattleRuntimeTranscriptEntrySchema = z
  .object({
    id: trimmedString().prefault(''),
    role: z.enum(['system', 'player', 'ai']).prefault('system'),
    label: trimmedString().prefault(''),
    content: trimmedString().prefault(''),
    created_at: z.coerce.number().transform(value => (Number.isFinite(value) ? value : 0)).prefault(0),
  })
  .prefault({});

export const BattleRuntimeStateSchema = z
  .object({
    last_result_type: z.enum(['none', 'round', 'full_battle', 'loot']).prefault('none'),
    latest_summary: trimmedString().prefault(''),
    latest_narration: trimmedString().prefault(''),
    latest_battle_report: trimmedString().prefault(''),
    latest_battle_end: z.boolean().prefault(false),
    latest_battle_end_reason: trimmedString().prefault(''),
    latest_status_changes: z.array(trimmedString()).prefault([]),
    latest_resource_changes: z.array(trimmedString()).prefault([]),
    latest_warnings: z.array(trimmedString()).prefault([]),
    accumulated_updates: z.record(z.string(), z.unknown()).prefault({}),
    history: z.array(z.object({
      round_no: z.number().prefault(0),
      type: z.enum(['round', 'full_battle', 'loot']).prefault('round'),
      summary: trimmedString().prefault(''),
      narration: trimmedString().prefault(''),
    })).prefault([]),
    settlement: BattleRuntimeSettlementSchema.prefault({}),
    transcript: z.array(BattleRuntimeTranscriptEntrySchema).prefault([]),
  })
  .prefault({});

const BattleCombatantsSchema = z
  .object({
    allies: z.record(z.string(), 单位Schema).prefault({}),
    enemies: z.record(z.string(), 单位Schema).prefault({}),
  })
  .prefault({});

export const RoundCheckpointSchema = z
  .object({
    phase: BattlePhaseSchema.prefault('idle'),
    round: BattleRoundSchema.prefault({}),
    player_check: PlayerCheckSchema.prefault({}),
    shared_dark_pool: SharedDarkPoolSchema.prefault({}),
    combatants: BattleCombatantsSchema.prefault({}),
    pending_preview: PendingPreviewSchema.prefault({}),
    runtime: BattleRuntimeStateSchema.prefault({}),
  })
  .prefault({});

export const BattleSessionSchema = z
  .object({
    激活: z.boolean().prefault(false),
    meta: z
      .object({
        source_message_id: boundedInteger(-1, Number.MAX_SAFE_INTEGER, -1).prefault(-1),
        mode: z.enum(['empty', 'resume', 'rebuild']).prefault('empty'),
        hero_ally_id: trimmedString().prefault(''),
        created_at: z.coerce.number().transform(value => (Number.isFinite(value) ? value : 0)).prefault(0),
        updated_at: z.coerce.number().transform(value => (Number.isFinite(value) ? value : 0)).prefault(0),
      })
      .prefault({}),
    phase: BattlePhaseSchema.prefault('idle'),
    round: BattleRoundSchema.prefault({}),
    player_check: PlayerCheckSchema.prefault({}),
    shared_dark_pool: SharedDarkPoolSchema.prefault({}),
    combatants: BattleCombatantsSchema.prefault({}),
    prebattle_snapshot: PrebattleSnapshotSchema.prefault({}),
    pending_preview: PendingPreviewSchema.prefault({}),
    runtime: BattleRuntimeStateSchema.prefault({}),
    round_checkpoint: RoundCheckpointSchema.prefault({}),
    output_mode: z.enum(['summary_only', 'full_log']).prefault('summary_only'),
  })
  .prefault({});

const RootSchema = z.object({
  世界: 世界Schema.prefault({}),
  主角: 主角Schema.prefault({}),
  队伍: z.record(z.string(), 单位Schema).prefault({}),
  敌方: z.record(z.string(), 单位Schema).prefault({}),
  背包: z.record(z.string(), 背包物品Schema).prefault({}),
  任务: z.record(z.string(), 任务Schema).prefault({}),
  当前可见卡: z.record(z.string(), 可见卡Schema).prefault({}),
  battle_session: BattleSessionSchema.prefault({}),
});

export const MainStateSchema = RootSchema.omit({ battle_session: true }).prefault({});
export const Schema = RootSchema.prefault({});
export type MainState = z.output<typeof MainStateSchema>;
export type BattleSession = z.output<typeof BattleSessionSchema>;
export type Schema = z.output<typeof Schema>;
