<template>
  <div class="battle-shell">
    <header class="battle-header">
      <div>
        <h1>旅法师战斗浮窗</h1>
        <p>战斗临时状态写入 battle_session；主状态只在终局提交或放弃时变更。</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--ghost" @click="close">隐藏</button>
      </div>
    </header>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>API 配置</h2>
          <p class="hint">长期配置保存到脚本变量 `battle_frontend_settings`，不写入 `battle_session`。</p>
        </div>
        <div class="button-grid">
          <button class="btn" :disabled="isApiBusy" @click="createNewApiProfile">新建接口</button>
          <button class="btn btn--primary" :disabled="!apiProfileDraft || isApiBusy" @click="saveApiProfileDraft">
            保存当前接口
          </button>
          <button class="btn btn--warn" :disabled="!apiProfileDraft || !canRemoveApiProfile || isApiBusy" @click="removeCurrentApiProfile">
            删除当前接口
          </button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <label class="form-field">
            <span>当前激活接口</span>
            <select class="form-control" :value="activeApiProfile?.id ?? ''" :disabled="isApiBusy" @change="changeActiveApiProfile">
              <option v-for="profile in apiProfiles" :key="profile.id" :value="profile.id">
                {{ profile.name || '未命名接口' }}
              </option>
            </select>
          </label>

          <div v-if="activeApiProfile?.last_test_result" class="status-box" :class="activeApiProfile.last_test_result.ok ? 'status-box--ok' : 'status-box--error'">
            <strong>{{ activeApiProfile.last_test_result.ok ? '最近一次测试成功' : '最近一次测试失败' }}</strong>
            <span>{{ activeApiProfile.last_test_result.message || '无额外说明' }}</span>
            <span>检查时间：{{ formatTimestamp(activeApiProfile.last_test_result.checked_at) }}</span>
          </div>

          <p v-if="lastApiMessage" class="hint hint--ok">{{ lastApiMessage }}</p>
          <p v-if="lastApiError" class="hint hint--error">{{ lastApiError }}</p>

          <div v-if="discoveredActiveModels.length" class="model-list">
            <h3>已发现模型</h3>
            <div class="chip-list">
              <button
                v-for="modelOption in discoveredActiveModels"
                :key="modelOption"
                class="chip"
                type="button"
                @click="applyDiscoveredModel(modelOption)"
              >
                {{ modelOption }}
              </button>
            </div>
          </div>
        </article>

        <article v-if="apiProfileDraft" class="settings-panel">
          <div class="form-grid">
            <label class="form-field">
              <span>名称</span>
              <input v-model="apiProfileDraft.name" class="form-control" type="text" placeholder="例如：默认 OpenAI 兼容接口" />
            </label>
            <label class="form-field">
              <span>provider_type</span>
              <select v-model="apiProfileDraft.provider_type" class="form-control">
                <option value="openai_compatible">openai_compatible</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label class="form-field form-field--wide">
              <span>base_url</span>
              <input v-model="apiProfileDraft.base_url" class="form-control" type="text" placeholder="https://example.com/v1" />
            </label>
            <label class="form-field form-field--wide">
              <span>api_key</span>
              <input v-model="apiProfileDraft.api_key" class="form-control" type="password" placeholder="sk-..." />
            </label>
            <label class="form-field form-field--wide">
              <span>model</span>
              <input v-model="apiProfileDraft.model" class="form-control" type="text" placeholder="gpt-4.1-mini / custom-model-id" />
            </label>
            <label class="form-field">
              <span>model_fetch_path</span>
              <input v-model="apiProfileDraft.model_fetch_path" class="form-control" type="text" placeholder="/v1/models" />
            </label>
            <label class="form-field">
              <span>response_path</span>
              <input v-model="apiProfileDraft.model_discovery.response_path" class="form-control" type="text" placeholder="data" />
            </label>
            <label class="form-field">
              <span>timeout_ms</span>
              <input v-model.number="apiProfileDraft.default_request_options.timeout_ms" class="form-control" type="number" min="1000" step="1000" />
            </label>
            <label class="form-field">
              <span>retry_limit</span>
              <input v-model.number="apiProfileDraft.default_request_options.retry_limit" class="form-control" type="number" min="0" step="1" />
            </label>
            <label class="check-field">
              <input v-model="apiProfileDraft.model_discovery.use_auth_header" type="checkbox" />
              <span>模型列表请求带 Authorization 头</span>
            </label>
          </div>

          <div class="button-grid">
            <button class="btn" :disabled="isApiBusy" @click="discoverModels">拉取模型列表</button>
            <button class="btn btn--primary" :disabled="isApiBusy" @click="testCurrentApiProfile">测试连接</button>
          </div>
        </article>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Prompt 配置</h2>
          <p class="hint">四类 Prompt 保存到当前战斗配置 `BattleProfile.prompts`，不写入 `battle_session`。</p>
        </div>
        <div class="button-grid">
          <button class="btn" :disabled="isApiBusy" @click="createNewBattleProfile">新建战斗配置</button>
          <button class="btn btn--primary" :disabled="!battleProfileDraft || isApiBusy" @click="saveBattleProfileDraft">
            保存当前战斗配置
          </button>
          <button
            class="btn btn--warn"
            :disabled="!battleProfileDraft || !canRemoveBattleProfile || isApiBusy"
            @click="removeCurrentBattleProfile"
          >
            删除当前战斗配置
          </button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <label class="form-field">
            <span>当前激活战斗配置</span>
            <select
              class="form-control"
              :value="activeBattleProfile?.id ?? ''"
              :disabled="isApiBusy"
              @change="changeActiveBattleProfile"
            >
              <option v-for="profile in battleProfiles" :key="profile.id" :value="profile.id">
                {{ profile.name || '未命名战斗配置' }}
              </option>
            </select>
          </label>

          <div v-if="battleProfileDraft" class="form-grid">
            <label class="form-field">
              <span>配置名称</span>
              <input v-model="battleProfileDraft.name" class="form-control" type="text" placeholder="例如：默认战斗协议" />
            </label>
            <label class="form-field">
              <span>绑定 API</span>
              <select v-model="battleProfileDraft.api_profile_id" class="form-control">
                <option :value="null">跟随当前激活接口</option>
                <option v-for="profile in apiProfiles" :key="profile.id" :value="profile.id">
                  {{ profile.name || '未命名接口' }}
                </option>
              </select>
            </label>
            <label class="form-field form-field--wide">
              <span>说明</span>
              <textarea
                v-model="battleProfileDraft.description"
                class="form-control form-control--textarea"
                rows="3"
                placeholder="记录这一套 Prompt 面向什么战斗协议或项目"
              ></textarea>
            </label>
          </div>

          <p v-if="promptNotice" class="hint hint--ok">{{ promptNotice }}</p>
          <p v-if="promptError" class="hint hint--error">{{ promptError }}</p>
        </article>

        <article v-if="battleProfileDraft && activePromptTemplate" class="settings-panel prompt-editor">
          <div class="prompt-toolbar">
            <div class="prompt-list">
              <button
                v-for="item in promptTemplateOptions"
                :key="item.key"
                class="prompt-item"
                :class="activePromptKey === item.key ? 'prompt-item--active' : ''"
                type="button"
                @click="activePromptKey = item.key"
              >
                <strong>{{ item.label }}</strong>
                <span>{{ battleProfileDraft.prompts[item.key].enabled ? '已启用' : '已禁用' }}</span>
              </button>
            </div>

            <div class="button-grid">
              <button class="btn" type="button" @click="exportPromptConfig">导出 Prompt JSON</button>
              <label class="btn btn--ghost file-trigger">
                <input type="file" accept=".json,application/json" @change="importPromptConfig" />
                <span>导入 Prompt JSON</span>
              </label>
            </div>
          </div>

          <div class="textarea-stack">
            <div class="prompt-meta-grid">
              <label class="check-field">
                <input v-model="activePromptTemplate.enabled" type="checkbox" />
                <span>启用当前 Prompt</span>
              </label>
              <label class="form-field">
                <span>标题</span>
                <input v-model="activePromptTemplate.title" class="form-control" type="text" />
              </label>
              <label class="form-field">
                <span>版本</span>
                <input v-model.number="activePromptTemplate.version" class="form-control" type="number" min="1" step="1" />
              </label>
              <label class="form-field form-field--wide">
                <span>备注</span>
                <textarea
                  v-model="activePromptTemplate.notes"
                  class="form-control form-control--textarea"
                  rows="2"
                  placeholder="记录这类 Prompt 的适用协议、注意事项或调参习惯"
                ></textarea>
              </label>
            </div>

            <label class="form-field">
              <span>system_prompt</span>
              <textarea
                v-model="activePromptTemplate.system_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="9"
                placeholder="系统提示词"
              ></textarea>
            </label>
            <label class="form-field">
              <span>user_prompt</span>
              <textarea
                v-model="activePromptTemplate.user_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="9"
                placeholder="用户提示词模板"
              ></textarea>
            </label>
            <label class="form-field">
              <span>output_contract_prompt</span>
              <textarea
                v-model="activePromptTemplate.output_contract_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="7"
                placeholder="输出契约提示词"
              ></textarea>
            </label>
          </div>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" class="card">
      <div class="section-head">
        <div>
          <h2>战斗规则配置</h2>
          <p class="hint">这一层只编辑 `BattleProfile` 的运行模式、结算模式和规则文本，不改 `battle_session` 事务态。</p>
        </div>
        <div class="button-grid">
          <button class="btn btn--primary" :disabled="isApiBusy || isFieldAnalysisBusy" @click="saveBattleProfileDraft">
            保存规则与 Prompt
          </button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="form-grid">
            <label class="form-field">
              <span>run_mode</span>
              <select v-model="battleProfileDraft.run_mode" class="form-control">
                <option value="dice_driven">dice_driven</option>
                <option value="freeform">freeform</option>
              </select>
            </label>
            <label class="form-field">
              <span>default_turn_mode</span>
              <select v-model="battleProfileDraft.default_turn_mode" class="form-control">
                <option value="round_based">round_based</option>
                <option value="full_battle">full_battle</option>
              </select>
            </label>
            <label class="form-field">
              <span>settlement_mode</span>
              <select v-model="battleProfileDraft.settlement_mode" class="form-control">
                <option value="no_loot">no_loot</option>
                <option value="direct_loot">direct_loot</option>
                <option value="checked_loot">checked_loot</option>
              </select>
            </label>
            <label class="form-field">
              <span>player_intent_priority</span>
              <input :value="battleProfileDraft.rules.player_intent_priority" class="form-control" type="text" disabled />
            </label>
            <label class="form-field form-field--wide">
              <span>battle_protocol</span>
              <textarea
                v-model="battleProfileDraft.rules.battle_protocol"
                class="form-control form-control--textarea form-control--code"
                rows="8"
                placeholder="填写战斗协议、单位行动限制、资源消耗规则、玩家意图优先级等"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>loot_protocol</span>
              <textarea
                v-model="battleProfileDraft.rules.loot_protocol"
                class="form-control form-control--textarea form-control--code"
                rows="6"
                placeholder="填写掉落结算、搜刮/鉴定/拆解检定等规则"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>extra_world_rules</span>
              <textarea
                v-model="battleProfileDraft.rules.extra_world_rules"
                class="form-control form-control--textarea form-control--code"
                rows="5"
                placeholder="填写项目特有世界规则、宿主约束或额外补充裁定"
              ></textarea>
            </label>
          </div>
        </article>

        <article class="settings-panel">
          <div class="state-list">
            <div class="state-list__item">
              <strong>模式提醒</strong>
              <span>`freeform` 下后续要隐藏投骰子和暗骰模块；`dice_driven` 下重新启用。</span>
            </div>
            <div class="state-list__item">
              <strong>当前运行模式</strong>
              <span>{{ battleProfileDraft.run_mode }}</span>
            </div>
            <div class="state-list__item">
              <strong>默认回合模式</strong>
              <span>{{ battleProfileDraft.default_turn_mode }}</span>
            </div>
            <div class="state-list__item">
              <strong>当前结算模式</strong>
              <span>{{ battleProfileDraft.settlement_mode }}</span>
            </div>
          </div>

          <div class="check-stack">
            <label class="check-field">
              <input v-model="battleProfileDraft.rules.allow_full_stat_data_in_analysis" type="checkbox" />
              <span>字段分析阶段允许发送完整 stat_data</span>
            </label>
            <label class="check-field">
              <input v-model="battleProfileDraft.rules.forbid_full_stat_data_in_runtime" type="checkbox" />
              <span>正式运行阶段禁止发送完整 stat_data</span>
            </label>
            <label class="check-field">
              <input v-model="battleProfileDraft.rules.schema_hint_enabled" type="checkbox" />
              <span>允许后续使用 schema hint 作为额外辅助</span>
            </label>
          </div>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" class="card">
      <div class="section-head">
        <div>
          <h2>字段分析调用层</h2>
          <p class="hint">当前阶段只打通“读取当前楼层 stat_data -> 调 AI -> 回写 `field_selection`”这条链路。</p>
        </div>
        <div class="button-grid">
          <button class="btn btn--primary" :disabled="isFieldAnalysisBusy || isApiBusy" @click="runFieldAnalysis">
            {{ isFieldAnalysisBusy ? '分析中...' : '分析当前楼层字段' }}
          </button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="state-list">
            <div class="state-list__item">
              <strong>来源楼层</strong>
              <span>{{ sourceMessageId }}</span>
            </div>
            <div class="state-list__item">
              <strong>建议字段数</strong>
              <span>{{ analyzedFields.length }}</span>
            </div>
            <div class="state-list__item">
              <strong>上次分析时间</strong>
              <span>{{ formatTimestamp(battleProfileDraft.field_selection.last_analysis_at ?? 0) }}</span>
            </div>
            <div class="state-list__item">
              <strong>待人工复核</strong>
              <span>{{ battleProfileDraft.field_selection.manual_review_required ? '是' : '否' }}</span>
            </div>
          </div>

          <p v-if="lastFieldAnalysisMessage" class="hint hint--ok">{{ lastFieldAnalysisMessage }}</p>
          <p v-if="lastFieldAnalysisError" class="hint hint--error">{{ lastFieldAnalysisError }}</p>

          <div v-if="analysisWarnings.length" class="preview-block">
            <h3>分析警告</h3>
            <ul class="info-list">
              <li v-for="warning in analysisWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>

          <div v-if="lastFieldAnalysisPayload" class="preview-block">
            <h3>最近一次分析载荷</h3>
            <pre class="json-preview">{{ formatJson(lastFieldAnalysisPayload) }}</pre>
          </div>
        </article>

        <article class="settings-panel">
          <div v-if="analyzedFields.length" class="analysis-result-list">
            <div v-for="field in analyzedFields" :key="field.path" class="analysis-result-item">
              <div class="analysis-result-head">
                <strong>{{ field.label || field.path }}</strong>
                <code>{{ field.path }}</code>
              </div>
              <p>{{ field.reason || '无额外说明' }}</p>
              <span>{{ field.enabled ? '已启用' : '已禁用' }} · 来源 {{ field.source }}</span>
            </div>
          </div>
          <p v-else class="hint">还没有字段分析结果。运行后会把 AI 返回的 `fields[]` 和 `warnings[]` 写进当前战斗配置。</p>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" class="card">
      <div class="section-head">
        <div>
          <h2>字段勾选树 UI</h2>
          <p class="hint">左侧浏览完整 `stat_data` 路径树，右侧维护当前启用字段。这里的改动先写入当前战斗配置草稿，再统一保存。</p>
        </div>
        <div class="button-grid">
          <button class="btn btn--primary" :disabled="!battleProfileDraft" @click="saveBattleProfileDraft">保存字段配置</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="manual-field-box">
            <label class="form-field">
              <span>手动补选路径</span>
              <input v-model="manualFieldPath" class="form-control" type="text" placeholder="例如：主角.当前化身.HP当前" />
            </label>
            <div class="button-grid">
              <button class="btn" type="button" @click="addManualField">按路径补选</button>
            </div>
          </div>

          <div class="field-tree-list">
            <FieldTreeNode
              v-for="node in fieldTree"
              :key="node.key"
              :node="node"
              :selected-paths="selectedFieldPaths"
              @toggle-select="addFieldFromTree"
            />
          </div>
        </article>

        <article class="settings-panel">
          <div v-if="battleProfileDraft.field_selection.selected_fields.length" class="selected-field-list">
            <div
              v-for="field in battleProfileDraft.field_selection.selected_fields"
              :key="field.path"
              class="selected-field-item"
            >
              <div class="selected-field-item__head">
                <code>{{ field.path }}</code>
                <div class="button-grid">
                  <button class="btn btn--ghost btn--sm" type="button" @click="toggleSelectedField(field.path)">
                    {{ field.enabled ? '禁用' : '启用' }}
                  </button>
                  <button class="btn btn--warn btn--sm" type="button" @click="removeSelectedField(field.path)">删除</button>
                </div>
              </div>

              <div class="form-grid">
                <label class="form-field">
                  <span>label</span>
                  <input
                    :value="field.label"
                    class="form-control"
                    type="text"
                    @input="updateSelectedField(field.path, { label: ($event.target as HTMLInputElement).value })"
                  />
                </label>
                <label class="form-field">
                  <span>value_kind</span>
                  <input :value="field.value_kind" class="form-control" type="text" disabled />
                </label>
                <label class="form-field form-field--wide">
                  <span>reason</span>
                  <textarea
                    :value="field.reason"
                    class="form-control form-control--textarea"
                    rows="2"
                    @input="updateSelectedField(field.path, { reason: ($event.target as HTMLTextAreaElement).value })"
                  ></textarea>
                </label>
              </div>

              <span class="selected-field-item__meta">来源 {{ field.source }} · {{ field.enabled ? '已启用' : '已禁用' }}</span>
            </div>
          </div>
          <p v-else class="hint">当前还没有勾选字段。可以先跑一次字段分析，再从左侧路径树补选或修正。</p>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" class="card">
      <div class="section-head">
        <div>
          <h2>`selected_data` 抽取器</h2>
          <p class="hint">这里实时预览从当前完整 `stat_data` 按启用字段抽出的精简数据，并提示缺失路径。</p>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="state-list">
            <div class="state-list__item">
              <strong>启用字段数</strong>
              <span>{{ enabledFieldCount }}</span>
            </div>
            <div class="state-list__item">
              <strong>缺失路径警告</strong>
              <span>{{ selectedDataWarnings.length }}</span>
            </div>
            <div class="state-list__item">
              <strong>运行期全量发送限制</strong>
              <span>{{ battleProfileDraft.rules.forbid_full_stat_data_in_runtime ? '已启用' : '未启用' }}</span>
            </div>
          </div>

          <div v-if="selectedDataWarnings.length" class="preview-block">
            <h3>抽取警告</h3>
            <ul class="info-list">
              <li v-for="warning in selectedDataWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>
        </article>

        <article class="settings-panel">
          <div class="preview-block">
            <h3>当前 `selected_data` 预览</h3>
            <pre class="json-preview">{{ formatJson(selectedDataPreview) }}</pre>
          </div>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" class="card">
      <div class="section-head">
        <div>
          <h2>AI 请求层</h2>
          <p class="hint">这里保留手动实验入口；下面“玩家检定 / 回合预览”区域已经开始接入正式执行链。</p>
        </div>
        <div class="button-grid">
          <button class="btn btn--primary" :disabled="isRuntimeRequestBusy || !enabledFieldCount" @click="sendSingleRound">
            {{ isRuntimeRequestBusy ? '请求中...' : '发送单回合请求' }}
          </button>
          <button class="btn" :disabled="isRuntimeRequestBusy || !enabledFieldCount" @click="sendFullBattle">发送整场请求</button>
          <button class="btn" :disabled="isRuntimeRequestBusy || !enabledFieldCount" @click="sendLootResolution">发送战利品请求</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="form-grid">
            <label class="form-field form-field--wide">
              <span>player_command</span>
              <textarea
                v-model="runtimePlayerCommand"
                class="form-control form-control--textarea"
                rows="4"
                placeholder="输入单回合策略或整场战斗倾向"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>dice_inputs JSON</span>
              <textarea
                v-model="runtimeDiceInputsDraft"
                class="form-control form-control--textarea form-control--code"
                rows="4"
                placeholder="{ }"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>额外指令</span>
              <textarea
                v-model="runtimeExtraInstructions"
                class="form-control form-control--textarea"
                rows="3"
                placeholder="补充本次请求的临时限制或特殊说明"
              ></textarea>
            </label>
          </div>

          <p v-if="lastRuntimeRequestMessage" class="hint hint--ok">{{ lastRuntimeRequestMessage }}</p>
          <p v-if="runtimeDraftError" class="hint hint--error">{{ runtimeDraftError }}</p>
          <p v-if="lastRuntimeRequestError" class="hint hint--error">{{ lastRuntimeRequestError }}</p>
        </article>

        <article class="settings-panel">
          <div class="preview-block">
            <h3>最近一次运行载荷</h3>
            <pre class="json-preview">{{ formatJson(lastRuntimePayload) }}</pre>
          </div>
          <div class="preview-block">
            <h3>最近一次解析结果</h3>
            <pre class="json-preview">{{ formatJson(lastRuntimeResult) }}</pre>
          </div>
        </article>
      </div>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>会话状态</h2>
        <dl>
          <div><dt>激活</dt><dd>{{ battleSession.激活 ? '是' : '否' }}</dd></div>
          <div><dt>mode</dt><dd>{{ battleSession.meta.mode }}</dd></div>
          <div><dt>phase</dt><dd>{{ battleSession.phase }}</dd></div>
          <div><dt>source_message_id</dt><dd>{{ battleSession.meta.source_message_id }}</dd></div>
          <div><dt>当前楼层</dt><dd>{{ sourceMessageId }}</dd></div>
          <div><dt>round</dt><dd>{{ battleSession.round.round_no }}</dd></div>
          <div><dt>acting_side</dt><dd>{{ battleSession.round.acting_side }}</dd></div>
          <div><dt>checkpoint</dt><dd>{{ roundCheckpointDirty ? '有未提交回合状态' : '回合已落点' }}</dd></div>
          <div><dt>AI 结算</dt><dd>{{ isResolving || isRuntimeRequestBusy ? '进行中' : '空闲' }}</dd></div>
        </dl>
      </article>

      <article class="card">
        <h2>入口</h2>
        <div class="button-grid">
          <button class="btn" @click="startBattle">开始战斗</button>
          <button class="btn" @click="resumeOrRebuild">恢复 / 重建</button>
          <button class="btn" @click="forceRebuild">强制重建</button>
          <button class="btn btn--warn" :disabled="!battleSession.激活" @click="abandon">放弃并回滚</button>
        </div>
        <p class="hint">敌方数量：{{ enemyCount }} / 可恢复：{{ canResume ? '是' : '否' }}</p>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>玩家检定</h2>
        <dl>
          <div><dt>run_mode</dt><dd>{{ battleProfileDraft?.run_mode || '未配置' }}</dd></div>
          <div><dt>turn_mode</dt><dd>{{ battleProfileDraft?.default_turn_mode || '未配置' }}</dd></div>
          <div v-if="!isFreeformRuntime"><dt>roll</dt><dd>{{ battleSession.player_check.roll }}</dd></div>
          <div v-if="!isFreeformRuntime"><dt>reroll_used</dt><dd>{{ battleSession.player_check.reroll_used }}/3</dd></div>
          <div><dt>confirmed</dt><dd>{{ battleSession.player_check.confirmed ? '是' : '否' }}</dd></div>
        </dl>
        <p v-if="isFreeformRuntime" class="hint">当前为 `freeform`，已隐藏明骰/暗骰操作，正式执行时仅发送玩家指令与选中字段。</p>
        <textarea v-model="strategyDraft" class="strategy-box" placeholder="输入本回合策略"></textarea>
        <div class="button-grid">
          <button class="btn" @click="saveStrategy">保存策略</button>
          <button
            v-if="!isFreeformRuntime"
            class="btn"
            :disabled="isResolving || isRuntimeRequestBusy || battleSession.player_check.confirmed || battleSession.player_check.reroll_used >= 3"
            @click="reroll"
          >
            重掷明骰
          </button>
          <button
            class="btn btn--primary"
            :disabled="isResolving || isRuntimeRequestBusy || battleSession.player_check.confirmed"
            @click="confirm"
          >
            {{ executionButtonLabel }}
          </button>
          <button class="btn" :disabled="isResolving || isRuntimeRequestBusy || !battleSession.player_check.confirmed" @click="resolveAgain">
            {{ rerunButtonLabel }}
          </button>
          <button class="btn btn--ghost" :disabled="isResolving || isRuntimeRequestBusy" @click="useMockPreview">使用本地预览兜底</button>
        </div>
        <p v-if="lastResolveError" class="hint hint--error">AI 结算失败：{{ lastResolveError }}</p>
        <p v-if="lastRuntimeRequestError" class="hint hint--error">正式执行失败：{{ lastRuntimeRequestError }}</p>
      </article>

      <article class="card">
        <h2>回合预览</h2>
        <p>{{ battleSession.pending_preview.summary || '等待确认后生成预览。' }}</p>
        <p v-if="battleSession.runtime.latest_narration" class="hint">{{ battleSession.runtime.latest_narration }}</p>
        <div class="button-grid">
          <button
            class="btn btn--primary"
            :disabled="isResolving || isRuntimeRequestBusy || battleSession.phase === 'finished' || !battleSession.pending_preview.summary"
            @click="applyPreview"
          >
            提交到下一回合
          </button>
          <button class="btn btn--warn" :disabled="isRuntimeRequestBusy || !battleSession.pending_preview.summary" @click="finishBattle">
            标记终局
          </button>
          <button v-if="canResolveLoot" class="btn" :disabled="isRuntimeRequestBusy" @click="resolveLoot">
            处理战利品结算
          </button>
        </div>
        <dl>
          <div><dt>allies</dt><dd>{{ Object.keys(battleSession.combatants.allies).length }}</dd></div>
          <div><dt>enemies</dt><dd>{{ Object.keys(battleSession.combatants.enemies).length }}</dd></div>
          <div><dt>dark_pool</dt><dd>{{ battleSession.shared_dark_pool.values.join(', ') || '—' }}</dd></div>
          <div><dt>dark_pool_cursor</dt><dd>{{ battleSession.shared_dark_pool.cursor }}</dd></div>
          <div><dt>world_events</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_world_events).length }}</dd></div>
          <div><dt>loot</dt><dd>{{ Object.keys(battleSession.pending_preview.proposed_loot).length }}</dd></div>
          <div><dt>battle_end</dt><dd>{{ battleSession.runtime.latest_battle_end ? '是' : '否' }}</dd></div>
          <div><dt>settlement</dt><dd>{{ currentSettlementText }}</dd></div>
          <div><dt>updates</dt><dd>{{ accumulatedUpdateCount }}</dd></div>
        </dl>
        <div v-if="battleSession.runtime.latest_status_changes.length" class="preview-block">
          <h3>状态变化</h3>
          <ul class="info-list">
            <li v-for="item in battleSession.runtime.latest_status_changes" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div v-if="battleSession.runtime.latest_resource_changes.length" class="preview-block">
          <h3>资源变化</h3>
          <ul class="info-list">
            <li v-for="item in battleSession.runtime.latest_resource_changes" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div v-if="battleSession.runtime.latest_warnings.length" class="preview-block">
          <h3>执行警告</h3>
          <ul class="info-list">
            <li v-for="item in battleSession.runtime.latest_warnings" :key="item">{{ item }}</li>
          </ul>
        </div>
        <p v-if="battleSession.phase === 'finished' && battleProfileDraft?.settlement_mode === 'no_loot'" class="hint">
          当前为 `no_loot`，战斗结束后不会进入掉落流程。
        </p>
        <p v-if="battleSession.phase === 'finished' && battleProfileDraft?.settlement_mode === 'checked_loot'" class="hint">
          当前为 `checked_loot`，需要额外点击“处理战利品结算”后才会生成掉落草案。
        </p>
        <div v-if="accumulatedUpdateCount" class="preview-block">
          <h3>累计待写回更新</h3>
          <pre class="json-preview">{{ formatJson(battleSession.runtime.accumulated_updates) }}</pre>
        </div>
        <div v-if="latestFullBattleResult" class="preview-block">
          <h3>整场回合摘要</h3>
          <ul class="info-list">
            <li v-for="round in latestFullBattleResult.rounds" :key="round.round_index">
              <strong>第{{ round.round_index }}回合</strong>
              <span>{{ round.summary || round.narration || '无摘要' }}</span>
            </li>
          </ul>
          <p class="hint">{{ latestFullBattleResult.battle_report }}</p>
        </div>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_world_events).length" class="preview-block">
          <h3>近期事务草案</h3>
          <ul class="info-list">
            <li v-for="(event, key) in battleSession.pending_preview.proposed_world_events" :key="key">
              <strong>{{ key }}</strong>
              <span>{{ event }}</span>
            </li>
          </ul>
        </div>
        <div v-if="Object.keys(battleSession.pending_preview.proposed_loot).length" class="preview-block">
          <h3>战利品草案</h3>
          <ul class="info-list">
            <li v-for="loot in Object.values(battleSession.pending_preview.proposed_loot)" :key="loot.id">
              <strong>{{ loot.名称 }}</strong>
              <span>x{{ loot.数量 }}</span>
            </li>
          </ul>
        </div>
        <div v-if="latestLootResult?.loot_result.special_findings.length" class="preview-block">
          <h3>特殊发现</h3>
          <ul class="info-list">
            <li v-for="finding in latestLootResult.loot_result.special_findings" :key="finding.name + finding.reason">
              <strong>{{ finding.name || '未命名发现' }}</strong>
              <span>{{ finding.description || finding.reason || '无说明' }}</span>
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="summary-grid">
      <article class="card">
        <h2>终局提交</h2>
        <div class="mode-switch">
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="summary_only" />
            <span>只写入简要总结</span>
          </label>
          <label class="radio-option">
            <input v-model="outputMode" type="radio" value="full_log" />
            <span>写入完整战斗记录</span>
          </label>
        </div>
        <textarea v-model="summaryDraft" class="strategy-box strategy-box--sm" placeholder="输入战斗小结"></textarea>
        <textarea
          v-model="fullLogDraft"
          class="strategy-box"
          placeholder="需要 full_log 时输入完整战斗记录"
        ></textarea>
        <div class="button-grid">
          <button class="btn" :disabled="!battleSession.激活" @click="syncOutputMode">保存输出模式</button>
          <button
            class="btn btn--primary"
            :disabled="!battleSession.激活 || battleSession.phase !== 'finished'"
            @click="commitBattle"
          >
            终局提交回主状态
          </button>
        </div>
        <p class="hint">终局提交前必须先把 phase 标记为 finished；提交时会先应用累计 `stat_data.*` 更新，再清空 `battle_session`。</p>
      </article>

      <article class="card">
        <h2>规则提示</h2>
        <ul class="info-list">
          <li>同楼层重开：若回合中途关闭，会恢复到最近 checkpoint。</li>
          <li>跨楼层重开：以当前楼层敌我状态重建新的 battle_session。</li>
          <li>完全放弃：恢复战前快照并清空 battle_session。</li>
          <li>终局提交：合并战斗单位、掉落和近期事务，再清空 battle_session。</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { klona } from 'klona';
import { storeToRefs } from 'pinia';
import type {
  BattleApiProfile,
  BattleFullResult,
  BattleLootResult,
  BattleProfile,
  BattlePromptConfig,
  BattlePromptTemplate,
} from '../../脚本/战斗/ai-profile.ts';
import {
  buildBattleFieldTree,
  buildUpdatedFieldSelectionConfig,
  createBattleSelectedFieldFromState,
  extractSelectedBattleData,
  upsertBattleSelectedField,
} from '../../脚本/战斗/field-selection.ts';
import { BattlePromptConfigSchema } from '../../脚本/战斗/frontend-settings.ts';
import type { BattleSession } from '../../schema.ts';
import FieldTreeNode from './FieldTreeNode.vue';
import { useBattleWindowStore } from './store';

type BattlePromptTemplateKey = keyof BattlePromptConfig;

const store = useBattleWindowStore();
const {
  mainState,
  runtimeMainState,
  battleSession,
  apiProfiles,
  activeApiProfile,
  battleProfiles,
  activeBattleProfile,
  discoveredActiveModels,
  canResume,
  enemyCount,
  isResolving,
  isApiBusy,
  isFieldAnalysisBusy,
  isRuntimeRequestBusy,
  lastResolveError,
  lastApiMessage,
  lastApiError,
  lastFieldAnalysisMessage,
  lastFieldAnalysisError,
  lastFieldAnalysisPayload,
  lastRuntimeRequestMessage,
  lastRuntimeRequestError,
  lastRuntimePayload,
  lastRuntimeResult,
  roundCheckpointDirty,
  sourceMessageId,
} = storeToRefs(store);

const strategyDraft = ref('');
const apiProfileDraft = ref<BattleApiProfile | null>(null);
const battleProfileDraft = ref<BattleProfile | null>(null);
const outputMode = ref<BattleSession['output_mode']>('summary_only');
const summaryDraft = ref('');
const fullLogDraft = ref('');
const manualFieldPath = ref('');
const runtimePlayerCommand = ref('');
const runtimeDiceInputsDraft = ref('{}');
const runtimeExtraInstructions = ref('');
const runtimeDraftError = ref('');
const canRemoveApiProfile = computed(() => apiProfiles.value.length > 1);
const canRemoveBattleProfile = computed(() => battleProfiles.value.length > 1);
const activePromptKey = ref<BattlePromptTemplateKey>('field_analysis');
const promptNotice = ref('');
const promptError = ref('');
const promptTemplateOptions: Array<{ key: BattlePromptTemplateKey; label: string }> = [
  { key: 'field_analysis', label: '字段分析' },
  { key: 'single_round', label: '单回合战斗' },
  { key: 'full_battle', label: '快速整场战斗' },
  { key: 'loot_resolution', label: '战利品结算' },
];
const analyzedFields = computed(() => battleProfileDraft.value?.field_selection.selected_fields ?? []);
const analysisWarnings = computed(() => battleProfileDraft.value?.field_selection.analysis_warnings ?? []);
const fieldTree = computed(() => buildBattleFieldTree(runtimeMainState.value as Record<string, unknown>));
const selectedFieldPaths = computed(() => analyzedFields.value.map(field => field.path));
const selectedDataExtraction = computed(() =>
  extractSelectedBattleData(runtimeMainState.value as Record<string, unknown>, analyzedFields.value),
);
const selectedDataPreview = computed(() => selectedDataExtraction.value.selectedData);
const selectedDataWarnings = computed(() => selectedDataExtraction.value.warnings);
const enabledFieldCount = computed(() => analyzedFields.value.filter(field => field.enabled).length);
const accumulatedUpdateCount = computed(() => Object.keys(battleSession.value.runtime.accumulated_updates).length);
const isFreeformRuntime = computed(() => battleProfileDraft.value?.run_mode === 'freeform');
const executionButtonLabel = computed(() =>
  battleProfileDraft.value?.default_turn_mode === 'full_battle' ? '确认并执行整场战斗' : '确认并请求 AI 预览',
);
const rerunButtonLabel = computed(() =>
  battleProfileDraft.value?.default_turn_mode === 'full_battle' ? '重新执行整场战斗' : '重新结算当前回合',
);
const canResolveLoot = computed(
  () =>
    Boolean(battleProfileDraft.value) &&
    battleSession.value.激活 &&
    battleSession.value.phase === 'finished' &&
    battleProfileDraft.value!.settlement_mode !== 'no_loot',
);
const currentSettlementText = computed(() => {
  const settlement = battleSession.value.runtime.settlement;
  return `${settlement.mode} / loot_ready=${settlement.loot_ready ? 'true' : 'false'} / mvu_commit_ready=${settlement.mvu_commit_ready ? 'true' : 'false'}`;
});
const latestFullBattleResult = computed<BattleFullResult | null>(() =>
  lastRuntimeResult.value && 'result_type' in lastRuntimeResult.value && lastRuntimeResult.value.result_type === 'full_battle'
    ? (lastRuntimeResult.value as BattleFullResult)
    : null,
);
const latestLootResult = computed<BattleLootResult | null>(() =>
  lastRuntimeResult.value && 'loot_result' in lastRuntimeResult.value ? (lastRuntimeResult.value as BattleLootResult) : null,
);
const activePromptTemplate = computed<BattlePromptTemplate | null>(() => {
  if (!battleProfileDraft.value) {
    return null;
  }
  return battleProfileDraft.value.prompts[activePromptKey.value];
});

watch(
  () => activeApiProfile.value,
  value => {
    apiProfileDraft.value = value ? klona(value) : null;
  },
  { immediate: true },
);

watch(
  () => activeBattleProfile.value,
  value => {
    battleProfileDraft.value = value ? klona(value) : null;
    activePromptKey.value = 'field_analysis';
    promptNotice.value = '';
    promptError.value = '';
  },
  { immediate: true },
);

watch(
  () => battleSession.value.player_check.strategy_text,
  value => {
    strategyDraft.value = value;
  },
  { immediate: true },
);

watch(
  () => battleSession.value.output_mode,
  value => {
    outputMode.value = value;
  },
  { immediate: true },
);

watch(
  () => battleSession.value.pending_preview.summary,
  value => {
    if (!summaryDraft.value && value) {
      summaryDraft.value = value;
    }
  },
  { immediate: true },
);

watch(
  () => battleSession.value.runtime.latest_battle_report,
  value => {
    if (!fullLogDraft.value && value) {
      fullLogDraft.value = value;
    }
  },
  { immediate: true },
);

const startBattle = async () => {
  await store.startBattle();
};
const resumeOrRebuild = async () => {
  await store.resumeOrRebuild();
};
const forceRebuild = async () => {
  await store.forceRebuild();
};
const saveStrategy = async () => {
  await store.saveStrategy(strategyDraft.value);
};
const reroll = async () => {
  await store.reroll();
};
const confirm = async () => {
  await store.saveStrategy(strategyDraft.value);
  if (!battleProfileDraft.value) {
    await store.confirm();
    return;
  }
  await store.executeConfiguredBattleTurn(battleProfileDraft.value, selectedDataPreview.value);
};
const resolveAgain = async () => {
  await store.saveStrategy(strategyDraft.value);
  if (!battleProfileDraft.value) {
    await store.resolveAgain();
    return;
  }
  await store.executeConfiguredBattleTurn(battleProfileDraft.value, selectedDataPreview.value);
};
const useMockPreview = async () => {
  await store.useMockPreview();
};
const resolveLoot = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await store.saveStrategy(strategyDraft.value);
  await store.executeConfiguredLootResolution(battleProfileDraft.value, selectedDataPreview.value);
};
const applyPreview = async () => {
  await store.applyPreview();
};
const finishBattle = async () => {
  await store.finishBattle();
};
const changeActiveApiProfile = async (event: Event) => {
  const nextId = (event.target as HTMLSelectElement).value || null;
  await store.setActiveApiProfile(nextId);
};
const createNewApiProfile = async () => {
  await store.createApiProfile();
};
const saveApiProfileDraft = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await store.saveApiProfile(apiProfileDraft.value, { makeActive: true });
};
const removeCurrentApiProfile = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await store.removeApiProfile(apiProfileDraft.value.id);
};
const changeActiveBattleProfile = async (event: Event) => {
  const nextId = (event.target as HTMLSelectElement).value || null;
  await store.setActiveBattleProfile(nextId);
};
const createNewBattleProfile = async () => {
  await store.createBattleProfile();
};
const saveBattleProfileDraft = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await store.saveBattleProfile(battleProfileDraft.value, { makeActive: true });
  promptNotice.value = '战斗配置与 Prompt 已保存';
  promptError.value = '';
};
const removeCurrentBattleProfile = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await store.removeBattleProfile(battleProfileDraft.value.id);
  promptNotice.value = '';
  promptError.value = '';
};
const discoverModels = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  const models = await store.discoverApiModels(apiProfileDraft.value);
  if (!apiProfileDraft.value.model && models[0]) {
    apiProfileDraft.value.model = models[0];
  }
};
const applyDiscoveredModel = (modelOption: string) => {
  if (!apiProfileDraft.value) {
    return;
  }
  apiProfileDraft.value.model = modelOption;
};
const testCurrentApiProfile = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await store.testApiProfile(apiProfileDraft.value);
};
const runFieldAnalysis = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await store.runBattleFieldAnalysis(battleProfileDraft.value);
};
const patchFieldSelectionDraft = (fields: BattleProfile['field_selection']['selected_fields']) => {
  if (!battleProfileDraft.value) {
    return;
  }
  battleProfileDraft.value = {
    ...battleProfileDraft.value,
    field_selection: buildUpdatedFieldSelectionConfig(battleProfileDraft.value.field_selection, fields),
  };
};
const addFieldFromTree = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }

  const nextField = createBattleSelectedFieldFromState(runtimeMainState.value as Record<string, unknown>, path, 'manual');
  const nextFields = upsertBattleSelectedField(battleProfileDraft.value.field_selection.selected_fields, nextField);
  patchFieldSelectionDraft(nextFields);
};
const addManualField = () => {
  if (!manualFieldPath.value.trim()) {
    return;
  }
  addFieldFromTree(manualFieldPath.value);
  manualFieldPath.value = '';
};
const updateSelectedField = (path: string, patch: Partial<BattleProfile['field_selection']['selected_fields'][number]>) => {
  if (!battleProfileDraft.value) {
    return;
  }
  patchFieldSelectionDraft(
    battleProfileDraft.value.field_selection.selected_fields.map(field =>
      field.path === path ? { ...field, ...patch } : field,
    ),
  );
};
const toggleSelectedField = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }
  patchFieldSelectionDraft(
    battleProfileDraft.value.field_selection.selected_fields.map(field =>
      field.path === path ? { ...field, enabled: !field.enabled } : field,
    ),
  );
};
const removeSelectedField = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }
  patchFieldSelectionDraft(battleProfileDraft.value.field_selection.selected_fields.filter(field => field.path !== path));
};
const parseRuntimeDiceInputs = () => {
  const draft = runtimeDiceInputsDraft.value.trim();
  if (!draft) {
    return {};
  }
  const parsed = JSON.parse(draft);
  if (!_.isPlainObject(parsed)) {
    throw new Error('dice_inputs 必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
};
const buildRuntimeRequestOptions = () => ({
  playerCommand: runtimePlayerCommand.value,
  diceInputs: parseRuntimeDiceInputs(),
  extraInstructions: runtimeExtraInstructions.value,
});
const runRuntimeRequest = async (request: () => Promise<void>) => {
  runtimeDraftError.value = '';
  try {
    await request();
  } catch (error) {
    if (!lastRuntimeRequestError.value) {
      runtimeDraftError.value = error instanceof Error ? error.message : String(error);
    }
  }
};
const sendSingleRound = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  let options;
  try {
    options = buildRuntimeRequestOptions();
  } catch (error) {
    runtimeDraftError.value = error instanceof Error ? error.message : String(error);
    return;
  }
  await runRuntimeRequest(() => store.sendSingleRoundRequest(battleProfileDraft.value!, selectedDataPreview.value, options));
};
const sendFullBattle = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  let options;
  try {
    options = buildRuntimeRequestOptions();
  } catch (error) {
    runtimeDraftError.value = error instanceof Error ? error.message : String(error);
    return;
  }
  await runRuntimeRequest(() => store.sendFullBattleRequest(battleProfileDraft.value!, selectedDataPreview.value, options));
};
const sendLootResolution = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  let options;
  try {
    options = buildRuntimeRequestOptions();
  } catch (error) {
    runtimeDraftError.value = error instanceof Error ? error.message : String(error);
    return;
  }
  await runRuntimeRequest(() =>
    store.sendLootResolutionRequest(battleProfileDraft.value!, selectedDataPreview.value, options),
  );
};
const exportPromptConfig = () => {
  if (!battleProfileDraft.value) {
    return;
  }

  const blob = new Blob([JSON.stringify(battleProfileDraft.value.prompts, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${battleProfileDraft.value.name || 'battle-prompts'}.json`;
  link.click();
  URL.revokeObjectURL(url);
  promptNotice.value = '当前 Prompt 已导出';
  promptError.value = '';
};
const importPromptConfig = async (event: Event) => {
  if (!battleProfileDraft.value) {
    return;
  }

  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const promptCandidate = _.isPlainObject(parsed) && _.isPlainObject(parsed.prompts) ? parsed.prompts : parsed;
    const normalizedPrompts = BattlePromptConfigSchema.parse(promptCandidate, { reportInput: true });
    battleProfileDraft.value = {
      ...battleProfileDraft.value,
      prompts: klona(normalizedPrompts),
    };
    promptNotice.value = 'Prompt JSON 已导入到当前草稿，记得保存战斗配置';
    promptError.value = '';
  } catch (error) {
    promptNotice.value = '';
    promptError.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = '';
  }
};
const syncOutputMode = async () => {
  await store.setOutputMode(outputMode.value);
};
const commitBattle = async () => {
  await store.commitBattle({
    summary: summaryDraft.value,
    fullLog: fullLogDraft.value,
    outputMode: outputMode.value,
  });
  summaryDraft.value = '';
  fullLogDraft.value = '';
};
const abandon = async () => {
  await store.abandon();
  summaryDraft.value = '';
  fullLogDraft.value = '';
};
const close = () => store.close();
const formatTimestamp = (timestamp: number) => {
  if (!timestamp) {
    return '未测试';
  }
  return new Date(timestamp).toLocaleString();
};
const formatJson = (value: unknown) => JSON.stringify(value, null, 2);
</script>
