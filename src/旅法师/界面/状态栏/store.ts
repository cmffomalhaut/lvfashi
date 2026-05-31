import { klona } from 'klona';
import { defineMvuDataStore } from '@util/mvu';
import { type MainState, Schema } from '../../schema.ts';
import { projectMainState } from '../../脚本/MVU/state-access.ts';

const useCanonicalStore = defineMvuDataStore(Schema, { type: 'message', message_id: 'latest' });

export const useStatusStore = defineStore('planeswalker.status', () => {
  const canonicalStore = useCanonicalStore();

  const mainState = computed<MainState>(() => klona(projectMainState(canonicalStore.data)));
  const battleSessionActive = computed(() => canonicalStore.data['battle_session']['激活']);
  const latestSourceMessageId = computed(() => canonicalStore.data['battle_session'].meta.source_message_id);

  return {
    mainState,
    battleSessionActive,
    latestSourceMessageId,
  };
});
