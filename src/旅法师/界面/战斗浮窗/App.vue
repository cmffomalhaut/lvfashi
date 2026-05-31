<template>
  <div class="battle-shell">
    <header class="battle-header">
      <div>
        <h1>鎴樻枟娴獥</h1>
        <p>鍚屽眰鎭㈠ / 璺ㄦゼ灞傞噸寤?/ 鏀惧純鍥炴粴 宸叉帴鍏?battle_session銆?/p>
      </div>
      <div class="header-actions">
        <button class="btn btn--ghost" @click="close">闅愯棌</button>
      </div>
    </header>

    <section class="summary-grid">
      <article class="card">
        <h2>浼氳瘽鐘舵€?/h2>
        <dl>
          <div><dt>婵€娲?/dt><dd>{{ battleSession.婵€娲?? '鏄? : '鍚? }}</dd></div>
          <div><dt>mode</dt><dd>{{ battleSession.meta.mode }}</dd></div>
          <div><dt>phase</dt><dd>{{ battleSession.phase }}</dd></div>
          <div><dt>source_message_id</dt><dd>{{ battleSession.meta.source_message_id }}</dd></div>
          <div><dt>褰撳墠妤煎眰</dt><dd>{{ sourceMessageId }}</dd></div>
          <div><dt>round</dt><dd>{{ battleSession.round.round_no }}</dd></div>
          <div><dt>acting_side</dt><dd>{{ battleSession.round.acting_side }}</dd></div>
          <div><dt>checkpoint</dt><dd>{{ roundCheckpointDirty ? '鏈夋湭鎻愪氦鍗婂洖鍚? : '鏁村洖鍚堝凡钀界偣' }}</dd></div>
          <div><dt>AI缁撶畻</dt><dd>{{ isResolving ? '杩涜涓? : '绌洪棽' }}</dd></div>
        </dl>
      </article>

      <article class="card">
        <h2>鎴樻枟鍏ュ彛</h2>
        <div class="button-grid">
          <button class="btn" @click="startBattle">寮€濮嬫垬鏂?/button>
          <button class="btn" @click="resumeOrRebuild">鎭㈠ / 閲嶅缓</button>
          <button class="btn" @click="forceRebuild">寮哄埗閲嶅缓</button>
          <button class="btn btn--warn" :disabled="!battleSession.婵€娲? @click="abandon">鏀惧純骞跺洖婊?/button>
        </div>
        <p class="hint">鏁屾柟鏁伴噺锛歿{ enemyCount }} / 鍙仮澶嶏細{{ canResume ? '鏄? : '鍚? }}</p>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>鐜╁鏄庨</h2>
        <dl>
          <div><dt>roll</dt><dd>{{ battleSession.player_check.roll }}</dd></div>
          <div><dt>reroll_used</dt><dd>{{ battleSession.player_check.reroll_used }}/3</dd></div>
          <div><dt>confirmed</dt><dd>{{ battleSession.player_check.confirmed ? '鏄? : '鍚? }}</dd></div>
        </dl>
        <textarea v-model="strategyDraft" class="strategy-box" placeholder="杈撳叆鏈洖鍚堢瓥鐣?></textarea>
        <div class="button-grid">
          <button class="btn" @click="saveStrategy">淇濆瓨绛栫暐</button>
          <button
            class="btn"
            :disabled="isResolving || battleSession.player_check.confirmed || battleSession.player_check.reroll_used >= 3"
            @click="reroll"
          >
            閲嶆幏
          </button>
          <button class="btn btn--primary" :disabled="isResolving || battleSession.player_check.confirmed" @click="confirm">
            纭鏈洖鍚?          </button>
          <button
            class="btn"
            :disabled="isResolving || !battleSession.player_check.confirmed"
            @click="resolveAgain"
          >
            閲嶆柊璇锋眰 AI 缁撶畻
          </button>
          <button class="btn btn--ghost" :disabled="isResolving" @click="useMockPreview">浣跨敤鏈湴棰勮鍏滃簳</button>
        </div>
        <p v-if="lastResolveError" class="hint hint--error">AI 缁撶畻澶辫触锛歿{ lastResolveError }}</p>
      </article>

      <article class="card">
        <h2>棰勮涓庡壇鏈?/h2>
        <p>{{ battleSession.pending_preview.summary || '绛夊緟纭鍚庣敓鎴愰瑙堛€? }}</p>
        <div class="button-grid">
          <button
            class="btn btn--primary"
            :disabled="isResolving || !battleSession.pending_preview.summary"
            @click="applyPreview"
          >
            鎻愪氦鍒?battle_session
          </button>
        </div>
        <dl>
          <div><dt>allies</dt><dd>{{ Object.keys(battleSession.combatants.allies).length }}</dd></div>
          <div><dt>enemies</dt><dd>{{ Object.keys(battleSession.combatants.enemies).length }}</dd></div>
          <div><dt>dark_pool</dt><dd>{{ battleSession.shared_dark_pool.values.join(', ') || '鈥? }}</dd></div>
          <div><dt>dark_pool_cursor</dt><dd>{{ battleSession.shared_dark_pool.cursor }}</dd></div>
          <div><dt>world_events</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_world_events).length }}</dd></div>
          <div><dt>loot</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_loot).length }}</dd></div>
        </dl>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_world_events).length" class="preview-block">
          <h3>杩戞湡浜嬪姟鑽夋</h3>
          <ul class="info-list">
            <li v-for="(event, key) in battleSession.pending_preview.proposed_world_events" :key="key">
              <strong>{{ key }}</strong>锛歿{ event }}
            </li>
          </ul>
        </div>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_loot).length" class="preview-block">
          <h3>鎴樺埄鍝佽崏妗?/h3>
          <ul class="info-list">
            <li v-for="loot in Object.values(battleSession.pending_preview.proposed_loot)" :key="loot.id">
              <strong>{{ loot.鍚嶇О }}</strong>
              <span>x{{ loot.鏁伴噺 }}</span>
              <span>{{ loot.鎻忚堪 }}</span>
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>缁堝眬杈撳嚭</h2>
        <div class="mode-switch">
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="summary_only" />
            <span>浠呮垬鏂楀皬缁?/span>
          </label>
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="full_log" />
            <span>鍏ㄦ祦绋嬫棩蹇?/span>
          </label>
        </div>
        <textarea v-model="summaryDraft" class="strategy-box strategy-box--sm" placeholder="杈撳叆鎴樻枟灏忕粨"></textarea>
        <textarea
          v-model="fullLogDraft"
          class="strategy-box"
          placeholder="杈撳叆鍏ㄦ祦绋嬫垬鏂楄褰曪紙閫夋嫨 full_log 鏃朵紭鍏堝洖鍐欒繖閲岋級"
        ></textarea>
        <div class="button-grid">
          <button class="btn" :disabled="!battleSession.婵€娲? @click="syncOutputMode">淇濆瓨杈撳嚭妯″紡</button>
          <button
            class="btn btn--primary"
            :disabled="!battleSession.????|| battleSession.phase !== 'finished'"
            @click="commitBattle"
          >
            缁堝眬鎻愪氦鍥炰富鐘舵€?          </button>
        </div>
        <p class="hint">??? phase = finished ?????????????????????????????????/p>
      </article>

      <article class="card">
        <h2>鍥炴粴/鎭㈠璇存槑</h2>
        <ul class="info-list">
          <li>鍏抽棴娴獥锛氳嫢褰撳墠鍗婂洖鍚堟湭鎻愪氦锛屼笅娆″悓灞傛墦寮€浼氬洖婊氬埌鏈€杩?checkpoint銆?/li>
          <li>鍚屽眰鎭㈠锛氬彧鎭㈠鏁村洖鍚堣竟鐣岋紝涓嶄繚鐣欏崐鍥炲悎鑴忕姸鎬併€?/li>
          <li>璺ㄦゼ灞傞噸寮€锛氫互褰撳墠妤煎眰鏁屾垜鐘舵€侀噸寤烘柊鐨?battle_session銆?/li>
          <li>瀹屽叏鏀惧純锛氭仮澶嶆垬鍓嶅揩鐓у苟娓呯┖ battle_session銆?/li>
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
    if (value && !summaryDraft.value) {
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

const syncOutputMode = async () => {
  await store.setOutputMode(outputMode.value);
};

const commitBattle = async () => {
  await store.commitBattle({
    summary: summaryDraft.value,
    fullLog: fullLogDraft.value,
    outputMode: outputMode.value,
  });
};

const abandon = async () => {
  await store.abandon();
};

const close = () => {
  store.close();
};
</script>
