import { klona } from 'klona';
import {
  BattleSessionSchema,
  MainStateSchema,
  Schema,
  type BattleSession,
  type MainState,
  type Schema as CanonicalState,
} from '../../schema.ts';

type TransactionFailureReason = 'scope_guard_failed' | 'validation_failed' | 'post_check_failed';

type TransactionFailure = {
  ok: false;
  reason: TransactionFailureReason;
  message: string;
  attempt: number;
};

type TransactionSuccess = {
  ok: true;
  attempt: number;
  before: CanonicalState;
  after: CanonicalState;
};

export type StateAccessTransactionResult = TransactionSuccess | TransactionFailure;

type StateAccessBindings = {
  readVariables: (option: VariableOption) => Record<string, any>;
  writeVariables: (
    updater: (variables: Record<string, any>) => Record<string, any> | Promise<Record<string, any>>,
    option: VariableOption,
  ) => Record<string, any> | Promise<Record<string, any>>;
  resolveLatestMessageId?: () => number | undefined;
};

type CanonicalTransactionConfig = {
  variableOption?: VariableOption;
  sourceMessageId?: number;
  maxRetries?: number;
  mutate: (draft: CanonicalState, before: CanonicalState) => CanonicalState | void | Promise<CanonicalState | void>;
  postCheck?: (before: CanonicalState, after: CanonicalState) => boolean;
  postCheckMessage?: string;
};

type MainStateTransactionConfig = {
  variableOption?: VariableOption;
  sourceMessageId?: number;
  maxRetries?: number;
  mutate: (draft: MainState, before: MainState) => MainState | void | Promise<MainState | void>;
};

type BattleSessionTransactionConfig = {
  variableOption?: VariableOption;
  sourceMessageId?: number;
  maxRetries?: number;
  mutate: (draft: BattleSession, before: BattleSession) => BattleSession | void | Promise<BattleSession | void>;
};

type MemoryStateAccess = StateAccessApi & {
  getVariables: () => Record<string, any>;
  setLatestMessageId: (messageId: number) => void;
};

export const LATEST_MESSAGE_VARIABLE_OPTION = Object.freeze({ type: 'message', message_id: 'latest' } as const);

const runtimeBindings: StateAccessBindings = {
  readVariables: option => getVariables(option),
  writeVariables: (updater, option) => updateVariablesWith(updater, option),
};

function parseCanonicalState(variables: Record<string, any>): CanonicalState {
  return Schema.parse(_.get(variables, 'stat_data', {}), { reportInput: true });
}

function createFailure(reason: TransactionFailureReason, message: string, attempt: number): TransactionFailure {
  return { ok: false, reason, message, attempt };
}

function ensureScope(bindings: StateAccessBindings, sourceMessageId: number | undefined): boolean {
  if (sourceMessageId === undefined) {
    return true;
  }
  const currentMessageId = bindings.resolveLatestMessageId?.();
  return currentMessageId === undefined || currentMessageId === sourceMessageId;
}

export function projectMainState(state: CanonicalState): MainState {
  return MainStateSchema.parse(_.omit(state, 'battle_session'), { reportInput: true });
}

export function projectBattleSession(state: CanonicalState): BattleSession {
  return BattleSessionSchema.parse(state.battle_session, { reportInput: true });
}

export function createStateAccess(bindings: StateAccessBindings = runtimeBindings) {
  const readCanonicalState = (variableOption: VariableOption = LATEST_MESSAGE_VARIABLE_OPTION): CanonicalState =>
    parseCanonicalState(bindings.readVariables(variableOption));

  const editCanonicalState = async ({
    variableOption = LATEST_MESSAGE_VARIABLE_OPTION,
    sourceMessageId,
    maxRetries = 0,
    mutate,
    postCheck,
    postCheckMessage = 'post check failed',
  }: CanonicalTransactionConfig): Promise<StateAccessTransactionResult> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (!ensureScope(bindings, sourceMessageId)) {
        return createFailure('scope_guard_failed', 'source_message_id mismatch', attempt);
      }

      const beforeVariables = bindings.readVariables(variableOption);
      const before = parseCanonicalState(beforeVariables);
      const draft = klona(before);
      const mutated = await mutate(draft, before);
      const candidate = mutated ?? draft;
      const parsed = Schema.safeParse(candidate, { reportInput: true });
      if (!parsed.success) {
        return createFailure('validation_failed', z.prettifyError(parsed.error), attempt);
      }

      await Promise.resolve(bindings.writeVariables(variables => _.set(variables, 'stat_data', parsed.data), variableOption));

      const after = readCanonicalState(variableOption);
      if (!postCheck || postCheck(before, after)) {
        return { ok: true, attempt, before, after };
      }
    }

    return createFailure('post_check_failed', postCheckMessage, maxRetries + 1);
  };

  const editMainState = async ({
    variableOption = LATEST_MESSAGE_VARIABLE_OPTION,
    sourceMessageId,
    maxRetries = 0,
    mutate,
  }: MainStateTransactionConfig): Promise<StateAccessTransactionResult> =>
    editCanonicalState({
      variableOption,
      sourceMessageId,
      maxRetries,
      mutate: async draft => {
        const beforeMain = projectMainState(draft);
        const draftMain = klona(beforeMain);
        const mutatedMain = await mutate(draftMain, beforeMain);
        const nextMain = MainStateSchema.parse(mutatedMain ?? draftMain, { reportInput: true });
        Object.assign(draft, nextMain, { battle_session: draft.battle_session });
      },
      postCheck: (before, after) => _.isEqual(before.battle_session, after.battle_session),
      postCheckMessage: 'battle_session changed during main-state transaction',
    });

  const editBattleSession = async ({
    variableOption = LATEST_MESSAGE_VARIABLE_OPTION,
    sourceMessageId,
    maxRetries = 0,
    mutate,
  }: BattleSessionTransactionConfig): Promise<StateAccessTransactionResult> =>
    editCanonicalState({
      variableOption,
      sourceMessageId,
      maxRetries,
      mutate: async draft => {
        const beforeBattleSession = projectBattleSession(draft);
        const draftBattleSession = klona(beforeBattleSession);
        const mutatedBattleSession = await mutate(draftBattleSession, beforeBattleSession);
        draft.battle_session = BattleSessionSchema.parse(mutatedBattleSession ?? draftBattleSession, {
          reportInput: true,
        });
      },
      postCheck: (before, after) => _.isEqual(projectMainState(before), projectMainState(after)),
      postCheckMessage: 'main-state projection changed during battle transaction',
    });

  const clearBattleSession = (variableOption: VariableOption = LATEST_MESSAGE_VARIABLE_OPTION) =>
    editBattleSession({
      variableOption,
      mutate: draft => {
        Object.assign(draft, BattleSessionSchema.parse({}, { reportInput: true }));
      },
    });

  return {
    readCanonicalState,
    readMainState: (variableOption: VariableOption = LATEST_MESSAGE_VARIABLE_OPTION) => projectMainState(readCanonicalState(variableOption)),
    readBattleSession: (variableOption: VariableOption = LATEST_MESSAGE_VARIABLE_OPTION) =>
      projectBattleSession(readCanonicalState(variableOption)),
    editCanonicalState,
    editMainState,
    editBattleSession,
    clearBattleSession,
  };
}

export type StateAccessApi = ReturnType<typeof createStateAccess>;

export function createMemoryStateAccess(initialState: Partial<CanonicalState> = {}, latestMessageId = -1): MemoryStateAccess {
  let variables = { stat_data: Schema.parse(initialState, { reportInput: true }) };
  let currentLatestMessageId = latestMessageId;

  const access = createStateAccess({
    readVariables: () => klona(variables),
    writeVariables: updater => {
      const nextVariables = updater(klona(variables));
      variables = klona(nextVariables);
      return variables;
    },
    resolveLatestMessageId: () => currentLatestMessageId,
  });

  return {
    ...access,
    getVariables: () => klona(variables),
    setLatestMessageId: messageId => {
      currentLatestMessageId = messageId;
    },
  };
}

export const stateAccess = createStateAccess();
