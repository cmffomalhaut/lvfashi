# 模板 / 示例核验记录（针对 docs-requirements-srs）

## 1. 核验目标
验证 `.cursor/rules/*.mdc` 推导出的实现约束，是否能被仓内模板 / 示例 / util 工具直接支持。

## 2. 已核验文件
- `util/mvu.ts`
- `util/script.ts`
- `初始模板/角色卡/新建为src文件夹中的文件夹/schema.ts`
- `初始模板/角色卡/新建为src文件夹中的文件夹/界面/状态栏/store.ts`
- `初始模板/角色卡/新建为src文件夹中的文件夹/界面/状态栏/index.ts`
- `初始模板/角色卡/新建为src文件夹中的文件夹/脚本/变量结构/index.ts`
- `初始模板/前端界面/新建为src文件夹中的文件夹/index.html`
- `示例/角色卡示例/schema.ts`
- `示例/角色卡示例/界面/状态栏/index.ts`
- `示例/角色卡示例/脚本/变量结构/index.ts`
- `示例/脚本示例/加载和卸载时执行函数.ts`

## 3. 核验结论

### 3.1 MVU 初始化时序有现成模板支持
模板与示例都明确采用：
1. `await waitGlobalInitialized('Mvu')`
2. `await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'))`
3. `createApp(...).mount(...)`

这与 SRS 中“先等待 Mvu，再等待 stat_data，再挂载”的要求一致。

### 3.2 `defineMvuDataStore` 具备 latest 语义支持
`util/mvu.ts` 中：
- 当 `variable_option.type === 'message'`
- 且 `message_id === undefined || message_id === 'latest'`
- 会自动归一化为 `-1`

因此“始终跟随最新楼层”的 store 语义在工具层是可支持的。

### 3.3 模板默认 store 仍是“当前楼层模式”
`初始模板/角色卡/.../界面/状态栏/store.ts` 默认是：
- `defineMvuDataStore(Schema, { type: 'message', message_id: getCurrentMessageId() })`

这说明模板是按“界面附着在某个消息楼层”设计的。  
若本项目状态栏要跟随最新楼层，不能直接照搬该 store，必须改成 latest / -1 语义。

### 3.4 `createScriptIdIframe()` 可以直接支撑状态栏/战斗浮窗方案
`util/script.ts` 已提供：
- `createScriptIdIframe()`
- `teleportStyle()`
- `createScriptIdDiv()`

因此：
- 独立 iframe 战斗浮窗是可行的
- 脚本挂载式状态栏也是可行的
- 若挂在酒馆主体 DOM，则必须额外处理样式复制

### 3.5 生命周期约束与示例一致
示例脚本明确采用：
- `$(() => { ... })` 初始化
- `$(window).on('pagehide', ...)` 清理

这验证了“不用 DOMContentLoaded，不用 unload”的规则是实际可落地的。

### 3.6 `schema.ts` 的适用边界清晰
示例 `schema.ts` 已展示：
- clamp 数值
- record 动态键
- transform 清理数量 <= 0 的物品
- transform 生成派生字段

因此 SRS 中“结构定义、清洗、派生字段应优先放 schema”是成立的。  
同时，依赖 old/new diff 的约束并未出现在 schema 中，符合“应转移到脚本层 / MVU 事件层”的收紧判断。

### 3.7 变量结构注册脚本可直接复用模板范式
模板和示例中的变量结构脚本都只做一件事：
- 导入 `Schema`
- 调用 `registerMvuSchema(Schema)`

这支持 SRS 中“变量结构注册脚本保持最小职责”的要求。

### 3.8 `index.html` 静态骨架约束可直接满足
模板中的 `index.html` 只有：
- 空 head
- 简单 body
- `#app` 根节点

这与规则中的“`index.html` 只放静态 body 骨架，逻辑与样式走 TypeScript/Vue”一致。

## 4. 对 SRS 的收紧结果
本轮核验支持以下收紧：
1. 状态栏与战斗浮窗默认应基于 `createScriptIdIframe()`
2. latest 楼层语义在 `defineMvuDataStore()` 层可直接表达
3. 模板 store 的 `getCurrentMessageId()` 不能直接用于“始终跟随最新楼层”的状态栏
4. 依赖 old/new diff 的规则不应硬塞到 `schema.ts`
5. 生命周期必须统一走 jQuery + `pagehide`

## 5. 未发现的阻塞项
本轮模板/示例核验中，未发现会推翻当前 SRS 的硬阻塞。  
当前 SRS 与仓内模板/工具总体兼容，但状态栏 store 必须做“latest 语义改写”这一点不能遗漏。
