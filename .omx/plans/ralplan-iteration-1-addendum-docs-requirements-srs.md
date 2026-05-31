# Ralplan Iteration 1 Addendum ? Field-Level Contracts Frozen

## 1. Purpose
This addendum resolves the critic findings by freezing field-level runtime contracts that were previously implicit.

## 2. Authoritative State / Mutation Contract
All execution must use one shared state/mutation model.

### 2.1 Source-of-truth layers
1. **Chat variables (`type: chat`)**
   - Formal card warehouse only
   - Must not be used as hot runtime state
2. **Latest-message MVU (`type: message`, `message_id: latest|-1`)**
   - Hot runtime state only
   - Source of truth for current gameplay state
3. **Latest message body text**
   - Narrative display only
   - Includes terminal `<CombatLog>...</CombatLog>` append after battle resolution

### 2.2 Canonical protected hot-state field map
- `World` = `stat_data.\u4e16\u754c`
- `Avatar` = `stat_data.\u5316\u8eab`
- `Backpack` = `stat_data.\u80cc\u5305`
- `Tasks` = `stat_data.\u4efb\u52a1`
- `Party` = `stat_data.\u961f\u4f0d`
- `CurrentStatus` = `stat_data.\u5f53\u524d\u72b6\u6001`
- `VisibleArea` = `stat_data.\u5f53\u524d\u53ef\u89c1\u533a`
- `VisibleCardSummaries` = `stat_data.\u5f53\u524d\u53ef\u89c1\u5361\u6458\u8981`
- `Enemies` = `stat_data.\u654c\u65b9`
- `BattleState` = `stat_data.\u6218\u6597\u72b6\u6001` (only if this field is introduced during implementation)
- `RecentAffair` = `stat_data.\u4e16\u754c.\u8fd1\u671f\u4e8b\u52a1`

### 2.3 Allowed mutation entry points
Only these named mutation classes may change protected state:
1. **Normal chat writeback pipeline**
   - `AI message -> Mvu.parseMessage -> whitelist filter -> schema validation -> replace latest MVU`
2. **Card promotion transaction**
   - `selected backpack item -> AI card draft -> schema clean -> stable cardId -> warehouse write -> latest MVU backpack decrement -> visible-summary refresh if loaded`
3. **Card delete transaction**
   - `user confirm -> warehouse removal -> latest MVU visible-summary/reference cleanup -> preserve historical message text`
4. **Battle confirm writeback**
   - `confirmed strategy + confirmed dice -> AI battle result -> parse -> whitelist -> schema validate -> replace latest MVU -> append/advance battle-local transient record`
5. **Battle abort rollback**
   - `abort/close -> restore pre-battle MVU snapshot -> remove battle-local transient record -> do not append CombatLog -> do not overwrite RecentAffair`

No ad hoc UI path may bypass these entry points.

## 3. Multi-Store Transaction Semantics

### 3.1 Card promotion transaction sequence
Because card promotion spans **chat variables** and **latest MVU**, the commit order is frozen as:
1. Generate and validate card draft
2. Generate stable `cardId`
3. Prepare both target states in memory:
   - next warehouse state
   - next latest-MVU backpack state
4. Write warehouse
5. If warehouse write succeeds, write latest MVU backpack decrement
6. If latest MVU write fails after warehouse write succeeds, run compensation:
   - restore previous warehouse state immediately
   - report failure to user
7. Only after both writes succeed is the transaction considered committed

### 3.2 Card delete transaction sequence
1. Read current warehouse and latest MVU summary/reference state
2. Prepare next warehouse state and next latest MVU state
3. Write warehouse removal
4. If warehouse write succeeds, write latest MVU cleanup
5. If latest MVU cleanup fails, restore previous warehouse state immediately
6. Commit is successful only when both writes succeed

### 3.3 Battle confirm writeback sequence
1. Player confirms final dice result
2. AI returns battle round result payload
3. Parse and validate result against current latest MVU
4. Write latest MVU round result
5. Update battle-local transient record/UI state
6. Commit is successful only when protected MVU state is updated without forbidden-path violations

### 3.4 Battle abort rollback sequence
1. Read stored pre-battle snapshot
2. Replace latest MVU with snapshot
3. Clear battle-local transient record
4. Do not append CombatLog
5. Do not change `RecentAffair`
6. Do not mutate chat-variable warehouse

## 4. Battle Snapshot Scope
The pre-battle snapshot must capture exactly these MVU fields:
- `World`
- `Avatar`
- `Backpack`
- `Tasks`
- `Party`
- `CurrentStatus`
- `VisibleArea`
- `VisibleCardSummaries`
- `Enemies`
- `BattleState` (if present)

The snapshot must **not** include the full formal card warehouse by default.

### 4.1 Restore rules on abort
On battle abort/close before terminal confirmation:
- restore all captured MVU fields exactly
- remove any battle-local transient state that is not part of the pre-battle snapshot
- do not append `<CombatLog>...</CombatLog>` to the latest message body
- do not overwrite `RecentAffair`
- do not mutate chat-variable warehouse

## 5. Prompt Contracts

### 5.1 Normal chat prompt input contract
Include only:
- `World`
- `Avatar`
- `Backpack`
- `Tasks`
- `Party`
- `CurrentStatus`
- `VisibleCardSummaries`
- current normal-chat dice pool

Exclude:
- full formal card warehouse
- historical `<DicePool>...</DicePool>`
- historical `<CombatLog>...</CombatLog>`
- battle-local transient UI state

### 5.2 Battle round prompt input contract
Include only:
- confirmed player strategy for the round
- confirmed dice result(s) for the round/check
- battle rules summary
- `Avatar`
- `Backpack` (**full backpack is visible; actual use/consumption remains allowed only when the player explicitly point-names the item in strategy**)
- `Party`
- `CurrentStatus`
- `VisibleCardSummaries`
- `Enemies`
- battle-local transient continuity context for the current battle

Exclude:
- full formal card warehouse
- historical normal-chat dice pools
- historical `<CombatLog>...</CombatLog>`
- unconfirmed reroll candidates

### 5.3 Final CombatLog contract
`<CombatLog>...</CombatLog>` is pure narrative output only:
- may summarize turns and outcome
- must not contain MVU update commands
- must only be appended after terminal victory/defeat confirmation

## 6. Structured AI Output Contracts

### 6.1 Normal chat writeback result payload
AI output for normal chat may contain:
- narrative text
- MVU update commands limited to whitelist fields
It must not contain:
- formal warehouse writes
- current visible-area control writes
- forbidden permanent stat writes

### 6.2 Card promotion draft payload
The card-promotion AI result must be a structured card draft that can be validated into these canonical formal card fields:
- `id` (assigned by script, not AI)
- `\u7c7b\u522b`
- `\u540d\u79f0`
- `\u7a00\u6709\u5ea6`
- `\u7528\u9014\u57df`
- `\u6807\u7b7e`
- `prompt\u7b56\u7565`
- `\u7b80\u4ecb`
- `\u6548\u679c\u63cf\u8ff0`
- `\u65e5\u5e38\u6458\u8981`
- `\u6218\u6597\u6458\u8981`
- `\u89e6\u53d1\u6761\u4ef6`
- `\u6765\u6e90`
- optional numeric helper fields

The script remains responsible for stable `cardId` assignment and final warehouse write.

### 6.3 Visible-summary contract
The hot-state visible summary representation is derived from formal cards and must contain only the fields needed for prompt use and UI quick display:
- card id reference
- `\u540d\u79f0`
- `\u7c7b\u522b`
- `\u65e5\u5e38\u6458\u8981`
- `\u6218\u6597\u6458\u8981`
- visible priority / placement metadata

It must not duplicate the full formal `\u6548\u679c\u63cf\u8ff0` if that field is designated warehouse-only.

### 6.4 Battle round result payload
The battle-round AI result must be parseable into:
- narrative round preview text
- latest-MVU updates limited to whitelist battle-hot fields
- optional battle-local summary for the floating UI
It must not:
- write formal warehouse directly
- append CombatLog mid-battle
- add/remove team members

### 6.5 Future special-check request envelope (P2 placeholder)
Not implemented in P1, but the extension seam is frozen as a structured request envelope that can later express:
- check type
- attribute
- dc
- roll count
- hidden/public visibility
- reroll allowed yes/no
AI may only request this envelope in P2; execution remains front-end controlled.

## 7. Observable Acceptance and Evidence Gates
### 7.1 Required proof artifacts
Before any stage can be declared complete, collect:
1. before/after variable snapshots for each critical mutation class
2. at least one rejected forbidden-path example
3. rollback proof for failed card promotion
4. rollback proof for battle abort
5. prompt-isolation proof for normal chat and battle prompt assembly
6. battle interaction order proof for `strategy -> roll -> reroll decision -> confirm -> AI push`

### 7.2 Tightened acceptance wording
- **Stable** means: succeeds across at least 3 consecutive fresh runs without latest-state misbinding or forbidden extra field drift
- **Unambiguous** means: the artifact defines exact source-of-truth, trigger, mutation path, and success/rollback condition
- **User-understandable failure** means: a visible failure message names the blocked step and states that protected state was unchanged/restored
- **Consistent** means: before/after snapshots show only contract-approved field changes and no extra protected-field drift

## 8. Planning Impact
These revisions do not expand product scope. They freeze field-level execution contracts needed to make P0/P1 planning executor-safe.
