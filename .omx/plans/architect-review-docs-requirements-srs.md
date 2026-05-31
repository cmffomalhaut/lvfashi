# Architect Review — docs-requirements-srs

## Verdict
ITERATE

> Note: the packaged `architect` subagent could not run because its bound model (`gpt-5.4-mini`) was unavailable in the current environment. This review is a conservative local fallback to keep ralplan moving, but it should be treated as a provisional architect review artifact rather than a fully satisfied durable consensus gate.

## Strengths
1. **P0 / P1 / P2 decomposition is structurally sound**: it isolates the riskiest stability work (MVU, latest semantics, transactional writes, prompt isolation) before introducing battle UI complexity.
2. **AI/script authority split is mostly coherent**: AI owns narrative and battle numeric inference; script owns state safety, orchestration, and rollback.
3. **latest / -1 semantics are recognized as a primary architectural invariant** rather than an implementation detail.
4. **Template-aligned implementation posture** lowers integration risk by reusing MVU/Tavern Helper idioms instead of inventing a parallel framework.
5. **Test spec matches the stage gates** and is oriented around regression-prone edges.

## Steelman Antithesis
The current plan may still be too “document-sound” and not yet “execution-sound.” It correctly separates P0 from P1, but it treats several runtime invariants as prose rather than as enforced architectural contracts. In particular:
- “latest MVU” is described, but not yet formalized as a single source-of-truth access layer.
- battle prompt assembly is described, but not yet bounded by an explicit prompt contract and state snapshot contract.
- transactional safety is named, but not normalized into a single mutation pipeline for all critical flows.

A team could start implementation and still accidentally produce multiple competing write paths, inconsistent snapshot scopes, or one-off prompt assemblers.

## Tradeoff Tensions
1. **Freedom vs determinism**  
   Keeping AI in charge of battle numeric inference preserves flexibility, but weakens reproducibility and test determinism.
2. **Template reuse vs domain-specific abstraction**  
   Reusing existing MVU/store patterns speeds delivery, but the project’s “always latest floor” behavior diverges from the example store pattern and needs a stronger dedicated abstraction.
3. **Simple staged delivery vs future extensibility**  
   Delaying special checks to P2 is correct, but P1 battle flow should still reserve a clean extension seam now, otherwise P2 may require reworking the battle interaction contract.

## Required Revisions
1. **Introduce a single authoritative state-access contract**  
   The plan should explicitly require one shared access layer for:
   - latest MVU read/write
   - chat variable warehouse read/write
   - transactional mutation entry points
   so later execution does not create ad hoc writes from status bar, battle window, and card-management flows.

2. **Define critical-flow transaction classes**  
   The plan should explicitly classify these as transactional mutation flows:
   - backpack -> card promotion
   - battle round confirm writeback
   - battle abort rollback
   - card delete + visible-summary/reference cleanup
   Each should be required to use one atomic commit/rollback path.

3. **Formalize snapshot scope**  
   “battle snapshot” should name exactly what is captured and restored:
   - MVU hot state fields included
   - whether latest message body is included
   - whether chat variables are included or excluded
   - whether current visible summaries are restored from source or directly from snapshot

4. **Define prompt-assembly contracts**  
   The plan should spell out separate contracts for:
   - normal chat prompt assembly
   - battle round prompt assembly
   - final battle summary / CombatLog writeback content
   This reduces accidental drift between subsystems.

5. **Add extension seam for P2 now**  
   P1 should define a placeholder “special check request envelope” interface, even if not implemented, so P2 does not force a redesign of battle interaction flow.

6. **Clarify verification ownership**  
   The plan should say which future execution lane verifies:
   - schema invariants
n  - UI flow invariants
   - prompt isolation invariants
   - rollback invariants

## Synthesis
The overall architecture is good enough to continue planning and likely good enough for future execution after one more tightening pass. The minimal repair is not to broaden the plan, but to make four hidden invariants explicit:
1. one state access layer,
2. one transaction model for critical flows,
3. one defined battle snapshot scope,
4. one prompt assembly contract per mode.

With those explicit, the current staged plan becomes execution-ready rather than merely directionally correct.
