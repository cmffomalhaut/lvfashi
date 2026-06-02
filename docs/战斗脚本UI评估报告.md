# 战斗脚本 UI 评估报告

> 评估目标：`src/旅法师/界面/战斗浮窗/` 下的 App.vue (2102行) + global.css (2268行)
> 评估日期：2026-06-02

---

## 一、架构概览

```
index.ts          ← 入口，import App.vue + import global.css
App.vue (2102行)   ← 唯一组件，含全部 template + 全部 script
global.css (2268行) ← 唯一样式表，含三个视觉阶段的 CSS 定义
FieldTreeNode.vue  ← 唯一子组件
store.ts           ← Pinia store
```

**技术栈**：Vue 3 `<script setup>` + Pinia + TypeScript，浏览器直接加载（无构建步骤）。

---

## 二、当前设计评价

### 优点（值得保留）

| 方面 | 评价 |
|------|------|
| **视觉识别度** | Persona 5 风格的黑红金配色很有辨识度，和"战斗"的调性吻合 |
| **CSS 变量化** | 全局使用 `--p5-red`、`--p5-paper`、`--chat-bg` 等变量，换肤可行 |
| **按钮体系** | `btn / btn--primary / btn--warn / btn--ghost` 分类清晰，覆盖了所有操作类型 |
| **响应式断点** | 640px/720px/900px 三个断点覆盖了手机/平板/桌面 |
| **微交互** | 骰子投掷动画 `@keyframes dice-roll` 有雕琢感 |
| **BEM 命名** | 部分用了 BEM 约定（`selected-field-item__head`、`section-head--phone`） |
| **初始加载** | 错误边界 `renderFatalError` 覆盖了挂载失败场景 |

### 问题

#### P0 — 架构级问题

**1. 单组件怪物**

App.vue 2102 行同时包含 6 个设置 section + 战斗主界面 + 设置页面 + 骰子弹窗，全部在同一个文件里。

```
├── 设置页面 (lines 3-799)
│   ├── API section (25-147)
│   ├── 提示词 section (149-296)
│   ├── 规则 section (298-418)
│   ├── 世界书 section (420-507)
│   ├── 字段 section (508-723, 拆成3段)
│   └── 运行 section (724-797)
├── 战斗界面 (800-950)
└── 全部 1700+ 行 script 逻辑 (951-2102)
```

**后果**：
- 任何人想改"字段"设置都要翻阅 2102 行文件
- 命名冲突风险高
- 没法单独测试某个设置 section
- 协作时 git merge 必冲突

**参考方案**：MoRanJiangHu 把每个设置面板拆成独立组件，通过 `React.lazy` 懒加载：

```
SettingsModal.tsx
├── ApiSettings.tsx          ← 独立
├── PromptManager.tsx        ← 独立
├── StorageManager.tsx       ← 独立
├── WorldSettings.tsx        ← 独立
├── GameSettings.tsx         ← 独立
├── ... 等等
```

Vue 3 也可以这么做，用 `<component :is>` 或 `defineAsyncComponent`。

**2. CSS 三层叠加架构脆弱**

global.css 的 2268 行按顺序叠了三个视觉"阶段"：

1. **第一段（~1-550）**：手机/紧凑模式的暗色 P5 风格
2. **第二段（~550-900）**："Large chat-window skin" 浅色风格
3. **第三段（~900-2268）**：最终 P5 暗色高对比版本，覆盖浅色

第三段覆盖第二段的做法意味着：
- 浅色主题的代码可以删除（被全量覆盖了）
- 任何一个选择器如果在第三段漏了覆盖，就会显示出第二段的浅色样式
- 新加 UI 开发者很容易放错层

**3. 没有子组件拆分**

1 个组件 vs MoRanJiangHu 的 15+ 个独立设置组件。这意味着：
- 热更新时整个页面重渲染
- 无法按需加载（`React.lazy` 或 `defineAsyncComponent`）
- 每个 section 的模板逻辑无法独立测试

#### P1 — 体验问题

**4. 设置导航"药丸"在长页面滚动时消失**

- `section-switch` 虽然设了 `position: sticky; top: 0`，但在 mobile 下不 sticky（需要 z-index 确认）
- 6 个 section 用 `repeat(3, 1fr)` 排列，桌面端需要两行，视觉密度不均衡
- 没有"当前所在 section"的滚动高亮

**5. 保存反馈不够显眼**

- 成功/错误信息使用 `.hint` 类的文本，颜色变化不强烈
- 没有 toast 或 snackbar 级别的通知
- 没有操作成功后的"已保存"视觉确认（按钮状态的反馈可以更强）

**6. JSON 预览区的可读性差**

- `json-preview` 在暗色背景上显示白字 JSON，对于复杂嵌套结构非常吃力
- 没有语法高亮
- 长文本的直接展示而非可折叠树

**7. 字段选择的交互路径长**

当前"字段" section 拆成三个独立 card（字段分析、字段取舍、运行前预览），但三者都绑在同一个 `v-show="activeSettingsSection === 'fields'"` 下，导致页面超长滚动。

**8. 移动端和桌面端布局差异处理不一致**

- 有些区域用 `.battle-play--large` / `.battle-topbar--large` 做桌面端样式
- 有些区域用 `@media (max-width: 900px)` 做移动端样式
- 两种策略混用导致有些边界情况下样式打架

#### P2 — 细节问题

**9. 部分中文字符在 PowerShell 和终端编码下显示错乱**（非 UI 层的纯开发体验问题）

**10. 表单控件没有禁用状态样式**

- `btn:disabled` 只有 `cursor: not-allowed` 和灰度滤镜在 dice 按钮
- 其他按钮 disabled 时没有视觉区分

**11. 没有全局 loading 态**

- 保存/分析等操作只有文字提示，没有骨架屏或 loading spinner
- 用户无法判断一个耗时操作是否在进行中

---

## 三、优化建议（按优先级排序）

### 阶段一：结构拆分（先做，影响面最小但回报最大）

**1. 把 6 个设置 section 拆成独立 .vue 组件**

```
战斗浮窗/
├── App.vue                    ← 保留，只做布局和路由
├── settings/
│   ├── ApiSettings.vue        ← 现有 API section 抽出
│   ├── PromptSettings.vue     ← 现有提示词 section 抽出
│   ├── RulesSettings.vue      ← 现有规则 section 抽出
│   ├── WorldbookSettings.vue  ← 现有世界书 section 抽出
│   ├── FieldSettings.vue      ← 现有字段 section（三个子段合并）抽出
│   └── RuntimeSettings.vue    ← 现有运行 section 抽出
├── FieldTreeNode.vue          ← 已有
├── global.css
├── index.ts
└── store.ts
```

**收益**：
- 每个文件从 2102 行降到 ~200-400 行
- 理解/修改其中一个 section 不需要加载其他 section
- 每个 section 可以用 `defineAsyncComponent` 懒加载
- git diff 精准定位

**2. CSS 重构：删除已覆盖的 "Large chat-window skin" 层**

当前 global.css 中"Large"层（浅色主题）的样式被最终"P5 暗色"层全量覆盖。删除中间层，只保留最终生效的样式，可以减少约 400 行 CSS。

### 阶段二：体验提升（中优先级）

**3. 桌面端侧边栏导航**

把设置页顶部的药丸导航换成左侧固定侧边栏（220px），参考 MoRanJiangHu 的 `SettingsModal.tsx`：

- 侧边栏固定不随滚动移动
- 当前 section 高亮
- section 数量无限扩展也不溢出

**4. 桌面端部分设置区域改为两栏布局**

当前所有设置 section 在桌面上都是单列。可以针对字段选择、JSON 预览等区域做两栏：

```
┌─ 字段树 ───────┬─ 已选字段预览 ─┐
│                 │                │
│  (字段列表)     │  (已选字段)    │
│                 │                │
└─────────────────┴────────────────┘
```

**5. 添加 toast 通知系统**

```
toast(msg, type: 'success' | 'error' | 'warn')
```

替代当前散落的 `.hint--ok` / `.hint--error`。一个全局的 toast 组件，2 秒自动消失。

**6. 表单分组视觉层次**

当前表单是纯垂直堆叠。建议给相关字段加上视觉分组（fieldset 或 card）：

```
┌─ 基本设置 ─────────────┐
│  名称                   │
│  类型                   │
│  地址                   │
└────────────────────────┘
┌─ 高级设置 ─────────────┐
│  超时                   │
│  重试                   │
│  Header                 │
└────────────────────────┘
```

### 阶段三：优化（低优先级，但提升品质）

**7. 按钮禁用态样式**
**8. 骨架屏加载**
**9. JSON 语法高亮预览**
**10. 页面过渡动画**

---

## 四、与 MoRanJiangHu 的对比总结

| 维度 | 你当前 | MoRanJiangHu | 建议 |
|------|--------|--------------|------|
| 文件粒度 | 1 个文件 2102 行 | 15+ 个文件，每个~200-700 行 | **阶段一** |
| 懒加载 | 无 | React.lazy 每个 tab | **阶段一** |
| CSS 架构 | 单文件 2268 行 | CSS Modules | **阶段一/二** |
| 桌面导航 | 药丸条 | 固定侧边栏 | **阶段二** |
| 保存反馈 | 文字 hint | pushNotice toast | **阶段二** |
| 供应商预设 | 4 个 | 含国内厂商 | 补一下就行 |
| 设置导入导出 | 只有 prompt 可导入 | 完整设置导入导出 | 以后再说 |

---

## 五、建议的行动路径

1. **(现在就可以做)** 把 App.vue 的 6 个 settings section 的 template 块和对应的逻辑函数拆到 6 个独立 `settings/*.vue` 文件
   - 每拆一个就可以单独理解、测试、修改
   - 在 App.vue 里用 `defineAsyncComponent` 导入
   - 这份工作可以交给其他人并行做（一人拆一个 section）

2. **(拆完后)** 清理 global.css：删除被全量覆盖的中间样式层

3. **(有精力时)** 把顶部药丸改成侧边栏，加 toast，加禁用态样式

---

*当前代码规模：`App.vue` 2102 行 + `global.css` 2268 行 = 4370 行*
*阶段一完成后预期：`App.vue` ~300 行 + 各 `settings/*.vue` 200-400 行 + `global.css` ~1500 行*
