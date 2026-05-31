# Ralplan Handoff Record — mvu-battle

## 1. Handoff Status
- Planning status: **paused / ready for execution handoff**
- Content status: **planning package approved at critic + substitute-architect level**
- Durable consensus gate: **not fully satisfied**
- Reason: packaged `architect` subagent could not complete because its bound model (`gpt-5.4-mini`) was unavailable in the current environment; substitute architect-equivalent review was used instead

## 2. Planning Artifacts
- Existing PRD baseline: `.omx/plans/prd-docs-requirements-srs.md`
- Existing Test Spec baseline: `.omx/plans/test-spec-docs-requirements-srs.md`
- Context Snapshot: `.omx/context/mvu-battle-implementation-plan-20260531T082531Z.md`
- Detailed Plan: `.omx/plans/ralplan-detailed-implementation-plan-mvu-battle.md`
- Iteration Addendum 1: `.omx/plans/ralplan-iteration-1-addendum-mvu-battle.md`
- Iteration Addendum 2: `.omx/plans/ralplan-iteration-2-addendum-mvu-battle.md`
- Provisional Architect Runtime Note: `.omx/plans/architect-review-mvu-battle.md`
- Substitute Architect Review: `.omx/plans/architect-review-substitute-mvu-battle.md`
- Critic Review: `.omx/plans/critic-review-mvu-battle.md`

## 3. ADR Summary
### Decision
Adopt **Option D hybrid** for `battle_session`:
- canonical root `Schema` explicitly includes clearable `battle_session`
- product semantics still treat `battle_session` as non-main-state through selectors, prompt filtering, and write-path restrictions
- only a single `state-access` layer may own full `stat_data` writes

### Drivers
1. battle spec requires same-layer resume, cross-layer rebuild, and delete-back replay semantics
2. `util/mvu.ts` performs full-object parse / safeParse / write-back cycles
3. omitting `battle_session` from canonical parsed storage would risk field stripping during normal store sync

### Alternatives rejected
- schema 外临时字段 + 过滤（field retention risk too high）
- pure front-end local battle state（cannot satisfy floor-following / rebuild semantics）
- dual-schema registration as default first choice（higher complexity than needed for first implementation）

## 4. Review Outcome Summary
### Architect lane
- packaged `architect` role: **unavailable in runtime**
- substitute architect-equivalent review: **APPROVE**
- substitute architect conclusion: architecture content is execution-safe if the single write owner and Phase-0 access layer are respected

### Critic lane
- first critic pass: **ITERATE**
- issue found: `battle_session` storage contract conflicted with `util/mvu.ts` full-object safeParse/write-back behavior
- second critic pass after iteration 2: **APPROVE**

## 5. Remaining Gate Condition
The only remaining blocker is strict packaged-role bookkeeping, not plan quality:
- `ralplan_architect_review`: runtime unavailable
- `ralplan_architect_review_substitute`: approve
- `ralplan_critic_review`: approve
- `ralplan_consensus_gate.complete`: false

Interpretation:
- **content-wise** the package is execution-ready
- **workflow-wise** the literal packaged Architect -> Critic chain is imperfect because of environment limitations

## 6. Execution-Safety Conclusions
The planning package now explicitly freezes:
1. canonical storage contract for `battle_session`
2. single full-write owner for `stat_data`
3. projection-store rule for status bar / battle UI
4. transaction classes and commit / rollback sequence
5. battle snapshot scope and `source_message_id` binding
6. normal-chat vs battle prompt contracts
7. field-retention / multi-writer verification evidence

## 7. Recommended Next Lanes
- **Default**: `$ultragoal`
- **Parallel implementation**: `$ultragoal` + `$team`
- **Explicit single-owner fallback**: `$ralph`

Recommended first execution target:
1. root schema with clearable `battle_session`
2. Phase-0 `state-access` module
3. latest/projection store contract
4. field-retention and multi-writer verification

## 8. Available Agent Types for Future Execution
- `executor`
- `designer`
- `test-engineer`
- `verifier`
- `code-reviewer`
- `team-executor`

## 9. Team Verification Path
Team execution should return evidence for:
1. `battle_session` field retention under normal store polling
2. latest-floor targeting
3. warehouse / visible-summary isolation
4. forbidden-path rejection
5. backpack-promotion rollback
6. same-layer resume / cross-layer rebuild correctness
7. battle-abort rollback
8. prompt isolation for normal and battle prompts

## 10. Practical Recommendation
Accept the current planning package as the execution baseline; there is no remaining product ambiguity inside ralplan itself.
