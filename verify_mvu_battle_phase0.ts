/* eslint-disable import-x/no-nodejs-modules */
import assert from 'node:assert/strict';
import lodash from 'lodash';
import * as zod from 'zod';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;
(globalThis as typeof globalThis & { z: typeof zod }).z = zod;

async function main() {
  const { createMemoryStateAccess, createStateAccess, projectMainState } = await import('./src/旅法师/脚本/MVU/state-access.ts');
  const { BattleSessionSchema, Schema } = await import('./src/旅法师/schema.ts');
  const { createBattleSessionController } = await import('./src/旅法师/脚本/战斗/session.ts');
  const { buildBattleRoundPrompt, buildNormalPromptPayload } = await import('./src/旅法师/脚本/战斗/prompt.ts');

  const parsed = Schema.parse({
    世界: { 当前时间: '08:00', 当前日期: '第一日', 当前位面: '测试位面', 当前地点: '营地', 当前天气: '晴' },
    主角: { 当前化身: { id: 'hero', 名称: '主角', HP当前: 10, HP上限: 10 } },
    队伍: { ally: { id: 'ally', 名称: '队友', HP当前: 7, HP上限: 10 } },
    敌方: { slime: { id: 'slime', 名称: '史莱姆', HP当前: 3, HP上限: 3 } },
    背包: {},
    任务: {},
    当前可见卡: {},
    battle_session: { 激活: true, meta: { source_message_id: 7, mode: 'resume' } },
  });

  const reparsed = Schema.parse(parsed);
  assert.deepEqual(reparsed, parsed, 'Schema.parse must be idempotent for canonical state');
  assert.equal(reparsed.battle_session.激活, true, 'battle_session should survive canonical reparse');

  const memory = createMemoryStateAccess(parsed, 7);
  const controller = createBattleSessionController(memory, async session => ({
    summary: `AI结算：${session.player_check.strategy_text}`,
    proposed_world_events: {
      [`battle_round_${session.round.round_no}`]: `AI完成第${session.round.round_no}回合`,
    },
    proposed_combatants: lodash.cloneDeep(session.combatants),
    proposed_loot: {},
  }));

  const mainEdit = await memory.editMainState({
    sourceMessageId: 7,
    mutate: draft => {
      draft.世界.当前地点 = '测试新地点';
      draft.队伍.newAlly = { id: 'newAlly', 名称: '新队友', HP当前: 2, HP上限: 5 };
    },
  });
  assert.equal(mainEdit.ok, true, 'main-state transaction should succeed');
  assert.equal(memory.readBattleSession().meta.source_message_id, 7, 'main-state transaction must retain battle_session');

  const battleEdit = await memory.editBattleSession({
    sourceMessageId: 7,
    mutate: draft => {
      draft.激活 = true;
      draft.meta.source_message_id = 7;
      draft.round.acting_side = '敌方';
    },
  });
  assert.equal(battleEdit.ok, true, 'battle transaction should succeed');
  assert.equal(memory.readMainState().世界.当前地点, '测试新地点', 'battle transaction must retain main-state projection');

  const dirtyFailureMemory = createMemoryStateAccess(parsed, 7);
  const beforeDirtyFailure = dirtyFailureMemory.readCanonicalState();
  const dirtyFailure = await dirtyFailureMemory.editCanonicalState({
    sourceMessageId: 7,
    mutate: draft => {
      draft.世界.当前地点 = '不应写入';
    },
    postCheck: () => false,
    postCheckMessage: 'forced post-check failure',
  });
  assert.deepEqual(dirtyFailure, {
    ok: false,
    reason: 'post_check_failed',
    message: 'forced post-check failure',
    attempt: 0,
  });
  assert.deepEqual(dirtyFailureMemory.readCanonicalState(), beforeDirtyFailure, 'post-check failure must not leave dirty state');

  const started = await controller.startBattle(7);
  assert.equal(started.ok, true, 'battle start should succeed');
  assert.equal(memory.readBattleSession().prebattle_snapshot.source_message_id, 7, 'start should snapshot current layer id');
  assert.equal(memory.readBattleSession().round_checkpoint.round.round_no, 1, 'start should create committed round checkpoint');

  await assert.rejects(
    () => controller.applyPendingPreview(7),
    /resolved preview before apply/,
    'invalid apply should reject without advancing round',
  );
  assert.equal(memory.readBattleSession().round.round_no, 1, 'invalid apply must not advance round');

  const resumed = await controller.resumeOrRebuild(7);
  assert.equal(resumed.kind, 'resume', 'same-layer reopen should resume');

  await controller.setStrategyText(7, '先观察敌人');
  const rolled = await controller.rerollPlayerCheck(7);
  assert.equal(rolled.ok, true, 'reroll should succeed');
  const resumedAfterDirtyClose = await controller.resumeOrRebuild(7);
  assert.equal(resumedAfterDirtyClose.kind, 'resume', 'same-layer reopen should stay in resume path');
  assert.equal(memory.readBattleSession().player_check.strategy_text, '', 'mid-round reopen should rollback uncommitted strategy');
  assert.equal(memory.readBattleSession().player_check.reroll_used, 0, 'mid-round reopen should rollback reroll progress');

  await controller.setStrategyText(7, '集中攻击史莱姆');
  await controller.confirmPlayerCheck(7);
  assert.equal(memory.readBattleSession().phase, 'preview', 'confirm should resolve into preview phase');
  assert.notEqual(memory.readBattleSession().pending_preview.summary, '', 'confirm should create pending preview');
  const battlePrompt = buildBattleRoundPrompt(memory.readBattleSession());
  assert.equal(battlePrompt.玩家策略, '集中攻击史莱姆', 'battle prompt should carry confirmed strategy only');
  assert.equal(
    Object.prototype.hasOwnProperty.call(buildNormalPromptPayload(memory.readMainState()), 'battle_session'),
    false,
    'normal prompt payload must exclude battle_session',
  );

  const interleavedState = Schema.parse(parsed);
  let interleavedVariables = { stat_data: interleavedState };
  let injected = false;
  const interleavedAccess = createStateAccess({
    readVariables: () => lodash.cloneDeep(interleavedVariables),
    writeVariables: async updater => {
      if (!injected) {
        injected = true;
        interleavedVariables.stat_data.battle_session = BattleSessionSchema.parse({
          激活: true,
          meta: { source_message_id: 7, mode: 'resume' },
          round: { round_no: 9, acting_side: '玩家方' },
        });
      }
      const next = await updater(lodash.cloneDeep(interleavedVariables));
      interleavedVariables = lodash.cloneDeep(next);
      return interleavedVariables;
    },
    resolveLatestMessageId: () => 7,
  });
  const interleavedMainEdit = await interleavedAccess.editMainState({
    sourceMessageId: 7,
    mutate: draft => {
      draft.世界.当前地点 = '交错写入后地点';
    },
  });
  assert.equal(interleavedMainEdit.ok, true, 'interleaved main mutation should succeed');
  assert.equal(interleavedAccess.readBattleSession().round.round_no, 9, 'main writer must preserve interleaved battle branch');
  assert.equal(interleavedAccess.readMainState().世界.当前地点, '交错写入后地点', 'main writer should still apply own branch');

  memory.setLatestMessageId(8);
  const rebuilt = await controller.resumeOrRebuild(8);
  assert.equal(rebuilt.kind, 'rebuild', 'cross-layer reopen should rebuild');
  assert.equal(memory.readBattleSession().meta.source_message_id, 8, 'rebuild should bind to latest layer id');

  const scopeGuardFailure = await memory.editBattleSession({
    sourceMessageId: 7,
    mutate: draft => {
      draft.round.round_no = 99;
    },
  });
  assert.deepEqual(scopeGuardFailure, {
    ok: false,
    reason: 'scope_guard_failed',
    message: 'source_message_id mismatch',
    attempt: 0,
  });

  const inactiveMemory = createMemoryStateAccess(
    Schema.parse({
      世界: { 当前地点: '营地' },
      主角: { 当前化身: { id: 'hero', 名称: '主角' } },
      敌方: { goblin: { id: 'goblin', 名称: '哥布林', HP当前: 1, HP上限: 1 } },
    }),
    30,
  );
  const inactiveController = createBattleSessionController(inactiveMemory, async session => ({
    summary: '不会使用',
    proposed_world_events: {},
    proposed_combatants: lodash.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  await assert.rejects(() => inactiveController.abandonBattle(30), /battle_session is not active/, 'inactive abandon should reject');

  await controller.setStrategyText(8, '终局测试');
  await assert.rejects(
    () =>
      controller.commitBattle({
        sourceMessageId: 8,
        summary: '未完成不能提交',
      }),
    /finished phase/,
    'terminal commit should reject unfinished battle session',
  );

  await controller.mockPreview(8);
  await memory.editBattleSession({
    sourceMessageId: 8,
    mutate: draft => {
      draft.pending_preview.proposed_world_events.victory = '战斗胜利，敌人被清除。';
      draft.pending_preview.proposed_loot.core = {
        id: 'core',
        名称: '史莱姆核心',
        数量: 1,
        标签: ['素材'],
        描述: '黏糊糊的核心',
        效果: '可出售',
      };
      draft.pending_preview.proposed_combatants.allies[draft.meta.hero_ally_id].HP当前 = 8;
    },
  });
  const finished = await controller.finishBattle(8);
  assert.equal(finished.ok, true, 'finish transition should succeed');
  assert.equal(memory.readBattleSession().phase, 'finished', 'finish transition should set finished phase');
  const committed = await controller.commitBattle({
    sourceMessageId: 8,
    summary: '战斗胜利',
    fullLog: '完整战斗记录',
    outputMode: 'summary_only',
  });
  assert.equal(committed.ok, true, 'battle terminal commit should succeed');
  assert.deepEqual(memory.readBattleSession(), BattleSessionSchema.parse({}), 'terminal commit should clear battle_session');
  assert.equal(Object.keys(memory.readMainState().敌方).length, 0, 'terminal commit should clear hot enemy roster');
  assert.equal(memory.readMainState().主角.当前化身.HP当前, 8, 'terminal commit should merge hero battle state back');
  assert.equal(memory.readMainState().背包.core?.数量, 1, 'terminal commit should merge proposed loot into backpack');
  assert.ok(
    Object.values(memory.readMainState().世界.近期事务).some(value => value.includes('战斗胜利')),
    'terminal commit should write battle summary into recent events',
  );

  const restarted = await controller.startBattle(8);
  assert.equal(restarted.ok, true, 'battle should restart after terminal commit');
  await controller.abandonBattle(8);
  assert.deepEqual(memory.readBattleSession(), BattleSessionSchema.parse({}), 'abandon should clear battle_session');
  assert.equal(memory.readMainState().世界.当前地点, '测试新地点', 'abandon should restore the latest prebattle snapshot state');

  const retryMemory = createMemoryStateAccess(parsed, 11);
  const failingController = createBattleSessionController(retryMemory, async () => {
    throw new Error('resolver boom');
  });
  await failingController.startBattle(11);
  await failingController.setStrategyText(11, '失败后重试');
  await assert.rejects(() => failingController.confirmPlayerCheck(11), /resolver boom/, 'ai resolver failure should surface');
  assert.equal(retryMemory.readBattleSession().phase, 'player_input', 'resolver failure should reset phase for retry');
  assert.equal(retryMemory.readBattleSession().player_check.confirmed, true, 'resolver failure should preserve confirmed roll');
  assert.equal(retryMemory.readBattleSession().pending_preview.summary, '', 'resolver failure should clear stale preview');

  const recoveryController = createBattleSessionController(retryMemory, async session => ({
    summary: `恢复成功：${session.player_check.strategy_text}`,
    proposed_world_events: { recovery: 'AI 恢复成功' },
    proposed_combatants: lodash.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  const retried = await recoveryController.resolveConfirmedRound(11);
  assert.equal(retried.ok, true, 'resolveAgain should succeed after earlier resolver failure');
  assert.equal(retryMemory.readBattleSession().phase, 'preview', 'successful retry should enter preview phase');
  assert.match(retryMemory.readBattleSession().pending_preview.summary, /恢复成功/, 'retry should write new preview summary');

  const summaryOnlyMemory = createMemoryStateAccess(parsed, 12);
  const summaryOnlyController = createBattleSessionController(summaryOnlyMemory, async () => ({
    summary: '只有摘要',
    proposed_world_events: {},
    proposed_combatants: { allies: {}, enemies: {} },
    proposed_loot: {},
  }));
  await summaryOnlyController.startBattle(12);
  await summaryOnlyController.setStrategyText(12, '摘要失败');
  await assert.rejects(
    () => summaryOnlyController.confirmPlayerCheck(12),
    /no combatants/,
    'summary-only preview failure should reject missing combatants',
  );
  assert.equal(summaryOnlyMemory.readBattleSession().phase, 'player_input', 'summary-only preview failure should reset phase');
  assert.equal(
    Object.keys(summaryOnlyMemory.readBattleSession().combatants.allies).length > 0,
    true,
    'summary-only preview failure should retain pre-resolve combatants',
  );

  const emptyHeroState = Schema.parse({
    世界: { 当前地点: '营地' },
    主角: { 当前化身: { id: '', 名称: '无 id 主角', HP当前: 6, HP上限: 10 } },
    队伍: {
      allyA: { id: 'allyA', 名称: '队友A', HP当前: 4, HP上限: 10 },
      allyB: { id: 'allyB', 名称: '队友B', HP当前: 5, HP上限: 10 },
    },
    敌方: { wolf: { id: 'wolf', 名称: '狼', HP当前: 3, HP上限: 3 } },
  });
  const emptyHeroMemory = createMemoryStateAccess(emptyHeroState, 21);
  const emptyHeroController = createBattleSessionController(emptyHeroMemory, async session => ({
    summary: '空 hero id 测试',
    proposed_world_events: {},
    proposed_combatants: lodash.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  await emptyHeroController.startBattle(21);
  await emptyHeroMemory.editBattleSession({
    sourceMessageId: 21,
    mutate: draft => {
      draft.phase = 'finished';
      draft.combatants.allies.allyA.HP当前 = 1;
    },
  });
  const emptyHeroCommitted = await emptyHeroController.commitBattle({
    sourceMessageId: 21,
    summary: '空 hero id 测试',
  });
  assert.equal(emptyHeroCommitted.ok, true, 'commit should still succeed when hero id is empty');
  assert.equal(emptyHeroMemory.readMainState().主角.当前化身.名称, '无 id 主角', 'empty hero id must not promote teammate to hero');
  assert.equal(emptyHeroMemory.readMainState().队伍.allyA?.HP当前, 1, 'team should remain in 队伍 after commit when hero id is empty');

  console.log('verify_mvu_battle_phase0: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
