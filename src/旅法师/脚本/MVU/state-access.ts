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
  postCheck?: (before: CanonicalState, candidate: CanonicalState) => boolean;
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

function resolveRuntimeLatestMessageId(): number | undefined {
  const current = (globalThis as typeof globalThis & { getCurrentMessageId?: () => number | string | undefined }).getCurrentMessageId?.();
  if (current === undefined) {
    return undefined;
  }
  const numeric = Number(current);
  return Number.isFinite(numeric) ? numeric : undefined;
}

const runtimeBindings: StateAccessBindings = {
  readVariables: option => getVariables(option),
  writeVariables: (updater, option) => updateVariablesWith(updater, option),
  resolveLatestMessageId: resolveRuntimeLatestMessageId,
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

      let result: StateAccessTransactionResult | null = null;

      await Promise.resolve(
        bindings.writeVariables(async variables => {
          if (!ensureScope(bindings, sourceMessageId)) {
            result = createFailure('scope_guard_failed', 'source_message_id mismatch', attempt);
            return variables;
          }

          const before = parseCanonicalState(variables);
          const draft = klona(before);
          const mutated = await mutate(draft, before);
          const candidate = mutated ?? draft;
          const parsed = Schema.safeParse(candidate, { reportInput: true });
          if (!parsed.success) {
            result = createFailure('validation_failed', z.prettifyError(parsed.error), attempt);
            return variables;
          }

          if (postCheck && !postCheck(before, parsed.data)) {
            result = createFailure('post_check_failed', postCheckMessage, attempt);
            return variables;
          }

          const nextVariables = klona(variables);
          _.set(nextVariables, 'stat_data', parsed.data);
          result = { ok: true, attempt, before, after: parsed.data };
          return nextVariables;
        }, variableOption),
      );

      const currentResult: StateAccessTransactionResult =
        result ?? createFailure('post_check_failed', postCheckMessage, attempt);
      if (currentResult.ok) {
        return currentResult;
      }
      if (currentResult.reason !== 'post_check_failed' || attempt === maxRetries) {
        return currentResult;
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
      postCheck: (before, candidate) => _.isEqual(before.battle_session, candidate.battle_session),
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
      postCheck: (before, candidate) => _.isEqual(projectMainState(before), projectMainState(candidate)),
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
  let variables: Record<string, any> = { stat_data: Schema.parse(initialState, { reportInput: true }) };
  let currentLatestMessageId = latestMessageId;

  const access = createStateAccess({
    readVariables: () => klona(variables),
    writeVariables: async updater => {
      const nextVariables = await updater(klona(variables));
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
