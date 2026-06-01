<template>
  <details class="field-tree-node" :open="depth < 1">
    <summary class="field-tree-node__summary">
      <span class="field-tree-node__meta">
        <strong>{{ node.segment }}</strong>
        <code>{{ node.path }}</code>
      </span>
      <span class="field-tree-node__actions">
        <span>{{ kindLabel }}</span>
        <button class="btn btn--ghost btn--sm" type="button" @click.prevent.stop="emit('toggle-select', node.path)">
          {{ selected ? '已选中' : '加入勾选' }}
        </button>
      </span>
    </summary>

    <div class="field-tree-node__body">
      <p class="field-tree-node__preview">{{ node.preview }}</p>
      <div v-if="node.children.length" class="field-tree-node__children">
        <FieldTreeNode
          v-for="child in node.children"
          :key="child.key"
          :node="child"
          :selected-paths="selectedPaths"
          :depth="depth + 1"
          @toggle-select="emit('toggle-select', $event)"
        />
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { BattleFieldTreeNode as BattleFieldTreeNodeShape } from '../../脚本/战斗/field-selection.ts';

const props = defineProps<{
  node: BattleFieldTreeNodeShape;
  selectedPaths: string[];
  depth?: number;
}>();

const emit = defineEmits<{
  (event: 'toggle-select', path: string): void;
}>();

const depth = computed(() => props.depth ?? 0);
const selected = computed(() => props.selectedPaths.includes(props.node.path));
const kindLabel = computed(() => {
  switch (props.node.valueKind) {
    case 'array':
      return '数组';
    case 'object':
      return '对象';
    case 'scalar':
      return '标量';
    default:
      return '未知';
  }
});
</script>
