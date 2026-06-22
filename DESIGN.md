# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-06-01
- Primary product surfaces: Tavern Helper battle popup under `src/旅法师/界面/战斗浮窗` and launcher under `src/旅法师/脚本/战斗`.
- Evidence reviewed: `docs/通用AI战斗前端-接管入口.md`, `docs/通用AI战斗前端-执行计划.md`, `src/旅法师/界面/战斗浮窗/App.vue`, `src/旅法师/界面/战斗浮窗/global.css`, `src/旅法师/脚本/战斗/index.ts`, and the older reference at `D:/tavern_resource-main/src/zhanji/战姬/脚本/战斗系统/index.ts`.

## Brand
- Personality: compact RPG battle terminal, dramatic but usable, closer to a handheld game UI than an admin dashboard.
- Trust signals: visible state, explicit save/commit actions, clear error text, no silent blank screens.
- Avoid: full-width admin panels, default SaaS styling, oversized desktop layouts inside the popup.

## Product goals
- Goals: make battle operation reachable from a small floating window; keep normal play on the Battle page and move API, Prompt, rules, field selection, and debug tools to Settings.
- Non-goals: pixel-match Persona 5 or any copyrighted UI; build a full visual combat replay.
- Success signals: the popup opens at phone-like dimensions, defaults to a chat-like battle screen, and secondary tools are reachable through Settings.

## Personas and jobs
- Primary personas: Tavern users running MVU battles during roleplay.
- User jobs: start or resume battle, review selected fields, configure prompts/API, inspect debug payloads.
- Key contexts of use: overlaid on a running Tavern chat where screen space is limited.

## Information architecture
- Primary navigation: two pages: Battle and Settings.
- Core routes/screens: battle runtime chat, plus a settings surface containing field analysis/selection, API/prompt/rule config, and AI request/debug payloads.
- Content hierarchy: runtime chat, dice/action controls, and turn submission first; setup and diagnostics secondary.

## Design principles
- Principle 1: battle-first; never open directly into a long settings form.
- Principle 2: phone-sized; battle should read like a small chat client with compact action strips.
- Tradeoffs: dense controls are acceptable for advanced config, but hidden behind Settings.

## Visual language
- Color: black ink base, sharp red accents, warm paper text, small gold highlights.
- Typography: expressive game-terminal feel using available browser fonts without external font dependencies.
- Spacing/layout rhythm: compact single-column flow, non-sticky header, two-button navigation, chat bubbles for battle flow.
- Shape/radius/elevation: angular rounded cards with hard shadows, not soft SaaS panels.
- Motion: minimal; static first for Tavern compatibility.
- Imagery/iconography: text glyphs and short labels, no external image dependency.

## Components
- Existing components to reuse: `FieldTreeNode.vue`, existing buttons/forms/cards.
- New/changed components: two-page nav, compact battle-phone skin, chat-style battle messages, compressed action strips, collapsible details.
- Variants and states: active tab, disabled actions, error/ok hints.
- Token/component ownership: CSS variables in `src/旅法师/界面/战斗浮窗/global.css`.

## Accessibility
- Target standard: practical keyboard/touch accessibility in an iframe.
- Keyboard/focus behavior: native buttons, inputs, selects remain focusable.
- Contrast/readability: high contrast warm text on dark panels.
- Screen-reader semantics: nav uses `aria-label`; headings remain in content.
- Reduced motion and sensory considerations: avoid required animation.

## Responsive behavior
- Supported breakpoints/devices: fixed phone-like popup around 390x660 with viewport max constraints.
- Layout adaptations: all grids collapse to one column.
- Touch/hover differences: controls use larger minimum button heights.

## Interaction States
- Loading: visible loading text in launcher iframe.
- Empty: existing empty state text remains in relevant cards.
- Error: launcher/runtime errors render visible red error page.
- Success: ok hints remain visible.
- Disabled: disabled buttons retain native disabled behavior with opacity.
- Offline/slow network: API errors surface in existing hint/error regions.

## Content Voice
- Tone: concise RPG-console Chinese labels.
- Terminology: keep existing technical terms where they match implementation, e.g. `battle_session`, `selected_data`, `stat_data`.
- Microcopy rules: explain irreversible writes and commit boundaries briefly.

## Implementation Constraints
- Framework/styling system: Vue SFC plus plain CSS inside Tavern Helper iframe.
- Design-token constraints: no new package or external font dependency.
- Performance constraints: avoid heavy animation or images.
- Compatibility constraints: popup is launched from a global script iframe; mount only after iframe load.
- Test/screenshot expectations: manual Tavern testing remains final verification.

## Open Questions
- [ ] Whether Settings should later be split into a separate settings modal if the form surface keeps growing.
