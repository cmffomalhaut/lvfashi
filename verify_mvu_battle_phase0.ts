/* eslint-disable import-x/no-nodejs-modules */
import assert from 'node:assert/strict';
import _ from 'lodash';
import * as zod from 'zod';

globalThis._ = _;
globalThis.z = zod;

async function main() {
  const { createMemoryStateAccess, projectMainState } = await import('./src/????????/MVU/state-access.ts');
  const { BattleSessionSchema, Schema } = await import('./src/?????schema.ts');
  const { createBattleSessionController } = await import('./src/????????/???/session.ts');
  const { buildBattleRoundPrompt, buildNormalPromptPayload } = await import('./src/????????/???/prompt.ts');

  const parsed = Schema.parse({
    ???: { ??????: '08:00', ??????: '?????, ??????: '????????, ??????: '???', ??????: '?? },
    ???: { ??????: { id: 'hero', ???: '????? } },
    ???: { slime: { id: 'slime', ???: '????? } },
    battle_session: { ???? true, meta: { source_message_id: 7, mode: 'resume' } },
  });
  const reparsed = Schema.parse(parsed);
  assert.deepEqual(reparsed, parsed, 'Schema.parse must be idempotent for canonical state');
  assert.equal(reparsed.battle_session.???? true, 'battle_session should survive canonical reparse');

  const memory = createMemoryStateAccess(parsed, 7);
  const controller = createBattleSessionController(memory, async session => ({
    summary: `AI?????{session.player_check.strategy_text}`,
    proposed_world_events: {
      [`battle_round_${session.round.round_no}`]: `AI?????{session.round.round_no}???`,
    },
    proposed_combatants: _.cloneDeep(session.combatants),
    proposed_loot: {},
  }));

  const mainEdit = await memory.editMainState({
    sourceMessageId: 7,
    mutate: draft => {
      draft.???.?????? = '?????;
      draft.???.??? = { id: '???', ???: '???', ???: 2, ???: ['?????'], ???: '???', ???: '???' };
    },
  });
  assert.equal(mainEdit.ok, true, 'main-state transaction should succeed');
  assert.equal(memory.readBattleSession().meta.source_message_id, 7, 'main-state transaction must retain battle_session');

  const battleEdit = await memory.editBattleSession({
    sourceMessageId: 7,
    mutate: draft => {
      draft.????= true;
      draft.round.round_no = 2;
      draft.round.acting_side = '???';
    },
  });
  assert.equal(battleEdit.ok, true, 'battle transaction should succeed');
  assert.equal(memory.readMainState().???.??????, '?????, 'battle transaction must retain main-state projection');

  const started = await controller.startBattle(7);
  assert.equal(started.ok, true, 'battle start should succeed');
  assert.equal(memory.readBattleSession().prebattle_snapshot.source_message_id, 7, 'start should snapshot current layer id');
  assert.equal(memory.readBattleSession().round_checkpoint.round.round_no, 1, 'start should create committed round checkpoint');
  await assert.rejects(
    () => controller.applyPendingPreview(7),
    /resolved preview before apply/,
    'apply should reject when preview has not been resolved yet',
  );
  assert.equal(memory.readBattleSession().round.round_no, 1, 'invalid apply must not advance round');

  const resumed = await controller.resumeOrRebuild(7);
  assert.equal(resumed.kind, 'resume', 'same-layer reopen should resume');

  await controller.setStrategyText(7, '??????');
  const rolled = await controller.rerollPlayerCheck(7);
  assert.equal(rolled.ok, true, 'reroll should succeed');
  const resumedAfterDirtyClose = await controller.resumeOrRebuild(7);
  assert.equal(resumedAfterDirtyClose.kind, 'resume', 'same-layer reopen should stay in resume path');
  assert.equal(memory.readBattleSession().player_check.strategy_text, '', 'mid-round reopen should rollback uncommitted strategy');
  assert.equal(memory.readBattleSession().player_check.reroll_used, 0, 'mid-round reopen should rollback reroll progress');

  await controller.setStrategyText(7, '????????);
  await controller.confirmPlayerCheck(7);
  assert.notEqual(memory.readBattleSession().pending_preview.summary, '', 'confirm should create pending preview');
  const battlePrompt = buildBattleRoundPrompt(memory.readBattleSession());
  assert.equal(battlePrompt.??????, '????????, 'battle prompt should carry confirmed strategy only');
  assert.equal(
    Object.prototype.hasOwnProperty.call(buildNormalPromptPayload(memory.readMainState()), 'battle_session'),
    false,
    'normal prompt payload must exclude battle_session',
  );

  const beforeProjection = projectMainState(memory.readCanonicalState());
  const concurrentLikeBattleEdit = await memory.editBattleSession({
    sourceMessageId: 7,
    mutate: draft => {
      draft.round.round_no = 3;
      draft.meta.updated_at = 123456;
    },
  });
  assert.equal(concurrentLikeBattleEdit.ok, true, 'battle mutation should succeed');

  const concurrentLikeMainEdit = await memory.editMainState({
    sourceMessageId: 7,
    mutate: draft => {
      draft.???.main = {
        id: 'main',
        ???: '??????',
        ???: '????????????',
        ???: '??? battle_session',
        ???: '??????',
        ???? '?????,
      };
    },
  });
  assert.equal(concurrentLikeMainEdit.ok, true, 'follow-up main mutation should succeed');
  assert.deepEqual(projectMainState(memory.readCanonicalState()).???, beforeProjection.???, 'unrelated main-state fields should stay intact');
  assert.equal(memory.readBattleSession().round.round_no, 3, 'sequential writer safety should preserve battle branch');

  memory.setLatestMessageId(8);
  const rebuilt = await controller.resumeOrRebuild(8);
  assert.equal(rebuilt.kind, 'rebuild', 'cross-layer reopen should rebuild');
  assert.equal(memory.readBattleSession().meta.source_message_id, 8, 'rebuild should bind to latest layer id');

  const scopeGuardFailure = await memory.editBattleSession({
    sourceMessageId: 999,
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
      ???: { ??????: '????? },
      ???: { ??????: { id: 'hero', ???: '????? } },
      ???: { ???: { id: '???', ???: '???', ???: 1, ???: [], ???: '', ???: '' } },
    }),
    30,
  );
  const inactiveController = createBattleSessionController(inactiveMemory, async session => ({
    summary: session.player_check.strategy_text,
    proposed_world_events: {},
    proposed_combatants: _.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  await assert.rejects(() => inactiveController.abandonBattle(30), /battle_session is not active/, 'inactive abandon should reject');

  await controller.setStrategyText(8, '??????');
  await controller.confirmPlayerCheck(8);
  await assert.rejects(
    () =>
      controller.commitBattle({
        sourceMessageId: 8,
        summary: '??????',
      }),
    /finished phase/,
    'terminal commit should reject unfinished battle session',
  );
  await memory.editBattleSession({
    sourceMessageId: 8,
    mutate: draft => {
      draft.phase = 'finished';
      draft.output_mode = 'full_log';
      draft.pending_preview.proposed_world_events.victory = '???????????????;
      draft.pending_preview.proposed_loot.core = {
        id: 'core',
        ???: '????????,
        ???: 1,
        ???: ['?????],
        ???: '????????',
        ???: '???????????,
      };
      draft.combatants.allies.hero.HP??? = 8;
    },
  });
  const committed = await controller.commitBattle({
    sourceMessageId: 8,
    summary: '??????',
    fullLog: '?????????',
    outputMode: 'full_log',
  });
  assert.equal(committed.ok, true, 'battle terminal commit should succeed');
  assert.deepEqual(memory.readBattleSession(), BattleSessionSchema.parse({}), 'terminal commit should clear battle_session');
  assert.equal(Object.keys(memory.readMainState().???).length, 0, 'terminal commit should clear hot enemy roster');
  assert.equal(memory.readMainState().???.??????.HP???, 8, 'terminal commit should merge hero battle state back');
  assert.equal(memory.readMainState().???.core?.???, 1, 'terminal commit should merge proposed loot into backpack');
  assert.ok(
    Object.values(memory.readMainState().???.??????).some(value => value.includes('?????????')),
    'terminal commit should write selected narrative into recent events',
  );

  const restarted = await controller.startBattle(8);
  assert.equal(restarted.ok, true, 'battle should restart after terminal commit');
  await controller.abandonBattle(8);
  assert.deepEqual(memory.readBattleSession(), BattleSessionSchema.parse({}), 'abandon should clear battle_session');
  assert.equal(memory.readMainState().???.??????, '?????, 'abandon should restore the latest prebattle snapshot state');

  const retryMemory = createMemoryStateAccess(parsed, 11);
  const failingController = createBattleSessionController(retryMemory, async () => {
    throw new Error('resolver boom');
  });
  await failingController.startBattle(11);
  await failingController.setStrategyText(11, '????????);
  await assert.rejects(() => failingController.confirmPlayerCheck(11), /resolver boom/, 'ai resolver failure should surface');
  assert.equal(retryMemory.readBattleSession().phase, 'player_input', 'resolver failure should reset phase for retry');
  assert.equal(retryMemory.readBattleSession().player_check.confirmed, true, 'resolver failure should preserve confirmed roll');
  assert.equal(retryMemory.readBattleSession().pending_preview.summary, '', 'resolver failure should clear stale preview');

  const recoveryController = createBattleSessionController(retryMemory, async session => ({
    summary: `????????{session.player_check.strategy_text}`,
    proposed_world_events: { recovery: 'AI ??????' },
    proposed_combatants: _.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  const retried = await recoveryController.resolveConfirmedRound(11);
  assert.equal(retried.ok, true, 'resolveAgain should succeed after earlier resolver failure');
  assert.equal(retryMemory.readBattleSession().phase, 'preview', 'successful retry should enter preview phase');
  assert.match(retryMemory.readBattleSession().pending_preview.summary, /??????/, 'retry should write new preview summary');

  const summaryOnlyMemory = createMemoryStateAccess(parsed, 12);
  const summaryOnlyController = createBattleSessionController(summaryOnlyMemory, async () => ({
    summary: 'preview only summary',
    proposed_world_events: {},
    proposed_combatants: { allies: {}, enemies: {} },
    proposed_loot: {},
  }));
  await summaryOnlyController.startBattle(12);
  await summaryOnlyController.setStrategyText(12, '??????');
  await assert.rejects(
    () => summaryOnlyController.confirmPlayerCheck(12),
    /explicit combatants/,
    'resolver should reject summary-only preview without combatants',
  );
  assert.equal(summaryOnlyMemory.readBattleSession().phase, 'player_input', 'summary-only preview failure should reset phase');
  assert.equal(
    Object.keys(summaryOnlyMemory.readBattleSession().combatants.allies).length > 0,
    true,
    'summary-only preview failure must not erase allies',
  );

  const emptyHeroState = Schema.parse({
    ???: { ??????: '???' },
    ???: { ??????: { id: '', ???: '????????, HP???: 6, HP???: 10 } },
    ???: {
      allyA: { id: 'allyA', ???: '???A', HP???: 4, HP???: 10 },
      allyB: { id: 'allyB', ???: '???B', HP???: 5, HP???: 10 },
    },
    ???: { wolf: { id: 'wolf', ???: '??, HP???: 3, HP???: 3 } },
  });
  const emptyHeroMemory = createMemoryStateAccess(emptyHeroState, 21);
  const emptyHeroController = createBattleSessionController(emptyHeroMemory, async session => ({
    summary: '??hero id ???',
    proposed_world_events: {},
    proposed_combatants: _.cloneDeep(session.combatants),
    proposed_loot: {},
  }));
  await emptyHeroController.startBattle(21);
  await emptyHeroMemory.editBattleSession({
    sourceMessageId: 21,
    mutate: draft => {
      draft.phase = 'finished';
      draft.combatants.allies.allyA.HP??? = 1;
    },
  });
  const emptyHeroCommitted = await emptyHeroController.commitBattle({
    sourceMessageId: 21,
    summary: '??hero id ???',
  });
  assert.equal(emptyHeroCommitted.ok, true, 'commit should still succeed when hero id is empty');
  assert.equal(emptyHeroMemory.readMainState().???.??????.???, '????????, 'empty hero id must not promote teammate to hero');
  assert.equal(emptyHeroMemory.readMainState().???.allyA?.HP???, 1, 'team should remain in ??? after commit when hero id is empty');

  console.log('phase0+p1 verification passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
