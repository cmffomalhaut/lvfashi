<template>
  <div class="battle-shell">
    <header class="battle-header">
      <div>
        <h1>旅法师战斗浮窗</h1>
        <p>战斗临时状态写入 battle_session；主状态只在终局提交或放弃时变更。</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--ghost" @click="close">隐藏</button>
      </div>
    </header>

    <section class="summary-grid">
      <article class="card">
        <h2>会话状态</h2>
        <dl>
          <div><dt>激活</dt><dd>{{ battleSession.激活 ? '是' : '否' }}</dd></div>
          <div><dt>mode</dt><dd>{{ battleSession.meta.mode }}</dd></div>
          <div><dt>phase</dt><dd>{{ battleSession.phase }}</dd></div>
          <div><dt>source_message_id</dt><dd>{{ battleSession.meta.source_message_id }}</dd></div>
          <div><dt>当前楼层</dt><dd>{{ sourceMessageId }}</dd></div>
          <div><dt>round</dt><dd>{{ battleSession.round.round_no }}</dd></div>
          <div><dt>acting_side</dt><dd>{{ battleSession.round.acting_side }}</dd></div>
          <div><dt>checkpoint</dt><dd>{{ roundCheckpointDirty ? '有未提交回合状态' : '回合已落点' }}</dd></div>
          <div><dt>AI 结算</dt><dd>{{ isResolving ? '进行中' : '空闲' }}</dd></div>
        </dl>
      </article>

      <article class="card">
        <h2>入口</h2>
        <div class="button-grid">
          <button class="btn" @click="startBattle">开始战斗</button>
          <button class="btn" @click="resumeOrRebuild">恢复 / 重建</button>
          <button class="btn" @click="forceRebuild">强制重建</button>
          <button class="btn btn--warn" :disabled="!battleSession.激活" @click="abandon">放弃并回滚</button>
        </div>
        <p class="hint">敌方数量：{{ enemyCount }} / 可恢复：{{ canResume ? '是' : '否' }}</p>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>玩家检定</h2>
        <dl>
          <div><dt>roll</dt><dd>{{ battleSession.player_check.roll }}</dd></div>
          <div><dt>reroll_used</dt><dd>{{ battleSession.player_check.reroll_used }}/3</dd></div>
          <div><dt>confirmed</dt><dd>{{ battleSession.player_check.confirmed ? '是' : '否' }}</dd></div>
        </dl>
        <textarea v-model="strategyDraft" class="strategy-box" placeholder="输入本回合策略"></textarea>
        <div class="button-grid">
          <button class="btn" @click="saveStrategy">保存策略</button>
          <button
            class="btn"
            :disabled="isResolving || battleSession.player_check.confirmed || battleSession.player_check.reroll_used >= 3"
            @click="reroll"
          >
            重掷明骰
          </button>
          <button class="btn btn--primary" :disabled="isResolving || battleSession.player_check.confirmed" @click="confirm">
            确认并请求 AI 预览
          </button>
          <button class="btn" :disabled="isResolving || !battleSession.player_check.confirmed" @click="resolveAgain">
            重新结算
          </button>
          <button class="btn btn--ghost" :disabled="isResolving" @click="useMockPreview">使用本地预览兜底</button>
        </div>
        <p v-if="lastResolveError" class="hint hint--error">AI 结算失败：{{ lastResolveError }}</p>
      </article>

      <article class="card">
        <h2>回合预览</h2>
        <p>{{ battleSession.pending_preview.summary || '等待确认后生成预览。' }}</p>
        <div class="button-grid">
          <button
            class="btn btn--primary"
            :disabled="isResolving || !battleSession.pending_preview.summary"
            @click="applyPreview"
          >
            提交到下一回合
          </button>
          <button class="btn btn--warn" :disabled="!battleSession.pending_preview.summary" @click="finishBattle">
            标记终局
          </button>
        </div>
        <dl>
          <div><dt>allies</dt><dd>{{ Object.keys(battleSession.combatants.allies).length }}</dd></div>
          <div><dt>enemies</dt><dd>{{ Object.keys(battleSession.combatants.enemies).length }}</dd></div>
          <div><dt>dark_pool</dt><dd>{{ battleSession.shared_dark_pool.values.join(', ') || '—' }}</dd></div>
          <div><dt>dark_pool_cursor</dt><dd>{{ battleSession.shared_dark_pool.cursor }}</dd></div>
          <div><dt>world_events</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_world_events).length }}</dd></div>
          <div><dt>loot</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_loot).length }}</dd></div>
        </dl>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_world_events).length" class="preview-block">
          <h3>近期事务草案</h3>
          <ul class="info-list">
            <li v-for="(event, key) in battleSession.pending_preview.proposed_world_events" :key="key">
              <strong>{{ key }}</strong>
              <span>{{ event }}</span>
            </li>
          </ul>
        </div>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_loot).length" class="preview-block">
          <h3>战利品草案</h3>
          <ul class="info-list">
            <li v-for="loot in Object.values(battleSession.pending_preview.proposed_loot)" :key="loot.id">
              <strong>{{ loot.名称 }}</strong>
              <span>x{{ loot.数量 }}</span>
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>终局提交</h2>
        <div class="mode-switch">
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="summary_only" />
            <span>只写入简要总结</span>
          </label>
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="full_log" />
            <span>写入完整战斗记录</span>
          </label>
        </div>
        <textarea v-model="summaryDraft" class="strategy-box strategy-box--sm" placeholder="输入战斗小结"></textarea>
        <textarea
          v-model="fullLogDraft"
          class="strategy-box"
          placeholder="需要 full_log 时输入完整战斗记录"
        ></textarea>
        <div class="button-grid">
          <button class="btn" :disabled="!battleSession.激活" @click="syncOutputMode">保存输出模式</button>
          <button
            class="btn btn--primary"
            :disabled="!battleSession.激活 || battleSession.phase !== 'finished'"
            @click="commitBattle"
          >
            终局提交回主状态
          </button>
        </div>
        <p class="hint">终局提交前必须先把 phase 标记为 finished；提交后 battle_session 会被清空。</p>
      </article>

      <article class="card">
        <h2>规则提示</h2>
        <ul class="info-list">
          <li>同楼层重开：若回合中途关闭，会恢复到最近 checkpoint。</li>
          <li>跨楼层重开：以当前楼层敌我状态重建新的 battle_session。</li>
          <li>完全放弃：恢复战前快照并清空 battle_session。</li>
          <li>终局提交：合并战斗单位、掉落和近期事务，再清空 battle_session。</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import type { BattleSession } from '../../schema.ts';
import { useBattleWindowStore } from './store';

const store = useBattleWindowStore();
const { battleSession, canResume, enemyCount, isResolving, lastResolveError, roundCheckpointDirty, sourceMessageId } =
  storeToRefs(store);

const strategyDraft = ref('');
const outputMode = ref<BattleSession['output_mode']>('summary_only');
const summaryDraft = ref('');
const fullLogDraft = ref('');

watch(
  () => battleSession.value.player_check.strategy_text,
  value => {
    strategyDraft.value = value;
  },
  { immediate: true },
);

watch(
  () => battleSession.value.output_mode,
  value => {
    outputMode.value = value;
  },
  { immediate: true },
);

watch(
  () => battleSession.value.pending_preview.summary,
  value => {
    if (!summaryDraft.value && value) {
      summaryDraft.value = value;
    }
  },
  { immediate: true },
);

const startBattle = async () => {
  await store.startBattle();
};
const resumeOrRebuild = async () => {
  await store.resumeOrRebuild();
};
const forceRebuild = async () => {
  await store.forceRebuild();
};
const saveStrategy = async () => {
  await store.saveStrategy(strategyDraft.value);
};
const reroll = async () => {
  await store.reroll();
};
const confirm = async () => {
  await store.confirm();
};
const resolveAgain = async () => {
  await store.resolveAgain();
};
const useMockPreview = async () => {
  await store.useMockPreview();
};
const applyPreview = async () => {
  await store.applyPreview();
};
const finishBattle = async () => {
  await store.finishBattle();
};
const syncOutputMode = async () => {
  await store.setOutputMode(outputMode.value);
};
const commitBattle = async () => {
  await store.commitBattle({
    summary: summaryDraft.value,
    fullLog: fullLogDraft.value,
    outputMode: outputMode.value,
  });
  summaryDraft.value = '';
  fullLogDraft.value = '';
};
const abandon = async () => {
  await store.abandon();
  summaryDraft.value = '';
  fullLogDraft.value = '';
};
const close = () => store.close();
</script>