# 通用 AI 战斗前端技术注意事项

本文档补充 [通用AI战斗前端设计草案.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端设计草案.md) 中不适合写成“设计协议”的实现细节、宿主约束和易错点。

目标：
- 供新聊天快速接管上下文
- 避免再次从头翻 MVU / 战斗脚本 / 状态写回逻辑
- 提醒后续实现时最容易踩坑的地方

## 1. 当前已确认的相关代码入口

### 1.1 战斗脚本主目录

目录：
- `src/旅法师/脚本/战斗`

当前职责分层：
- `index.ts`: 战斗浮窗入口，只负责打开/关闭/挂载界面
- `session.ts`: 战斗状态机核心
- `prompt.ts`: 战斗 prompt 载荷构造
- `resolve.ts`: 调用 `generateRaw` 做战斗预览结算
- `commit.ts`: 把战斗结果写回主状态
- `snapshot.ts`: 战前快照与放弃回滚

### 1.2 底座依赖

关键底座：
- `src/旅法师/schema.ts`
- `src/旅法师/脚本/MVU/state-access.ts`

这两个文件决定：
- `battle_session` 长什么样
- 主状态和战斗态怎么隔离编辑

## 2. MVU 宿主约束

### 2.1 数据核心入口是消息楼层变量的 `stat_data`

当前 MVU 相关规则明确：
- 战斗相关数据主要来自消息楼层变量
- 入口通常是 `Mvu.getMvuData({ type: 'message', message_id })`
- 真正数据在 `stat_data`

这意味着后续“通用战斗前端”虽然是跨项目复用，但宿主假设不是无限开放的。

当前默认前提应是：
- 运行在 Tavern Helper + MVU 生态
- 读取当前消息楼层的 `stat_data`

不要一开始为了“更通用”抽成任意状态源系统。

### 2.2 使用 MVU 前必须等待初始化

当前规则要求：

```ts
await waitGlobalInitialized('Mvu');
```

前端界面一般还要等待：

```ts
await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
```

如果省掉这一步，最容易出现：
- 界面启动时拿不到数据
- 分析字段时 `stat_data` 为空
- 战斗请求时读到半初始化状态

### 2.3 `schema.ts` 是可选增强，不是第一版强依赖

MVU 规则明确鼓励使用 `schema.ts`，但不是每个项目都能方便直接拿到。

所以当前应按两档考虑：

- 默认流程：只依赖完整 `stat_data`
- 增强流程：如果能拿到 `schema.ts`，用于辅助理解和校验

不要把字段分析流程设计成“没有 `schema.ts` 就不能运行”。

## 3. battle_session 与 MVU stat_data 不是一回事

这是后续最容易混的点。

### 3.1 当前战斗脚本里存在一个显式 `battle_session`

`session.ts` 和 `schema.ts` 明确表明：
- `battle_session` 是单独的临时战斗态
- 主状态和战斗态是分开的

### 3.2 `state-access.ts` 明确做了事务隔离

关键约束：
- `editCanonicalState`: 可改完整状态
- `editMainState`: 只能改主状态，不能改 `battle_session`
- `editBattleSession`: 只能改 `battle_session`，不能改主状态投影

这意味着后续通用战斗前端如果要接现有实现，必须想清楚：

是：
- 继续沿用 `battle_session` 作为本地战斗会话态

还是：
- 单独搞一套新的前端会话态

当前从稳定性出发，更建议：
- 前端配置和界面层可通用化
- 现有 battle session 骨架尽量复用

否则会出现两套战斗态并存的问题。

## 4. 现有战斗状态机的关键节点

来自 `session.ts` 的当前主流程：

1. `startBattle`
- 从主状态构建 `battle_session`
- 保存战前快照

2. `setStrategyText` / `rerollPlayerCheck`
- 写玩家策略与重掷

3. `confirmPlayerCheck`
- 锁定玩家检定
- 进入 AI 结算

4. `resolveConfirmedRound`
- 调用 AI 生成 `pending_preview`

5. `applyPendingPreview`
- 把预览写回战斗态
- 推进回合

6. `finishBattle`
- 将阶段置为 `finished`

7. `commitBattle`
- 把最终结果真正写回主状态

8. `abandonBattle`
- 回滚战前快照

这意味着：
- 当前代码并不是“AI 一次返回，直接写主状态”
- 中间有一个 `pending_preview` 审核/应用层

如果后续通用战斗前端保留逐回合模式，最好尊重这层中间态，而不是直接绕过。

## 5. `generateRaw` 与 MVU 自动更新不是同一条链

MVU 规则里一个关键点：
- 通过 `generate` / `generateRaw` 自己请求到的 AI 文本，不会自动触发 MVU 命令解析

如果未来某些流程仍然希望依赖 MVU 指令文本更新，需要显式调用：
- `Mvu.parseMessage(...)`
- 或显式写回 `replaceMvuData(...)`

但当前这套通用战斗前端设计已经偏向：
- AI 返回结构化 JSON
- 前端自己合并写回

所以第一版不建议再把 MVU 文本命令混进战斗协议。

## 6. MVU 写回应由前端模块执行，不由 AI 直接执行

当前设计已经明确：
- AI 返回“路径 -> 新值”的扁平更新
- 前端按路径 `set`
- 然后统一写回 MVU

这样做的原因：
- 更稳定
- 更可校验
- 更容易限制写回范围

不要改成：
- AI 返回 `op/add/remove`
- AI 直接构造整棵最终 `stat_data`

前者前端实现复杂，后者风险过大。

## 7. 更新粒度要保守

当前建议统一格式：

```json
{
  "stat_data.xxx": "新值"
}
```

实现时要注意：
- 优先最小必要粒度
- 只有整块明显变化时才整对象替换
- 清空优先用 `{}` 或 schema 允许的空值

不要为了改一个 HP 就回传整棵角色对象。

## 8. 字段分析阶段和正式战斗阶段必须分离

这是后续通用化的核心边界。

### 8.1 配置期

允许：
- 把完整 `stat_data` 发给 AI
- 让 AI 分析哪些字段相关

### 8.2 运行期

必须：
- 只发送选中的字段
- 不再默认全发完整 `stat_data`

如果这条边界不守住：
- 配置期和运行期会混
- token 开销会持续过大
- AI 会更容易漂移

## 9. 字段勾选页必须有完整路径树浏览

仅展示 AI 选中的字段是不够的。

必须同时能看到：
- 完整 `stat_data` 结构路径
- 路径值预览

否则玩家无法：
- 补 AI 漏掉的字段
- 修正命名奇怪的字段

这部分是通用战斗前端最重要的可用性组件之一。

## 10. 玩家指令优先级必须在 prompt 里写死

这是讨论中已经确认的关键体验要求。

单回合模式：
- 玩家本回合指令高优先级

快速整场模式：
- 玩家整体战斗倾向高优先级

但“高优先级”不等于无条件覆盖规则。

真正含义是：
- 只要不违反协议
- 不超出能力/资源/状态/环境限制
- AI 就必须优先照着玩家意图执行

如果 prompt 里不把这层写死，AI 很容易擅自换成它认为更优的套路。

## 11. 战利品不是固定阶段，而是结算模式之一

当前已确认三种结算模式：
- `no_loot`
- `direct_loot`
- `checked_loot`

技术上要注意：
- 切磋、擂台、训练、模拟战不该进入掉落流程
- 常规掉落战最好一次性结算并允许直接写回
- 只有需要额外搜刮/鉴定/拆解/采集检定时，才应拆成第二步

不要把“战斗结束后固定弹出战利品步骤”写死在流程里。

## 12. commit 与 drop 的最终整合点要谨慎

当前 `commit.ts` 已经承担：
- 主角回写
- 队伍回写
- 敌方清空
- 背包合并
- 近期事务写入
- 清空 `battle_session`

如果后续通用战斗前端要落地，必须明确两种可能：

### 12.1 继续沿用 `commit.ts` 风格
- 前端只产出结构化结果
- 再走统一 commit 层

### 12.2 前端直接把最终更新扁平写回 MVU
- 灵活
- 但更容易绕过原本的业务边界

当前从风险控制看，更推荐保留一个统一提交层，不建议让前端直接散写所有主状态字段。

## 13. 世界书和环境上下文应保持“可选增强”

当前设计里：
- 世界书上下文可选
- 楼层环境可选
- 详细额外背景可由玩家手动复制补充

这是合理的。

不要把它们做成强依赖，否则跨项目时接入门槛会变高。

## 14. 新聊天快速接管建议

如果后续开新聊天，优先让我读这几份文件：

1. [通用AI战斗前端设计草案.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端设计草案.md)
2. [通用AI战斗前端-技术注意事项.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-技术注意事项.md)
3. [战斗/README.md](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/README.md)

如果要继续看代码，再看：

1. `src/旅法师/脚本/战斗/session.ts`
2. `src/旅法师/schema.ts`
3. `src/旅法师/脚本/MVU/state-access.ts`

这样通常不需要再回头翻旧设计文档。
