import { klona } from 'klona';
import { type MainState, Schema } from '../../schema.ts';
import { projectMainState, stateAccess } from '../../脚本/MVU/state-access.ts';

export const useStatusStore = defineStore('planeswalker.status', () => {
  const canonicalState = ref(Schema.parse({}, { reportInput: true }));

  const refresh = () => {
    canonicalState.value = stateAccess.readCanonicalState();
  };

  refresh();
  useIntervalFn(refresh, 1000);

  const mainState = computed<MainState>(() => klona(projectMainState(canonicalState.value)));
  const battleSessionActive = computed(() => canonicalState.value.battle_session.激活);
  const latestSourceMessageId = computed(() => canonicalState.value.battle_session.meta.source_message_id);

  return {
    mainState,
    battleSessionActive,
    latestSourceMessageId,
    refresh,
  };
});