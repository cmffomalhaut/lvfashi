# Ralplan Iteration 2 Addendum — mvu-battle

## Trigger
本轮加严来自 critic gate 的核心阻断：`battle_session` 的语义方案没有与 `util/mvu.ts` 的整对象 parse/write-back 机制完全对齐。

## 已完成修正
1. **决策升级为 Option D hybrid**
   - root `Schema` 显式包含可清空 `battle_session`
   - 普通状态栏 / prompt / 白名单通过投影继续把它视为“非主热状态”
2. **冻结 full-write ownership**
   - 仅允许统一 `state-access` 模块提交完整 `stat_data`
   - status bar / battle store / Vue 组件禁止直接 full-object write
3. **冻结 store contract**
   - `defineMvuDataStore` 在本项目中收紧为 read-sync / projection store
4. **补入并发安全 mutation 流程**
   - fresh-read -> scope-guard -> merge/apply -> validate -> commit -> post-check -> rollback/retry
5. **补入 message binding invariant**
   - `source_message_id` 成为同层恢复 / 跨层重建的主判据
6. **扩展验证矩阵**
   - 新增 field retention、multi-writer safety、prompt payload capture、rollback proof 等验证项

## Resulting judgment
修正后，先前“`battle_session` 可能被正常 store 轮询写回剥离”的关键矛盾已被计划层面显式化解；剩余风险主要转为执行质量风险，而不再是规划空缺风险。
