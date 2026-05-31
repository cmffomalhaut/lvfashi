<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <h1>旅法师状态栏</h1>
        <p>latest 楼层主热状态投影；battle_session 已隔离。</p>
      </div>
      <div class="chip-group">
        <span class="chip" :class="battleSessionActive ? 'chip--warn' : 'chip--ok'">
          {{ battleSessionActive ? '战斗会话进行中' : '无战斗会话' }}
        </span>
        <span class="chip">source_message_id: {{ latestSourceMessageId }}</span>
        <button class="chip chip--action" @click="openBattleWindow">打开战斗浮窗</button>
      </div>
    </header>

    <nav class="tab-nav">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab-button"
        :class="{ 'tab-button--active': tab === activeTab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </nav>

    <section v-if="activeTab === '属性'" class="panel-grid">
      <article class="panel-card">
        <h2>世界</h2>
        <dl>
          <div><dt>当前时间</dt><dd>{{ mainState.世界.当前时间 }}</dd></div>
          <div><dt>当前日期</dt><dd>{{ mainState.世界.当前日期 }}</dd></div>
          <div><dt>当前位面</dt><dd>{{ mainState.世界.当前位面 }}</dd></div>
          <div><dt>当前地点</dt><dd>{{ mainState.世界.当前地点 }}</dd></div>
          <div><dt>当前天气</dt><dd>{{ mainState.世界.当前天气 }}</dd></div>
        </dl>
      </article>

      <article class="panel-card">
        <h2>主角 / 当前化身</h2>
        <dl>
          <div><dt>名称</dt><dd>{{ mainState.主角.当前化身.名称 }}</dd></div>
          <div><dt>HP</dt><dd>{{ mainState.主角.当前化身.HP当前 }} / {{ mainState.主角.当前化身.HP上限 }}</dd></div>
          <div><dt>MP</dt><dd>{{ mainState.主角.当前化身.MP当前 }} / {{ mainState.主角.当前化身.MP上限 }}</dd></div>
          <div><dt>护盾</dt><dd>{{ mainState.主角.当前化身.护盾量 }}</dd></div>
          <div><dt>物攻 / 魔攻</dt><dd>{{ mainState.主角.当前化身.物攻 }} / {{ mainState.主角.当前化身.魔攻 }}</dd></div>
          <div><dt>物防 / 魔防</dt><dd>{{ mainState.主角.当前化身.物防 }} / {{ mainState.主角.当前化身.魔防 }}</dd></div>
        </dl>
      </article>
    </section>

    <section v-else-if="activeTab === '队伍'" class="panel-card">
      <h2>队伍</h2>
      <ul class="simple-list">
        <li v-for="unit in unitEntries(mainState.队伍)" :key="unit.id">
          <strong>{{ unit.名称 }}</strong>
          <span>HP {{ unit.HP当前 }}/{{ unit.HP上限 }}</span>
        </li>
      </ul>
      <p v-if="unitEntries(mainState.队伍).length === 0" class="empty">暂无队伍成员。</p>
    </section>

    <section v-else-if="activeTab === '敌方'" class="panel-card">
      <h2>敌方</h2>
      <ul class="simple-list">
        <li v-for="unit in unitEntries(mainState.敌方)" :key="unit.id">
          <strong>{{ unit.名称 }}</strong>
          <span>HP {{ unit.HP当前 }}/{{ unit.HP上限 }}</span>
        </li>
      </ul>
      <div class="panel-actions">
        <button class="tab-button tab-button--active" :disabled="unitEntries(mainState.敌方).length === 0" @click="openBattleWindow">
          进入战斗
        </button>
      </div>
      <p v-if="unitEntries(mainState.敌方).length === 0" class="empty">当前没有敌方单位。</p>
    </section>

    <section v-else-if="activeTab === '背包'" class="panel-card">
      <h2>背包</h2>
      <ul class="simple-list">
        <li v-for="item in objectEntries(mainState.背包)" :key="item.id">
          <strong>{{ item.名称 }}</strong>
          <span>x{{ item.数量 }}</span>
          <p>{{ item.描述 }}</p>
        </li>
      </ul>
      <p v-if="objectEntries(mainState.背包).length === 0" class="empty">背包为空。</p>
    </section>

    <section v-else-if="activeTab === '任务'" class="panel-card">
      <h2>任务</h2>
      <ul class="simple-list">
        <li v-for="quest in objectEntries(mainState.任务)" :key="quest.id">
          <strong>{{ quest.名称 }}</strong>
          <span>{{ quest.状态 }}</span>
          <p>{{ quest.描述 }}</p>
        </li>
      </ul>
      <p v-if="objectEntries(mainState.任务).length === 0" class="empty">暂无任务。</p>
    </section>

    <section v-else class="panel-card">
      <h2>当前可见卡</h2>
      <ul class="simple-list">
        <li v-for="card in objectEntries(mainState.当前可见卡)" :key="card.id">
          <strong>{{ card.名称 }}</strong>
          <p>{{ card.描述 }}</p>
        </li>
      </ul>
      <p v-if="objectEntries(mainState.当前可见卡).length === 0" class="empty">暂无可见卡摘要。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import type { Schema as RootState } from '../../schema';
import { useStatusStore } from './store';

const tabs = ['属性', '队伍', '敌方', '背包', '任务', '卡牌'];
const activeTab = ref<(typeof tabs)[number]>('属性');
const store = useStatusStore();
const { battleSessionActive, latestSourceMessageId, mainState } = storeToRefs(store);

function objectEntries<T extends { id: string }>(input: Record<string, T>): T[] {
  return Object.values(input);
}

function unitEntries(input: RootState['队伍']): RootState['队伍'][string][] {
  return Object.values(input);
}

function openBattleWindow() {
  window.top?.postMessage({ type: 'planeswalker:battle:open' }, '*');
}
</script>
