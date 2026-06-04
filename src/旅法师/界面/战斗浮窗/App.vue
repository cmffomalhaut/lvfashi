<template>
  <div class="battle-shell">
    <div v-if="toastMessage" class="battle-toast" :class="`battle-toast--${toastMessage.type}`" role="status" aria-live="polite">
      <strong>{{ toastMessage.title }}</strong>
      <span>{{ toastMessage.message }}</span>
    </div>

    <section v-show="activeBattleTab === 'settings'" class="battle-settings-page">
      <header class="page-header">
        <button class="battle-icon-btn battle-icon-btn--back" type="button" @click="closeSettingsPage">&lt; 返回</button>
        <div class="page-header__title">
          <strong>设置</strong>
          <span>{{ activeSectionLabel }} · {{ headerSourceText }}</span>
        </div>
        <span v-if="isSettingsBusy" class="settings-busy-indicator">处理中</span>
      </header>

      <section class="settings-overview" aria-label="当前设置概览">
        <div class="settings-overview__main">
          <span>当前战斗配置</span>
          <strong>{{ battleProfileDraft?.name || activeBattleProfile?.name || '未选择战斗配置' }}</strong>
          <p>{{ activeApiProfile ? formatApiProfileOptionLabel(activeApiProfile) : '未选择接口' }}</p>
        </div>
        <div class="settings-overview__stats">
          <div class="settings-stat">
            <span>运行</span>
            <strong>{{ settingsRunModeLabel }}</strong>
          </div>
          <div class="settings-stat">
            <span>字段</span>
            <strong>{{ settingsFieldSummary }}</strong>
          </div>
          <div class="settings-stat" :class="settingsApiStatusTone">
            <span>接口</span>
            <strong>{{ settingsApiStatusText }}</strong>
          </div>
          <div class="settings-stat">
            <span>会话</span>
            <strong>{{ battleSession.激活 ? battlePhaseLabel : '未开始' }}</strong>
          </div>
        </div>
      </section>

      <div class="settings-nav-groups" aria-label="设置分组">
        <nav class="section-switch" aria-label="设置分组">
          <span class="settings-nav-label">按使用频率分组</span>
          <button
            v-for="item in settingsSections"
            :key="item.key"
            class="section-pill"
            :class="activeSettingsSection === item.key ? 'section-pill--active' : ''"
            type="button"
            :aria-current="activeSettingsSection === item.key ? 'page' : undefined"
            @click="activeSettingsSection = item.key"
          >
            {{ item.label }}
          </button>
        </nav>
      </div>

    <section v-show="activeSettingsSection === 'run'" class="card settings-card settings-card--api">
      <div class="section-head section-head--phone">
        <div>
          <h2>运行</h2>
          <p class="hint">高频入口集中在这里：接口、战斗配置、玩家指令和开始战斗。</p>
        </div>
        <div class="button-grid section-actions section-actions--stack">
          <button class="btn btn--ghost" :disabled="isApiBusy" @click="createNewApiProfile">新建接口</button>
          <button class="btn btn--primary" :disabled="!apiProfileDraft || isApiBusy" @click="saveApiProfileDraft">
            保存当前接口
          </button>
          <button class="btn btn--warn" :disabled="!apiProfileDraft || !canRemoveApiProfile || isApiBusy" @click="removeCurrentApiProfile">
            删除当前接口
          </button>
        </div>
      </div>

      <div class="settings-run-dashboard">
        <article class="settings-panel settings-panel--phone settings-panel--focus">
          <div class="mobile-panel__header">
            <strong>当前接口</strong>
            <span>{{ activeApiProfile ? formatApiProfileOptionLabel(activeApiProfile) : '未选择接口' }}</span>
          </div>
          <label class="form-field">
            <span>切换接口</span>
            <select class="form-control" :value="activeApiProfile?.id ?? ''" :disabled="isApiBusy" @change="changeActiveApiProfile">
              <option v-for="profile in apiProfiles" :key="profile.id" :value="profile.id">
                {{ formatApiProfileOptionLabel(profile) }}
              </option>
            </select>
          </label>
          <div class="button-grid settings-footer-actions">
            <button class="btn btn--primary" :disabled="isApiBusy" @click="testCurrentApiProfile">测试连接</button>
            <button class="btn" :disabled="isApiBusy" @click="discoverModels">拉取模型列表</button>
          </div>
        </article>

        <article class="settings-panel settings-panel--phone settings-panel--focus">
          <div class="mobile-panel__header">
            <strong>当前战斗配置</strong>
            <span>{{ battleProfileDraft ? formatBattleProfileOptionLabel(battleProfileDraft) : '未选择配置' }}</span>
          </div>
          <label class="form-field">
            <span>切换配置</span>
            <select class="form-control" :value="activeBattleProfile?.id ?? ''" :disabled="isApiBusy" @change="changeActiveBattleProfile">
              <option v-for="profile in battleProfiles" :key="profile.id" :value="profile.id">
                {{ formatBattleProfileOptionLabel(profile) }}
              </option>
            </select>
          </label>
          <div class="button-grid settings-footer-actions">
            <button class="btn btn--ghost" :disabled="isApiBusy" @click="createNewBattleProfile">新建战斗配置</button>
            <button class="btn btn--primary" :disabled="!battleProfileDraft || isApiBusy" @click="saveBattleProfileDraft">保存配置</button>
          </div>
        </article>

        <article class="settings-panel settings-panel--phone settings-panel--focus settings-panel--wide">
          <div class="mobile-panel__header">
            <strong>玩家指令</strong>
            <span>{{ battleSession.激活 ? `第 ${battleSession.round.round_no} 回合` : '未开始' }}</span>
          </div>
          <label class="form-field">
            <span>本回合行动</span>
            <textarea v-model="strategyDraft" class="form-control form-control--textarea" rows="4" placeholder="输入本回合指令"></textarea>
          </label>
          <div class="button-grid settings-footer-actions">
            <button class="btn" type="button" @click="refreshBattleData">刷新数据</button>
            <button class="btn" type="button" @click="resumeOrRebuild">重新读取</button>
            <button class="btn btn--ghost" type="button" @click="forceRebuild">重建战斗</button>
            <button class="btn btn--primary" type="button" :disabled="!canSendBattleCommand" @click="confirm">{{ executionButtonLabel }}</button>
          </div>
        </article>
      </div>

      <div class="settings-stack">
        <article class="settings-panel settings-panel--phone">
          <div class="mobile-panel__header">
            <strong>接口列表</strong>
            <span>{{ activeApiProfile ? formatApiProfileOptionLabel(activeApiProfile) : '未命名接口' }}</span>
          </div>
          <label class="form-field">
            <span>当前激活接口</span>
            <select class="form-control" :value="activeApiProfile?.id ?? ''" :disabled="isApiBusy" @change="changeActiveApiProfile">
              <option v-for="profile in apiProfiles" :key="profile.id" :value="profile.id">
                {{ formatApiProfileOptionLabel(profile) }}
              </option>
            </select>
          </label>

          <div v-if="currentApiTestResult" class="status-box" :class="currentApiTestResult.ok ? 'status-box--ok' : 'status-box--error'">
            <strong>{{ currentApiTestResult.ok ? '最近一次测试成功' : '最近一次测试失败' }}</strong>
            <span>{{ currentApiTestResult.message || '无额外说明' }}</span>
            <span>检查时间：{{ formatTimestamp(currentApiTestResult.checked_at) }}</span>
          </div>

          <p v-if="lastApiMessage" class="hint hint--ok">{{ lastApiMessage }}</p>
          <p v-if="lastApiError" class="hint hint--error">{{ lastApiError }}</p>

          <p v-if="apiProfileModelOptions.length" class="hint hint--ok">已缓存 {{ apiProfileModelOptions.length }} 个可选模型。</p>
        </article>

        <article v-if="apiProfileDraft" class="settings-panel settings-panel--phone settings-panel--accent">
          <div class="mobile-panel__header">
            <strong>接口详情</strong>
            <span>这里填地址、密钥和模型，保存后战斗页直接使用。</span>
          </div>

          <div class="form-grid form-grid--phone">
            <label class="form-field">
              <span>名称</span>
              <input v-model="apiProfileDraft.name" class="form-control" type="text" placeholder="例如：默认 OpenAI 兼容接口" />
            </label>
            <label class="form-field">
              <span>接口类型</span>
              <select v-model="apiProfileDraft.provider_type" class="form-control">
                <option value="openai_compatible">OpenAI 兼容</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label class="form-field form-field--wide">
              <span>接口地址</span>
              <input v-model="apiProfileDraft.base_url" class="form-control" type="text" placeholder="https://example.com/v1" />
            </label>
            <label class="form-field form-field--wide">
              <span>接口预设</span>
              <select class="form-control" :disabled="isApiBusy" @change="applyApiEndpointPreset">
                <option value="">选择后写入接口地址和模型列表路径</option>
                <option v-for="preset in apiEndpointPresets" :key="preset.baseUrl" :value="preset.baseUrl">
                  {{ preset.label }}
                </option>
              </select>
            </label>
            <label class="form-field form-field--wide">
              <span>密钥</span>
              <input v-model="apiProfileDraft.api_key" class="form-control" type="password" placeholder="sk-..." />
            </label>
            <label class="form-field form-field--wide">
              <span>模型名</span>
              <input v-model="apiProfileDraft.model" class="form-control" type="text" placeholder="gpt-4.1-mini / custom-model-id" />
            </label>
            <label class="form-field form-field--wide">
              <span>从已拉取模型中选择</span>
              <select class="form-control" :value="apiProfileDraft.model" :disabled="!apiProfileModelOptions.length" @change="applyDiscoveredModelFromSelect">
                <option value="">手动输入模型名</option>
                <option v-if="!apiProfileModelOptions.length" value="" disabled>先拉取模型列表</option>
                <option v-for="modelOption in apiProfileModelOptions" :key="modelOption" :value="modelOption">
                  {{ modelOption }}
                </option>
              </select>
            </label>
            <details class="settings-details form-field--wide">
              <summary>高级接口参数</summary>
              <div class="form-grid settings-details__body">
                <label class="form-field">
                  <span>模型列表路径</span>
                  <input v-model="apiProfileDraft.model_fetch_path" class="form-control" type="text" placeholder="/v1/models" />
                </label>
                <label class="form-field">
                  <span>列表解析路径</span>
                  <input v-model="apiProfileDraft.model_discovery.response_path" class="form-control" type="text" placeholder="data" />
                </label>
                <label class="form-field">
                  <span>超时毫秒</span>
                  <input v-model.number="apiProfileDraft.default_request_options.timeout_ms" class="form-control" type="number" min="1000" step="1000" />
                </label>
                <label class="form-field">
                  <span>重试次数</span>
                  <input v-model.number="apiProfileDraft.default_request_options.retry_limit" class="form-control" type="number" min="0" step="1" />
                </label>
                <label class="check-field">
                  <input v-model="apiProfileDraft.model_discovery.use_auth_header" type="checkbox" />
                  <span>模型列表请求带 Authorization 头</span>
                </label>
              </div>
            </details>
          </div>

          <div class="button-grid settings-footer-actions">
            <button class="btn" :disabled="isApiBusy" @click="discoverModels">拉取模型列表</button>
            <button class="btn btn--primary" :disabled="isApiBusy" @click="testCurrentApiProfile">测试连接</button>
            <button class="btn" :disabled="isApiBusy" @click="saveAndDiscoverModels">保存并拉取模型</button>
            <button class="btn btn--primary" :disabled="isApiBusy" @click="saveAndTestApiProfile">保存并测试</button>
          </div>
        </article>
      </div>
    </section>

    <section v-show="activeSettingsSection === 'advanced'" class="card settings-card settings-card--prompt">
      <details class="settings-details settings-details--group">
        <summary>Prompt 编辑器与配置导入</summary>
      <div class="settings-details__group-body">
      <div class="section-head section-head--phone">
        <div>
          <h2>高级 · 完整 Prompt 编辑器</h2>
          <p class="hint">低频的完整 Prompt、导入导出和模板开关集中在高级页。</p>
        </div>
        <div class="button-grid section-actions section-actions--stack">
          <button class="btn btn--ghost" :disabled="isApiBusy" @click="createNewBattleProfile">新建配置</button>
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

      <div class="settings-stack">
        <article class="settings-panel settings-panel--phone">
          <div class="mobile-panel__header">
            <strong>当前方案</strong>
            <span>{{ battleProfileDraft ? formatBattleProfileOptionLabel(battleProfileDraft) : '未命名战斗配置' }}</span>
          </div>
          <label class="form-field">
            <span>当前激活战斗配置</span>
            <select
              class="form-control"
              :value="activeBattleProfile?.id ?? ''"
              :disabled="isApiBusy"
              @change="changeActiveBattleProfile"
            >
              <option v-for="profile in battleProfiles" :key="profile.id" :value="profile.id">
                {{ formatBattleProfileOptionLabel(profile) }}
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

        <article v-if="battleProfileDraft && activePromptTemplate" class="settings-panel settings-panel--phone prompt-editor">
          <div class="prompt-phone-header">
            <div>
              <strong>{{ activePromptOption?.label || '提示词' }}</strong>
              <span>{{ activePromptTemplate.enabled ? '当前已启用' : '当前已停用' }}</span>
            </div>
            <button class="btn btn--ghost" type="button" @click="toggleActivePrompt">
              {{ activePromptTemplate.enabled ? '停用' : '启用' }}
            </button>
            <button class="btn btn--primary btn--sm" type="button" @click="saveBattleProfileDraft">保存</button>
          </div>

          <div class="prompt-toolbar prompt-toolbar--phone">
            <div class="prompt-list prompt-list--compact prompt-list--phone">
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

            <div class="button-grid button-grid--phone-actions">
              <button class="btn" type="button" @click="exportPromptConfig">导出 Prompt JSON</button>
              <label class="btn btn--ghost file-trigger">
                <input type="file" accept=".json,application/json" @change="importPromptConfig" />
                <span>导入 Prompt JSON</span>
              </label>
            </div>
          </div>

          <div class="textarea-stack">
            <label class="form-field">
              <span>系统提示词</span>
              <textarea
                v-model="activePromptTemplate.system_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="7"
                placeholder="输入系统提示词"
              ></textarea>
            </label>
            <label class="form-field">
              <span>主提示词</span>
              <textarea
                v-model="activePromptTemplate.user_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="9"
                placeholder="输入这一模式下的主提示词"
              ></textarea>
            </label>
            <label class="form-field">
              <span>输出格式要求</span>
              <textarea
                v-model="activePromptTemplate.output_contract_prompt"
                class="form-control form-control--textarea form-control--code"
                rows="7"
                placeholder="输入要求 AI 返回的 JSON 格式"
              ></textarea>
            </label>
            <label class="form-field">
              <span>备注</span>
              <textarea
                v-model="activePromptTemplate.notes"
                class="form-control form-control--textarea"
                rows="2"
                placeholder="可选，只给自己看，不会发送给 AI"
              ></textarea>
            </label>
            <p class="hint">这里看到的就是实际会发送或用于分析的 Prompt；保存后不再依赖隐藏的代码内置文本。</p>
          </div>
        </article>
      </div>
      </div>
      </details>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'rules'" class="card">
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
            <div class="form-field">
              <span>运行模式</span>
              <div class="radio-group">
                <label class="radio-card">
                  <input v-model="battleProfileDraft.run_mode" type="radio" value="dice_driven" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>明骰驱动</strong>
                    <small>玩家方主检定使用锁定 1d20，适合规则明确的战斗。</small>
                  </span>
                </label>
                <label class="radio-card">
                  <input v-model="battleProfileDraft.run_mode" type="radio" value="freeform" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>自由描述</strong>
                    <small>不强制玩家明骰，适合纯叙事裁定。</small>
                  </span>
                </label>
              </div>
            </div>
            <div class="form-field">
              <span>回合处理方式</span>
              <div class="radio-group">
                <label class="radio-card">
                  <input v-model="battleProfileDraft.default_turn_mode" type="radio" value="round_based" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>单回合推进</strong>
                    <small>每回合生成一次结果，由玩家确认后再进入下一回合。</small>
                  </span>
                </label>
                <label class="radio-card">
                  <input v-model="battleProfileDraft.default_turn_mode" type="radio" value="full_battle" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>整场快速推演</strong>
                    <small>一次请求直接推演到战斗结束。</small>
                  </span>
                </label>
              </div>
            </div>
            <div class="form-field">
              <span>战利品结算</span>
              <div class="radio-group">
                <label class="radio-card">
                  <input v-model="battleProfileDraft.settlement_mode" type="radio" value="no_loot" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>无掉落</strong>
                    <small>战斗结束后不进入掉落结算。</small>
                  </span>
                </label>
                <label class="radio-card">
                  <input v-model="battleProfileDraft.settlement_mode" type="radio" value="direct_loot" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>直接生成掉落</strong>
                    <small>战斗结束后立即产出掉落结果。</small>
                  </span>
                </label>
                <label class="radio-card">
                  <input v-model="battleProfileDraft.settlement_mode" type="radio" value="checked_loot" />
                  <span class="radio-card__dot" aria-hidden="true"></span>
                  <span class="radio-card__body">
                    <strong>战后单独结算</strong>
                    <small>保留额外检定或搜刮后再结算战利品。</small>
                  </span>
                </label>
              </div>
            </div>
            <label class="form-field">
              <span>玩家意图优先级</span>
              <input :value="battleProfileDraft.rules.player_intent_priority" class="form-control" type="text" disabled />
            </label>
            <label class="form-field form-field--wide">
              <span>战斗规则</span>
              <textarea
                v-model="battleProfileDraft.rules.battle_protocol"
                class="form-control form-control--textarea form-control--code"
                rows="8"
                placeholder="填写战斗协议、单位行动限制、资源消耗规则、玩家意图优先级等"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>掉落规则</span>
              <textarea
                v-model="battleProfileDraft.rules.loot_protocol"
                class="form-control form-control--textarea form-control--code"
                rows="6"
                placeholder="填写掉落结算、搜刮/鉴定/拆解检定等规则"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>额外世界规则</span>
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
          <details class="settings-details">
            <summary>模式状态</summary>
          <div class="state-list">
            <div class="state-list__item">
              <strong>模式提醒</strong>
              <span>自由描述模式会隐藏投骰；明骰驱动模式会重新启用投骰与重掷。</span>
            </div>
            <div class="state-list__item">
              <strong>当前运行模式</strong>
              <span>{{ runModeLabel }}</span>
            </div>
            <div class="state-list__item">
              <strong>默认回合模式</strong>
              <span>{{ turnModeLabel }}</span>
            </div>
            <div class="state-list__item">
              <strong>当前结算模式</strong>
              <span>{{ settlementModeLabel }}</span>
            </div>
          </div>

          </details>

          <details class="settings-details">
            <summary>开关选项</summary>
          <div class="rule-toggle-grid">
            <button
              class="rule-toggle"
              :class="battleProfileDraft.rules.allow_full_stat_data_in_analysis ? 'rule-toggle--active' : ''"
              type="button"
              @click="battleProfileDraft.rules.allow_full_stat_data_in_analysis = !battleProfileDraft.rules.allow_full_stat_data_in_analysis"
            >
              {{ battleProfileDraft.rules.allow_full_stat_data_in_analysis ? '分析发送完整数据' : '分析改为裁剪数据' }}
            </button>
            <button
              class="rule-toggle"
              :class="battleProfileDraft.rules.forbid_full_stat_data_in_runtime ? 'rule-toggle--active' : ''"
              type="button"
              @click="battleProfileDraft.rules.forbid_full_stat_data_in_runtime = !battleProfileDraft.rules.forbid_full_stat_data_in_runtime"
            >
              {{ battleProfileDraft.rules.forbid_full_stat_data_in_runtime ? '正式运行禁止全量' : '正式运行允许全量' }}
            </button>
            <button
              class="rule-toggle"
              :class="battleProfileDraft.rules.schema_hint_enabled ? 'rule-toggle--active' : ''"
              type="button"
              @click="battleProfileDraft.rules.schema_hint_enabled = !battleProfileDraft.rules.schema_hint_enabled"
            >
              {{ battleProfileDraft.rules.schema_hint_enabled ? 'Schema Hint 已启用' : 'Schema Hint 已禁用' }}
            </button>
          </div>
          </details>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'worldbook'" class="card">
      <div class="section-head">
        <div>
          <h2>世界书导入</h2>
          <p class="hint">导入后的内容会保存到当前 BattleProfile，并在正式运行时写入 `runtime_payload.worldbook_context`。</p>
        </div>
        <div class="button-grid">
          <button class="btn" :disabled="isWorldbookBusy" @click="refreshWorldbooks">刷新列表</button>
          <button class="btn btn--primary" :disabled="isWorldbookBusy" @click="autoImportWorldbooks">自动导入激活世界书</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="form-grid">
            <label class="check-field">
              <input v-model="battleProfileDraft.context.include_worldbook_context" type="checkbox" />
              <span>运行时注入已启用世界书</span>
            </label>
            <label class="form-field">
              <span>最大注入字符数</span>
              <input v-model.number="battleProfileDraft.context.worldbook_max_chars" class="form-control" type="number" min="0" step="500" />
            </label>
            <label class="form-field form-field--wide">
              <span>手动选择世界书</span>
              <select v-model="selectedWorldbookName" class="form-control" :disabled="isWorldbookBusy">
                <option value="">先刷新列表再选择</option>
                <option v-for="name in worldbookNames" :key="name" :value="name">{{ name }}</option>
              </select>
            </label>
          </div>

          <div class="button-grid settings-footer-actions">
            <button class="btn" :disabled="isWorldbookBusy || !selectedWorldbookName" @click="manualImportWorldbook">导入整本</button>
            <button class="btn" :disabled="isWorldbookBusy || !selectedWorldbookName" @click="refreshWorldbookEntries">读取条目</button>
            <button class="btn" :disabled="isWorldbookBusy || !selectedWorldbookEntryIds.length" @click="manualImportWorldbookEntries">
              导入选中条目
            </button>
            <button class="btn btn--primary" :disabled="isWorldbookBusy" @click="saveBattleProfileDraft">保存世界书设置</button>
          </div>

          <div v-if="worldbookEntryOptions.length" class="preview-block">
            <h3>可选条目</h3>
            <p class="hint">已选择 {{ selectedWorldbookEntryIds.length }} / {{ worldbookEntryOptions.length }} 条。</p>
            <ul class="info-list">
              <li v-for="entry in worldbookEntryOptions" :key="entry.id">
                <label class="check-field">
                  <input v-model="selectedWorldbookEntryIds" type="checkbox" :value="entry.id" :disabled="isWorldbookBusy" />
                  <span>{{ entry.title }} · {{ entry.content.length }} 字</span>
                </label>
              </li>
            </ul>
          </div>

          <p v-if="lastWorldbookMessage" class="hint hint--ok">{{ lastWorldbookMessage }}</p>
          <p v-if="lastWorldbookError" class="hint hint--error">{{ lastWorldbookError }}</p>
        </article>

        <article class="settings-panel">
          <div class="preview-block">
            <h3>已导入世界书</h3>
            <p class="hint">
              {{ importedWorldbooks.length }} 本，启用 {{ enabledImportedWorldbookCount }} 本，预计注入 {{ serializedWorldbookPreview.length }} 段。
            </p>
            <ul v-if="importedWorldbooks.length" class="info-list">
              <li v-for="worldbook in importedWorldbooks" :key="worldbook.id">
                <label class="check-field">
                  <input
                    :checked="worldbook.enabled"
                    type="checkbox"
                    :disabled="isWorldbookBusy"
                    @change="toggleWorldbookFromEvent(worldbook.id, $event)"
                  />
                  <span>{{ worldbook.name }} · {{ formatWorldbookSource(worldbook.source) }} · {{ worldbook.entry_count }} 条 · {{ worldbook.content.length }} 字</span>
                </label>
                <button class="btn btn--ghost btn--sm" type="button" :disabled="isWorldbookBusy" @click="removeWorldbook(worldbook.id)">删除</button>
              </li>
            </ul>
            <p v-else class="hint">暂无导入世界书。</p>
          </div>
          <div v-if="serializedWorldbookPreview.length" class="preview-block">
            <h3>运行时注入预览</h3>
            <pre class="json-preview">{{ serializedWorldbookPreview.join('\n\n') }}</pre>
          </div>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'advanced'" class="card">
      <details class="settings-details settings-details--group">
        <summary>测试</summary>
      <div class="settings-details__group-body">
      <div class="section-head">
        <div>
          <h2>字段建议</h2>
          <p class="hint">字段分析会推荐运行期需要发送的字段。正式运行只发送已加入的字段，你可以选父级后再排除不需要的子级。</p>
        </div>
        <div class="button-grid">
          <button class="btn" type="button" @click="refreshBattleData">刷新数据</button>
          <button class="btn btn--primary" :disabled="isFieldAnalysisBusy || isApiBusy" @click="runFieldAnalysis">
            {{ isFieldAnalysisBusy ? '分析中...' : '分析当前楼层数据' }}
          </button>
          <button class="btn" :disabled="isFieldAnalysisBusy" @click="retryFieldAnalysis">重试上一次分析</button>
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

          <details v-if="lastFieldAnalysisPayload || lastFieldAnalysisRawText" class="settings-details">
            <summary>分析调试载荷</summary>
            <div v-if="lastFieldAnalysisPayload" class="preview-block">
              <h3>最近一次分析载荷</h3>
              <pre class="json-preview">{{ formatJson(lastFieldAnalysisPayload) }}</pre>
            </div>
            <div v-if="lastFieldAnalysisRawText" class="preview-block">
              <h3>最近一次分析原始文本</h3>
              <pre class="json-preview">{{ lastFieldAnalysisRawText }}</pre>
            </div>
          </details>
        </article>

        <article class="settings-panel">
          <div v-if="analyzedFields.length" class="analysis-result-list">
            <div v-for="field in analyzedFields" :key="field.path" class="analysis-result-item">
              <div class="analysis-result-head">
                <strong>{{ field.label || field.path }}</strong>
                <code>{{ field.path }}</code>
              </div>
              <p>{{ field.reason || '无额外说明' }}</p>
              <span>AI 建议已作为待复核字段加入规则；你可以在字段树中继续加入或排除字段。</span>
            </div>
          </div>
          <p v-else class="hint">还没有字段分析结果。可以先从字段树手动加入父级或子级。</p>
        </article>
      </div>
      </div>
      </details>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'advanced'" class="card">
      <div class="section-head">
        <div>
          <h2>字段取舍</h2>
          <p class="hint">默认不发送。点父级会加入整支；已加入后再点子级，会把这一支从发送数据里排除。</p>
        </div>
        <div class="button-grid">
          <button class="btn" type="button" :disabled="!analyzedFields.length" @click="importAnalyzedFieldsToSelection">导入 AI 建议字段</button>
          <button class="btn btn--primary" :disabled="!battleProfileDraft" @click="saveBattleProfileDraft">保存当前字段规则</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="manual-field-box">
            <label class="form-field">
              <span>手动覆盖路径</span>
              <input v-model="manualFieldPath" class="form-control" type="text" placeholder="例如：角色数据.角色名.生命值.当前值" />
            </label>
            <div class="button-grid">
              <button class="btn" type="button" @click="addManualField">切换这一条规则</button>
            </div>
          </div>

          <div class="field-tree-list">
            <p v-if="!fieldTree.length" class="hint">当前楼层没有可读取的原始 `stat_data`，因此暂时无法展示字段树。</p>
            <FieldTreeNode
              v-for="node in fieldTree"
              :key="node.key"
              :node="node"
              :selected-fields="fieldOverrides"
              @toggle-select="toggleFieldFromTree"
            />
          </div>
        </article>

        <article class="settings-panel">
          <details class="settings-details">
            <summary>当前发送规则</summary>
          <div class="selected-field-summary">
            <strong>当前发送规则</strong>
            <span>启用项会加入对应父级或字段；排除项会从已加入的父级里删掉对应子级。</span>
          </div>
          <div v-if="fieldOverrides.length" class="selected-field-list">
            <div
              v-for="field in fieldOverrides"
              :key="field.path"
              class="selected-field-item"
            >
              <div class="selected-field-item__head">
                <code>{{ field.path }}</code>
                <div class="button-grid">
                  <button class="btn btn--ghost btn--sm" type="button" @click="toggleSelectedField(field.path)">
                    {{ field.enabled ? '移除发送规则' : '移除排除规则' }}
                  </button>
                  <button class="btn btn--warn btn--sm" type="button" @click="removeSelectedField(field.path)">移除覆盖</button>
                </div>
              </div>

              <div class="form-grid">
                <label class="form-field">
                  <span>显示名称</span>
                  <input
                    :value="field.label"
                    class="form-control"
                    type="text"
                    @input="updateSelectedField(field.path, { label: ($event.target as HTMLInputElement).value })"
                  />
                </label>
                <label class="form-field">
                  <span>字段类型</span>
                  <input :value="formatFieldValueKind(field.value_kind)" class="form-control" type="text" disabled />
                </label>
                <label class="form-field form-field--wide">
                  <span>用途说明</span>
                  <textarea
                    :value="field.reason"
                    class="form-control form-control--textarea"
                    rows="2"
                    @input="updateSelectedField(field.path, { reason: ($event.target as HTMLTextAreaElement).value })"
                  ></textarea>
                </label>
              </div>

              <span class="selected-field-item__meta">
                来源 {{ formatFieldSource(field.source) }} · {{ field.enabled ? '这一条会发送对应字段' : '这一条会排除对应子级' }}
              </span>
            </div>
          </div>
          <p v-else class="hint">当前没有发送规则，正式运行不会发送任何字段。可以从左侧先加入一个父级。</p>
          </details>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'advanced'" class="card">
      <div class="section-head">
        <div>
          <h2>运行前预览</h2>
          <p class="hint">这里实时预览最终会送去战斗请求的 `selected_data`，并提示哪些覆盖路径已经失效。</p>
        </div>
        <div class="button-grid">
          <button class="btn" type="button" @click="refreshBattleData">刷新预览数据</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="state-list">
            <div class="state-list__item">
              <strong>发送规则数</strong>
              <span>{{ fieldOverrideCount }}</span>
            </div>
            <div class="state-list__item">
              <strong>排除规则数</strong>
              <span>{{ disabledFieldCount }}</span>
            </div>
            <div class="state-list__item">
              <strong>失效路径警告</strong>
              <span>{{ selectedDataWarnings.length }}</span>
            </div>
            <div class="state-list__item">
              <strong>运行期全量发送限制</strong>
              <span>{{ battleProfileDraft.rules.forbid_full_stat_data_in_runtime ? '已启用' : '未启用' }}</span>
            </div>
          </div>

          <p v-if="fieldOverrides.length <= 0" class="hint">当前没有发送规则，因此预览区为空。</p>
          <p v-if="battleProfileDraft.field_selection.source_data_hash && !isFieldSelectionForCurrentData" class="hint hint--warn">当前字段结构与上次保存时不同，请检查发送规则是否仍然合适。</p>

          <div v-if="selectedDataWarnings.length" class="preview-block">
            <h3>抽取警告</h3>
            <ul class="info-list">
              <li v-for="warning in selectedDataWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>
        </article>

        <article class="settings-panel">
          <details class="settings-details">
            <summary>当前 selected_data 预览</summary>
            <div class="preview-block">
              <h3>当前 `selected_data` 预览</h3>
              <pre class="json-preview">{{ formatJson(selectedDataPreview) }}</pre>
            </div>
          </details>
        </article>
      </div>
    </section>

    <section v-if="battleProfileDraft" v-show="activeSettingsSection === 'advanced'" class="card">
      <div class="section-head">
        <div>
          <h2>测试</h2>
          <p class="hint">这里保留手动实验入口；下面“玩家检定 / 回合预览”区域已经开始接入正式执行链。</p>
        </div>
        <div class="button-grid">
          <button class="btn btn--primary" :disabled="isRuntimeRequestBusy" @click="sendSingleRound">
            {{ isRuntimeRequestBusy ? '请求中...' : '发送单回合请求' }}
          </button>
          <button class="btn" :disabled="isRuntimeRequestBusy" @click="sendFullBattle">发送整场请求</button>
          <button class="btn" :disabled="isRuntimeRequestBusy" @click="sendLootResolution">发送战利品请求</button>
          <button class="btn btn--ghost" :disabled="isRuntimeRequestBusy" @click="retryRuntimeRequest">重试上一次正式请求</button>
        </div>
      </div>

      <div class="settings-grid">
        <article class="settings-panel">
          <div class="form-grid">
            <label class="form-field form-field--wide">
              <span>玩家指令</span>
              <textarea
                v-model="runtimePlayerCommand"
                class="form-control form-control--textarea"
                rows="4"
                placeholder="输入单回合策略或整场战斗倾向"
              ></textarea>
            </label>
            <label class="form-field form-field--wide">
              <span>骰子输入 JSON</span>
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
          <details class="settings-details">
            <summary>最近一次原始 AI 返回</summary>
            <div v-if="lastRuntimePrompt" class="preview-block">
              <h3>最近一次发送提示词</h3>
              <pre class="json-preview">{{ formatJson(lastRuntimePrompt) }}</pre>
            </div>
            <div class="preview-block">
              <h3>最近一次运行载荷</h3>
              <pre class="json-preview">{{ formatJson(lastRuntimePayload) }}</pre>
            </div>
            <div class="preview-block">
              <h3>最近一次解析结果</h3>
              <pre class="json-preview">{{ formatJson(lastRuntimeResult) }}</pre>
            </div>
            <div v-if="lastRuntimeRawText" class="preview-block">
              <h3>最近一次原始文本</h3>
              <pre class="json-preview">{{ lastRuntimeRawText }}</pre>
            </div>
          </details>
        </article>
      </div>
    </section>

    </section>

    <section v-show="activeBattleTab === 'play'" class="battle-play battle-play--large">
      <aside class="battle-sidebar" aria-label="战斗侧栏">
        <button class="battle-sidebar__new" type="button" @click="openSettingsPage">设置</button>

        <div class="battle-sidebar__empty">
          <div class="battle-sidebar__bubbles" aria-hidden="true">
            <span></span>
            <span></span>
          </div>
          <strong>{{ battleSession.激活 ? `第 ${battleSession.round.round_no} 回合` : '暂无战斗记录' }}</strong>
          <span>{{ battleSession.激活 ? battlePhaseLabel : headerSourceText }}</span>
        </div>

        <button class="battle-sidebar__dice" type="button" :disabled="!canOpenDiceDialog" @click="openDiceDialog">
          <span>{{ diceRollLabel === '--' ? 'D20' : diceRollLabel }}</span>
        </button>

      </aside>

      <main class="battle-main">
        <header class="battle-topbar battle-topbar--large">
          <div class="battle-topbar__actions">
            <button class="btn btn--ghost btn--sm" type="button" @click="refreshBattleData">重新读取</button>
            <button class="btn btn--primary btn--sm" type="button" :disabled="isResolving || isRuntimeRequestBusy" @click="resolveAgain">{{ rerunButtonLabel }}</button>
            <button class="btn btn--warn btn--sm" type="button" @click="forceRebuild">重建战斗</button>
          </div>
          <div class="battle-topbar__meta">
            <span class="battle-topbar__mode">{{ turnModeLabel }} · {{ runModeLabel }}</span>
            <div class="battle-icon-group">
              <button class="battle-icon-btn battle-icon-btn--label" type="button" title="设置" @click="openSettingsPage">设置</button>
              <button class="battle-icon-btn battle-icon-btn--label" type="button" title="骰子" :disabled="!canOpenDiceDialog" @click="openDiceDialog">骰子</button>
              <button class="battle-icon-btn battle-icon-btn--label" type="button" title="关闭" @click="closeWindow">关闭</button>
            </div>
          </div>
        </header>

        <div class="battle-stage">
          <article class="battle-chat battle-chat--large">
            <div class="battle-chat__status">
              <template v-if="battleSession.激活">
                第 {{ battleSession.round.round_no }} 回合 · {{ battlePhaseLabel }}<template v-if="!isFreeformRuntime"> · 明骰 {{ diceRollLabel }}</template><template v-if="isResolving || isRuntimeRequestBusy"> · AI 处理中</template>
              </template>
              <template v-else>
                可直接发送测试请求；需要写入战斗态时再重建。
              </template>
            </div>

            <div class="battle-chat__log">

              <TransitionGroup name="msg" tag="div" class="battle-message-list">
                <div
                  v-for="message in chatMessages"
                  :key="message.id"
                  class="battle-message"
                  :class="getChatMessageClass(message.role)"
                >
                  <span class="message-label">{{ message.label || getChatMessageLabel(message.role) }}</span>
                  <p>{{ message.content }}</p>
                </div>
              </TransitionGroup>

              <div v-if="isTyping" class="battle-typing">
                <span class="battle-typing__dot"></span>
                <span class="battle-typing__dot"></span>
                <span class="battle-typing__dot"></span>
                <span class="battle-typing__label">AI 输入中...</span>
              </div>

              <div v-if="!chatMessages.length" class="battle-message battle-message--ai">
                <span class="message-label">系统</span>
                <p>等待你的指令。</p>
              </div>

              <div v-if="battleSession.pending_preview.summary" class="battle-message battle-message--preview">
                <span class="message-label">标记结果</span>
                <p>{{ battleSession.pending_preview.summary }}</p>
                <div v-if="battleSession.phase === 'preview'" class="battle-message__actions">
                  <button class="btn btn--primary btn--sm" type="button" @click="applyPreview">应用结果，进入下一回合</button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="resolveAgain">重新结算</button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="finishBattle">结束战斗</button>
                  <button class="btn btn--warn btn--sm" type="button" @click="forceRebuild">重建战斗</button>
                </div>
              </div>

              <div v-if="latestFullBattleResult" class="battle-message battle-message--preview">
                <span class="message-label">整场摘要</span>
                <p v-if="latestFullBattleReport">{{ latestFullBattleReport }}</p>
                <ul v-if="latestFullBattleResult.rounds.length" class="compact-list">
                  <li v-for="(round, index) in latestFullBattleResult.rounds" :key="`${round.round_index}-${index}`">
                    第{{ resolveFullBattleRoundIndex(round, index) }}回合：{{ formatFullBattleRoundDigest(round) }}
                  </li>
                </ul>
                <ul v-if="latestFullBattleLootLines.length" class="compact-list">
                  <li v-for="line in latestFullBattleLootLines" :key="line">
                    战利品：{{ line }}
                  </li>
                </ul>
              </div>

              <div v-if="uiActionError || lastResolveError || lastRuntimeRequestError" class="battle-message battle-message--error">
                <p v-if="uiActionError">操作失败：{{ uiActionError }}</p>
                <p v-if="lastResolveError">AI 结算失败：{{ lastResolveError }}</p>
                <p v-if="lastRuntimeRequestError">正式执行失败：{{ lastRuntimeRequestError }}</p>
                <details v-if="lastRuntimeRawText" class="battle-inline-details">
                  <summary>查看 AI 原始返回</summary>
                  <pre class="json-preview">{{ lastRuntimeRawText }}</pre>
                </details>
                <div class="battle-message__actions">
                  <button class="btn btn--ghost btn--sm" type="button" @click="resolveAgain">重新结算</button>
                  <button class="btn btn--warn btn--sm" type="button" @click="forceRebuild">重建战斗</button>
                </div>
              </div>
            </div>

            <template v-if="battleSession.激活 && battleSession.phase === 'finished'">
              <div class="battle-composer battle-composer--large">
                <div class="battle-composer__row battle-composer__row--header">
                  <strong>战斗结束 · 提交或放弃</strong>
                </div>
                <div class="battle-composer__row">
                  <label class="form-field form-field--inline">
                    <span>输出模式</span>
                    <select v-model="outputMode" class="form-control form-control--sm" @change="syncOutputMode">
                      <option value="summary_only">摘要模式</option>
                      <option value="full_log">完整模式</option>
                    </select>
                  </label>
                </div>
                <div class="battle-composer__row">
                  <textarea
                    v-model="summaryDraft"
                    class="battle-composer__input battle-composer__input--large"
                    placeholder="编辑摘要文本（将作为入楼消息内容）"
                    rows="3"
                  ></textarea>
                </div>
                <div v-if="outputMode === 'full_log'" class="battle-composer__row">
                  <textarea
                    v-model="fullLogDraft"
                    class="battle-composer__input battle-composer__input--large"
                    placeholder="编辑完整日志文本（将附加在摘要之后）"
                    rows="4"
                  ></textarea>
                </div>
                <div class="battle-composer__row battle-composer__row--actions">
                  <button class="btn btn--primary battle-composer__commit" type="button" @click="commitBattle">
                    确认入楼
                  </button>
                  <button
                    v-if="canResolveLoot"
                    class="btn battle-composer__loot"
                    type="button"
                    @click="resolveLoot"
                  >
                    结算战利品
                  </button>
                  <button class="btn btn--warn battle-composer__abandon" type="button" @click="abandon">
                    放弃战斗
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="battle-composer battle-composer--large">
                <div class="battle-composer__row">
                  <button class="btn battle-composer__dice" :disabled="!canOpenDiceDialog" @click="openDiceDialog">骰子</button>
                  <textarea
                    v-model="strategyDraft"
                    class="battle-composer__input battle-composer__input--large"
                    placeholder="输入消息..."
                  ></textarea>
                  <button
                    class="btn btn--primary battle-composer__confirm battle-composer__confirm--large"
                    :disabled="!canSendBattleCommand"
                    @click="confirm"
                  >
                    发送
                  </button>
                </div>
              </div>
            </template>
          </article>
        </div>
      </main>

      <div v-if="diceDialogOpen" class="dice-dialog-backdrop" role="dialog" aria-modal="true" aria-label="骰子结果">
        <div class="dice-dialog">
          <div class="dice-dialog__head">
            <strong>明骰结果</strong>
            <span>已重投 {{ effectiveDiceCheck?.reroll_used ?? 0 }} 次</span>
          </div>
          <div class="dice-dialog__die" :class="diceAnimating ? 'dice-dialog__die--rolling' : ''">
            {{ diceRollLabel }}
          </div>
          <div class="dice-dialog__actions">
            <button class="btn" type="button" :disabled="!canRollDice" @click="reroll">{{ diceRollLabel === '--' ? '投骰' : '重投' }}</button>
            <button class="btn btn--primary" type="button" @click="acceptDiceDialog">确定</button>
            <button class="btn btn--ghost" type="button" @click="closeDiceDialog">返回</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { klona } from 'klona';
import { storeToRefs } from 'pinia';
import type {
  BattleApiProfile,
  BattleFrontendSettings,
  BattleFullResult,
  BattleLootResult,
  BattleProfile,
  BattlePromptConfig,
  BattlePromptTemplate,
  BattleWorldbookSource,
} from '../../脚本/战斗/ai-profile.ts';
import {
  buildBattleFieldTree,
  buildBattleFieldSelectionSourceHash,
  buildUpdatedFieldSelectionConfig,
  createBattleSelectedFieldFromState,
  extractSelectedBattleData,
  hasIncludedBattleFieldAncestor,
  removeBattleSelectedField,
  upsertBattleSelectedField,
} from '../../脚本/战斗/field-selection.ts';
import { BattlePromptConfigSchema } from '../../脚本/战斗/frontend-settings.ts';
import { serializeImportedWorldbooks } from '../../脚本/战斗/worldbook.ts';
import type { BattleSession } from '../../schema.ts';
import FieldTreeNode from './FieldTreeNode.vue';
import { useBattleWindowStore } from './store';

type BattlePromptTemplateKey = keyof BattlePromptConfig;
type BattleUiTab = 'play' | 'settings';
type SettingsSectionKey = 'run' | 'rules' | 'worldbook' | 'advanced';
type ToastType = 'success' | 'error' | 'warn';
type ToastMessage = {
  id: number;
  title: string;
  message: string;
  type: ToastType;
};

const store = useBattleWindowStore();
const {
  rawMainState,
  runtimeStatData,
  battleSession,
  apiProfiles,
  activeApiProfile,
  battleProfiles,
  activeBattleProfile,
  discoveredModels,
  discoveredActiveModels,
  canResume,
  enemyCount,
  isResolving,
  isApiBusy,
  isFieldAnalysisBusy,
  isRuntimeRequestBusy,
  isWorldbookBusy,
  lastResolveError,
  lastApiMessage,
  lastApiError,
  worldbookNames,
  worldbookEntryOptions,
  lastWorldbookMessage,
  lastWorldbookError,
  lastFieldAnalysisMessage,
  lastFieldAnalysisError,
  lastFieldAnalysisPayload,
  lastFieldAnalysisResult,
  lastFieldAnalysisRawText,
  lastRuntimeRequestMessage,
  lastRuntimeRequestError,
  lastRuntimePayload,
  lastRuntimePrompt,
  lastRuntimeResult,
  lastRuntimeRawText,
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
const selectedWorldbookName = ref('');
const selectedWorldbookEntryIds = ref<string[]>([]);
const runtimeDraftError = ref('');
const uiActionError = ref('');
const toastMessage = ref<ToastMessage | null>(null);
const lastDiceMessage = ref('');
const refreshNotice = ref('');
const lastDicePlayerCheck = ref<{ roll: number; reroll_used: number; confirmed: boolean } | null>(null);
const diceLockedForRound = ref(false);
const diceDialogOpen = ref(false);
const diceAnimating = ref(false);
const activeBattleTab = ref<BattleUiTab>('play');
const activeSettingsSection = ref<SettingsSectionKey>('run');
let diceAnimationTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const settingsSections: Array<{ key: SettingsSectionKey; label: string }> = [
  { key: 'run', label: '运行' },
  { key: 'rules', label: '战斗规则' },
  { key: 'worldbook', label: '世界书' },
  { key: 'advanced', label: '高级' },
];
const apiEndpointPresets = [
  { label: 'OpenAI 兼容 /v1', baseUrl: 'https://api.openai.com/v1', modelFetchPath: '/models' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelFetchPath: '/models' },
  { label: '本地 OpenAI 兼容服务', baseUrl: 'http://127.0.0.1:8000/v1', modelFetchPath: '/models' },
  { label: 'Ollama OpenAI 兼容', baseUrl: 'http://127.0.0.1:11434/v1', modelFetchPath: '/models' },
];
const canRemoveApiProfile = computed(() => apiProfiles.value.length > 1);
const canRemoveBattleProfile = computed(() => battleProfiles.value.length > 1);
const isSettingsBusy = computed(() => isApiBusy.value || isFieldAnalysisBusy.value || isWorldbookBusy.value || isRuntimeRequestBusy.value);
const apiProfileModelOptions = computed(() => {
  const candidateIds = [apiProfileDraft.value?.id, activeApiProfile.value?.id].filter((id): id is string => Boolean(id));
  for (const id of candidateIds) {
    const models = discoveredModels.value[id] ?? [];
    if (models.length) {
      return models;
    }
  }
  return discoveredActiveModels.value;
});
const activePromptKey = ref<BattlePromptTemplateKey>('single_round');
const promptNotice = ref('');
const promptError = ref('');
const promptTemplateOptions: Array<{ key: BattlePromptTemplateKey; label: string }> = [
  { key: 'field_analysis', label: '字段分析' },
  { key: 'single_round', label: '单回合战斗' },
  { key: 'full_battle', label: '快速整场战斗' },
  { key: 'loot_resolution', label: '战利品结算' },
];
const fieldSourceData = computed<Record<string, unknown>>(() => runtimeStatData.value);
const fieldSourceHash = computed(() => buildBattleFieldSelectionSourceHash(fieldSourceData.value));
const isFieldSelectionForCurrentData = computed(
  () => Boolean(battleProfileDraft.value) && battleProfileDraft.value!.field_selection.source_data_hash === fieldSourceHash.value,
);
const fieldOverrides = computed(() => battleProfileDraft.value?.field_selection.selected_fields ?? []);
const analyzedFields = computed(() => lastFieldAnalysisResult.value?.fields ?? []);
const analysisWarnings = computed(() => battleProfileDraft.value?.field_selection.analysis_warnings ?? []);
const fieldTree = computed(() => buildBattleFieldTree(fieldSourceData.value));
const selectedDataExtraction = computed(() => extractSelectedBattleData(fieldSourceData.value, fieldOverrides.value));
const selectedDataPreview = computed(() => selectedDataExtraction.value.selectedData);
const selectedDataWarnings = computed(() => selectedDataExtraction.value.warnings);
const importedWorldbooks = computed(() => battleProfileDraft.value?.context.imported_worldbooks ?? []);
const enabledImportedWorldbookCount = computed(() => importedWorldbooks.value.filter(worldbook => worldbook.enabled).length);
const serializedWorldbookPreview = computed(() =>
  battleProfileDraft.value
    ? serializeImportedWorldbooks(
        battleProfileDraft.value.context.imported_worldbooks,
        battleProfileDraft.value.context.worldbook_max_chars,
      )
    : [],
);
const fieldOverrideCount = computed(() => fieldOverrides.value.length);
const disabledFieldCount = computed(() => fieldOverrides.value.filter(field => !field.enabled).length);
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
const latestFullBattleReport = computed(() => latestFullBattleResult.value?.battle_report?.trim() ?? '');
const latestFullBattleLootLines = computed(() => {
  const result = latestFullBattleResult.value;
  if (!result) {
    return [];
  }
  const itemLines = result.loot_result.loot_items
    .filter(item => item.name.trim() || item.description.trim() || item.reason.trim())
    .map(item => {
      const name = item.name.trim() || item.description.trim() || item.reason.trim();
      const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';
      const description = item.description.trim() && item.description.trim() !== name ? `，${item.description.trim()}` : '';
      return `${name}${quantity}${description}`;
    });
  if (itemLines.length) {
    return itemLines;
  }
  return Object.entries(result.loot_mvu_updates).map(([key, value]) =>
    typeof value === 'number' ? `${key}：${value >= 0 ? '+' : ''}${value}` : `${key}：${formatJson(value)}`,
  );
});
const latestLootResult = computed<BattleLootResult | null>(() =>
  lastRuntimeResult.value && 'mvu_updates' in lastRuntimeResult.value ? (lastRuntimeResult.value as BattleLootResult) : null,
);
const formatFullBattleRoundDigest = (round: BattleFullResult['rounds'][number]) =>
  round.summary?.trim() || round.narration?.trim() || 'AI 未提供本回合摘要';
const resolveFullBattleRoundIndex = (round: BattleFullResult['rounds'][number], index: number) =>
  Number.isFinite(round.round_index) && round.round_index > 0 && round.round_index !== 1 ? round.round_index : index + 1;
const chatMessages = computed(() => {
  const runtimeMessages = battleSession.value.runtime.transcript
    .filter(message => message.content.trim())
    .map(message => ({
      id: message.id || `runtime-${message.created_at}-${message.content}`,
      role: message.role,
      label: message.label,
      content: message.content,
    }));
  const messages = [...runtimeMessages];

  if (lastDiceMessage.value && !messages.some(message => message.content === lastDiceMessage.value)) {
    messages.push({
      id: 'local-dice-message',
      role: 'system' as const,
      label: '骰子',
      content: lastDiceMessage.value,
    });
  }

  if (lastRuntimeRequestMessage.value && !messages.some(message => message.content === lastRuntimeRequestMessage.value)) {
    messages.push({
      id: 'local-runtime-status',
      role: 'system' as const,
      label: '系统',
      content: lastRuntimeRequestMessage.value,
    });
  }

  if (refreshNotice.value && !messages.some(message => message.content === refreshNotice.value)) {
    messages.push({
      id: 'local-refresh-status',
      role: 'system' as const,
      label: '刷新',
      content: refreshNotice.value,
    });
  }

  return messages;
});
const getChatMessageLabel = (role: 'system' | 'player' | 'ai') => {
  switch (role) {
    case 'player':
      return '你';
    case 'ai':
      return '系统';
    default:
      return '系统';
  }
};
const getChatMessageClass = (role: 'system' | 'player' | 'ai') => {
  switch (role) {
    case 'player':
      return 'battle-message--player';
    case 'ai':
      return 'battle-message--ai';
    default:
      return 'battle-message--notice';
  }
};
const hasSourceMessage = computed(() => sourceMessageId.value >= 0);
const effectiveDiceCheck = computed(() => {
  if (lastDicePlayerCheck.value?.roll && lastDicePlayerCheck.value.roll > 0) {
    return lastDicePlayerCheck.value;
  }
  if (battleSession.value.激活 && battleSession.value.player_check.roll > 0) {
    return battleSession.value.player_check;
  }
  return null;
});
const isTyping = computed(() => isResolving.value || isRuntimeRequestBusy.value);
const diceRollLabel = computed(() => {
  const roll = effectiveDiceCheck.value?.roll ?? 0;
  return roll > 0 ? String(roll) : '--';
});
const canOpenDiceDialog = computed(
  () =>
    !isFreeformRuntime.value &&
    !isResolving.value &&
    !isRuntimeRequestBusy.value &&
    !diceLockedForRound.value &&
    (!effectiveDiceCheck.value || !effectiveDiceCheck.value.confirmed),
);
const canRollDice = computed(
  () =>
    !isResolving.value &&
    !isRuntimeRequestBusy.value &&
    !diceLockedForRound.value &&
    (!effectiveDiceCheck.value ||
      (!effectiveDiceCheck.value.confirmed &&
        (effectiveDiceCheck.value.roll <= 0 || effectiveDiceCheck.value.reroll_used < 99))),
);
const canSendBattleCommand = computed(
  () =>
    !isResolving.value &&
    !isRuntimeRequestBusy.value &&
    battleSession.value.phase !== 'ai_resolve' &&
    battleSession.value.phase !== 'preview',
);
const headerSourceText = computed(() =>
  sourceMessageId.value >= 0 ? `当前楼层 ${sourceMessageId.value}` : '当前楼层未定位',
);
const activeSectionLabel = computed(() => settingsSections.find(item => item.key === activeSettingsSection.value)?.label ?? '设置');
const settingsRunModeLabel = computed(() => {
  if (!battleProfileDraft.value) {
    return '未配置';
  }
  const runMode = battleProfileDraft.value.run_mode === 'freeform' ? '自由描述' : '明骰驱动';
  const turnMode = battleProfileDraft.value.default_turn_mode === 'full_battle' ? '整场' : '单回合';
  return `${runMode} / ${turnMode}`;
});
const settingsFieldSummary = computed(() => {
  if (!battleProfileDraft.value) {
    return '未配置';
  }
  return `${fieldOverrideCount.value} 条${disabledFieldCount.value ? ` / ${disabledFieldCount.value} 停用` : ''}`;
});
const currentApiTestResult = computed(() => apiProfileDraft.value?.last_test_result ?? activeApiProfile.value?.last_test_result ?? null);
const settingsApiStatusText = computed(() => {
  const result = currentApiTestResult.value;
  if (!result) {
    return '未测试';
  }
  if (result.ok) {
    return result.message?.includes('generateRaw') ? '酒馆链路可用' : '接口可用';
  }
  return '测试失败';
});
const settingsApiStatusTone = computed(() => {
  const result = currentApiTestResult.value;
  if (!result) {
    return '';
  }
  return result.ok ? 'settings-stat--ok' : 'settings-stat--error';
});
const battlePhaseLabel = computed(() => {
  switch (battleSession.value.phase) {
    case 'idle':
      return '待机';
    case 'player_input':
      return '等待指令';
    case 'ai_resolve':
      return 'AI 结算';
    case 'preview':
      return '等待确认';
    case 'finished':
      return '战斗结束';
    default:
      return '未命名阶段';
  }
});
const runModeLabel = computed(() => {
  switch (battleProfileDraft.value?.run_mode) {
    case 'dice_driven':
      return '明骰驱动';
    case 'freeform':
      return '自由描述';
    default:
      return '未配置';
  }
});
const turnModeLabel = computed(() => {
  switch (battleProfileDraft.value?.default_turn_mode) {
    case 'round_based':
      return '单回合推进';
    case 'full_battle':
      return '整场快速推演';
    default:
      return '未配置';
  }
});
const settlementModeLabel = computed(() => {
  switch (battleProfileDraft.value?.settlement_mode) {
    case 'no_loot':
      return '无掉落';
    case 'direct_loot':
      return '直接生成掉落';
    case 'checked_loot':
      return '战后单独结算';
    default:
      return '未配置';
  }
});
const activePromptTemplate = computed<BattlePromptTemplate | null>(() => {
  if (!battleProfileDraft.value) {
    return null;
  }
  return battleProfileDraft.value.prompts[activePromptKey.value];
});
const activePromptOption = computed(() => promptTemplateOptions.find(item => item.key === activePromptKey.value) ?? null);
const formatApiProfileOptionLabel = (profile: BattleApiProfile) => {
  const name = profile.name?.trim() || '未命名接口';
  const model = profile.model?.trim();
  const host = profile.base_url?.trim().replace(/^https?:\/\//u, '').replace(/\/+$/u, '');
  return [name, model, host].filter(Boolean).join(' · ');
};
const formatWorldbookSource = (source: BattleWorldbookSource) => {
  switch (source) {
    case 'character':
      return '角色绑定';
    case 'global':
      return '全局启用';
    default:
      return '手动导入';
  }
};
const formatBattleProfileOptionLabel = (profile: BattleProfile) => {
  const name = profile.name?.trim() || '未命名战斗配置';
  const mode = profile.default_turn_mode === 'full_battle' ? '整场' : '单回合';
  const settlement =
    profile.settlement_mode === 'checked_loot'
      ? '战后掉落'
      : profile.settlement_mode === 'direct_loot'
        ? '直接掉落'
        : '无掉落';
  return `${name} · ${mode} · ${settlement}`;
};
const formatFieldSource = (source: 'ai' | 'manual') => (source === 'ai' ? '字段分析' : '手动补选');
const formatFieldValueKind = (valueKind: string) => {
  switch (valueKind) {
    case 'scalar':
      return '标量';
    case 'object':
      return '对象';
    case 'array':
      return '数组';
    default:
      return '未知';
  }
};
const syncApiProfileDraftFromSettings = (settings: BattleFrontendSettings, preferredId?: string | null) => {
  const profile =
    settings.api_profiles.find(item => item.id === preferredId) ??
    settings.api_profiles.find(item => item.id === settings.active_api_profile_id) ??
    settings.api_profiles[0] ??
    null;
  apiProfileDraft.value = profile ? klona(profile) : null;
};
const syncBattleProfileDraftFromSettings = (settings: BattleFrontendSettings, preferredId?: string | null) => {
  const profile =
    settings.battle_profiles.find(item => item.id === preferredId) ??
    settings.battle_profiles.find(item => item.id === settings.active_battle_profile_id) ??
    settings.battle_profiles[0] ??
    null;
  battleProfileDraft.value = profile ? klona(profile) : null;
};

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
    activePromptKey.value = 'single_round';
    promptNotice.value = '';
    promptError.value = '';
  },
  { immediate: true },
);

watch(selectedWorldbookName, () => {
  selectedWorldbookEntryIds.value = [];
  worldbookEntryOptions.value = [];
});

watch(
  () => battleSession.value.round.round_no,
  () => {
    lastDicePlayerCheck.value = null;
    lastDiceMessage.value = '';
    diceLockedForRound.value = false;
  },
);

watch(
  () => battleSession.value.player_check.strategy_text,
  value => {
    strategyDraft.value = value;
  },
  { immediate: true },
);

watch(
  () => battleSession.value.player_check,
  value => {
    if (battleSession.value.激活) {
      lastDicePlayerCheck.value = {
        roll: value.roll,
        reroll_used: value.reroll_used,
        confirmed: value.confirmed,
      };
      return;
    }
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

watch(
  () => battleSession.value.phase,
  (phase, prevPhase) => {
    if (phase === 'finished' && phase !== prevPhase) {
      if (!summaryDraft.value && battleSession.value.runtime.latest_summary) {
        summaryDraft.value = battleSession.value.runtime.latest_summary;
      }
      if (!fullLogDraft.value && battleSession.value.runtime.latest_battle_report) {
        fullLogDraft.value = battleSession.value.runtime.latest_battle_report;
      }
    }
  },
);

const runUiAction = async (action: () => Promise<void>) => {
  uiActionError.value = '';
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastResolveError.value && message !== lastRuntimeRequestError.value) {
      uiActionError.value = message;
    }
    showToast('操作失败', message, 'error');
    console.error('[planeswalker.battle-window] action failed', error);
  }
};
const showToast = (title: string, message: string, type: ToastType = 'success') => {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastMessage.value = {
    id: Date.now(),
    title,
    message,
    type,
  };
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
    toastTimer = null;
  }, 2200);
};
const startBattle = async () => {
  await runUiAction(() => store.startBattle());
};
const openSettingsPage = () => {
  activeBattleTab.value = 'settings';
};
const closeSettingsPage = () => {
  activeBattleTab.value = 'play';
};
const closeWindow = () => {
  store.close();
};
const refreshBattleData = () => {
  store.refresh();
  refreshNotice.value = `已重新读取当前楼层数据（楼层 ${sourceMessageId.value}）`;
};
const showDiceDialog = (animate = true) => {
  if (diceAnimationTimer) {
    clearTimeout(diceAnimationTimer);
  }
  diceDialogOpen.value = true;
  diceAnimating.value = animate;
  if (!animate) {
    return;
  }
  diceAnimationTimer = setTimeout(() => {
    diceAnimating.value = false;
    diceAnimationTimer = null;
  }, 520);
};
const acceptDiceDialog = async () => {
  await runUiAction(async () => {
    await ensureBattleSessionForProfile();
    if ((effectiveDiceCheck.value?.roll ?? 0) <= 0) {
      if (battleSession.value.激活) {
        const result = await store.reroll();
        syncLastDiceCheckFromResult(result);
      } else {
        rollLocalDice();
      }
    }
    lastDiceMessage.value = `玩家方技能检定：1d20=${diceRollLabel.value}`;
    diceLockedForRound.value = true;
    diceDialogOpen.value = false;
    if (battleSession.value.激活) {
      await store.appendRuntimeChatMessage({
        role: 'system',
        label: '骰子',
        content: lastDiceMessage.value,
      });
    }
  });
};
const closeDiceDialog = () => {
  diceDialogOpen.value = false;
};
const resumeOrRebuild = async () => {
  await runUiAction(() => store.resumeOrRebuild());
};
const forceRebuild = async () => {
  await runUiAction(async () => {
    await store.forceRebuild();
    strategyDraft.value = '';
    lastDiceMessage.value = '';
    lastDicePlayerCheck.value = null;
    diceLockedForRound.value = false;
  });
};
const saveStrategy = async () => {
  await runUiAction(async () => {
    await store.saveStrategy(strategyDraft.value);
    showToast('已保存', '战斗策略已写入当前战斗会话');
  });
};
const syncLastDiceCheckFromResult = (result: unknown) => {
  const playerCheck = _.get(result, 'after.battle_session.player_check');
  const fallback = battleSession.value.player_check;
  const source = _.isPlainObject(playerCheck) ? playerCheck : fallback;
  lastDicePlayerCheck.value = {
    roll: Number(_.get(source, 'roll')) || 0,
    reroll_used: Number(_.get(source, 'reroll_used')) || 0,
    confirmed: Boolean(_.get(source, 'confirmed')),
  };
};
const rollLocalDice = () => {
  const current = lastDicePlayerCheck.value;
  lastDicePlayerCheck.value = {
    roll: _.random(1, 20),
    reroll_used: current ? current.reroll_used + 1 : 0,
    confirmed: false,
  };
};
const ensureBattleSessionForProfile = async () => {
  if (battleProfileDraft.value && !battleSession.value.激活) {
    await store.startBattle();
  }
};
const openDiceDialog = async () => {
  await runUiAction(async () => {
    if (battleSession.value.激活) {
      syncLastDiceCheckFromResult(null);
    }
    showDiceDialog(false);
  });
};
const reroll = async () => {
  await runUiAction(async () => {
    await ensureBattleSessionForProfile();
    if (battleSession.value.激活) {
      const result = await store.reroll();
      syncLastDiceCheckFromResult(result);
    } else {
      rollLocalDice();
    }
    showDiceDialog(true);
  });
};
const buildBattleCommandOptions = () => {
  const diceInputs =
    isFreeformRuntime.value || battleSession.value.激活
      ? {}
      : {
          check_owner: '玩家方',
          check_label: '玩家方技能检定',
          player_skill_check: effectiveDiceCheck.value?.roll ? `玩家方技能检定：1d20=${effectiveDiceCheck.value.roll}` : '',
          player_roll: effectiveDiceCheck.value?.roll || undefined,
          reroll_used: effectiveDiceCheck.value?.reroll_used ?? 0,
          dark_pool_label: '共享暗骰池',
          dark_pool_instruction: '以下为骰子池，请在接下来的检定中按顺序依次使用，不能跳过、重排或重投。',
          dark_pool_remaining: Array.from({ length: 5 }, () => _.random(1, 20)),
          dark_pool_cursor: 0,
        };
  return {
    playerCommand: strategyDraft.value,
    diceInputs,
    extraInstructions: '',
  };
};
const buildResolveAgainCommandOptions = () => ({
  ...buildBattleCommandOptions(),
  playerCommand: battleSession.value.player_check.confirmed
    ? battleSession.value.player_check.strategy_text
    : strategyDraft.value,
});
const confirm = async () => {
  await runUiAction(async () => {
    const playerCommand = strategyDraft.value.trim();

    if (battleSession.value.phase === 'finished') {
      await store.forceRebuild();
      strategyDraft.value = '';
      lastDiceMessage.value = '';
      lastDicePlayerCheck.value = null;
      return;
    }

    if (!battleProfileDraft.value) {
      if (!battleSession.value.激活) {
        await store.startBattle();
      }
      if (playerCommand) {
        await store.appendRuntimeChatMessage({ role: 'player', label: '你', content: playerCommand });
      }
      await store.saveStrategy(strategyDraft.value);
      await store.confirm();
      strategyDraft.value = '';
      return;
    }
    if (battleSession.value.激活) {
      if (playerCommand) {
        await store.appendRuntimeChatMessage({ role: 'player', label: '你', content: playerCommand });
      }
      await store.saveStrategy(strategyDraft.value);
    } else {
      await store.startBattle();
      if (playerCommand) {
        await store.appendRuntimeChatMessage({ role: 'player', label: '你', content: playerCommand });
      }
      await store.saveStrategy(strategyDraft.value);
    }
    await store.executeConfiguredBattleTurn(battleProfileDraft.value, selectedDataPreview.value, buildBattleCommandOptions());
    strategyDraft.value = '';
  });
};
const resolveAgain = async () => {
  await runUiAction(async () => {
    if (!battleProfileDraft.value) {
      if (!battleSession.value.player_check.confirmed) {
        await store.saveStrategy(strategyDraft.value);
      }
      await store.resolveAgain();
      return;
    }
    if (battleSession.value.激活) {
      if (battleSession.value.pending_preview.summary) {
        await store.prepareCurrentRoundRerun();
      }
      if (!battleSession.value.player_check.confirmed) {
        await store.saveStrategy(strategyDraft.value);
      }
    } else {
      await store.startBattle();
      await store.saveStrategy(strategyDraft.value);
    }
    await store.executeConfiguredBattleTurn(battleProfileDraft.value, selectedDataPreview.value, buildResolveAgainCommandOptions());
  });
};
const useMockPreview = async () => {
  await runUiAction(() => store.useMockPreview());
};
const resolveLoot = async () => {
  await runUiAction(async () => {
    if (!battleProfileDraft.value) {
      return;
    }
    await store.saveStrategy(strategyDraft.value);
    await store.executeConfiguredLootResolution(battleProfileDraft.value, selectedDataPreview.value);
  });
};
const applyPreview = async () => {
  await runUiAction(async () => {
    await store.applyPreview();
    strategyDraft.value = '';
    lastDiceMessage.value = '';
    lastDicePlayerCheck.value = null;
    diceLockedForRound.value = false;
  });
};
const finishBattle = async () => {
  await runUiAction(() => store.finishBattle());
};
const changeActiveApiProfile = async (event: Event) => {
  const nextId = (event.target as HTMLSelectElement).value || null;
  await runUiAction(async () => {
    const profile = await store.setActiveApiProfile(nextId);
    apiProfileDraft.value = profile ? klona(profile) : null;
  });
};
const createNewApiProfile = async () => {
  await runUiAction(async () => {
    const profile = await store.createApiProfile();
    apiProfileDraft.value = profile ? klona(profile) : null;
  });
};
const saveApiProfileDraft = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const settings = await store.saveApiProfile(apiProfileDraft.value!, { makeActive: true });
    syncApiProfileDraftFromSettings(settings, apiProfileDraft.value!.id);
    showToast('接口已保存', apiProfileDraft.value?.name || '当前 API 配置已更新');
  });
};
const removeCurrentApiProfile = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const profile = await store.removeApiProfile(apiProfileDraft.value!.id);
    apiProfileDraft.value = profile ? klona(profile) : null;
    showToast('接口已删除', profile ? `已切换到 ${profile.name || '备用接口'}` : '当前没有可用接口', profile ? 'success' : 'warn');
  });
};
const applyApiEndpointPreset = (event: Event) => {
  if (!apiProfileDraft.value) {
    return;
  }
  const baseUrl = (event.target as HTMLSelectElement).value;
  const preset = apiEndpointPresets.find(item => item.baseUrl === baseUrl);
  if (!preset) {
    return;
  }
  apiProfileDraft.value.base_url = preset.baseUrl;
  apiProfileDraft.value.model_fetch_path = preset.modelFetchPath;
  apiProfileDraft.value.model_discovery.response_path = 'data';
  apiProfileDraft.value.model_discovery.use_auth_header = true;
};
const changeActiveBattleProfile = async (event: Event) => {
  const nextId = (event.target as HTMLSelectElement).value || null;
  await runUiAction(async () => {
    const profile = await store.setActiveBattleProfile(nextId);
    battleProfileDraft.value = profile ? klona(profile) : null;
  });
};
const createNewBattleProfile = async () => {
  await runUiAction(async () => {
    const profile = await store.createBattleProfile();
    battleProfileDraft.value = profile ? klona(profile) : null;
  });
};
const saveBattleProfileDraft = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const draft = klona(battleProfileDraft.value!);
    draft.field_selection = buildUpdatedFieldSelectionConfig(draft.field_selection, fieldOverrides.value, fieldSourceHash.value);
    const settings = await store.saveBattleProfile(draft, { makeActive: true });
    syncBattleProfileDraftFromSettings(settings, draft.id);
    promptNotice.value = '战斗配置与 Prompt 已保存';
    promptError.value = '';
    showToast('战斗配置已保存', draft.name || '当前战斗配置已更新');
  });
};
const syncDraftWorldbooks = (importedWorldbooks: BattleProfile['context']['imported_worldbooks']) => {
  if (!battleProfileDraft.value) {
    return;
  }
  battleProfileDraft.value.context.imported_worldbooks = klona(importedWorldbooks);
};
const refreshWorldbooks = async () => {
  await runUiAction(() => store.refreshWorldbookNames());
};
const autoImportWorldbooks = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const imported = await store.importActiveWorldbooks(battleProfileDraft.value!);
    syncDraftWorldbooks(imported);
  });
};
const manualImportWorldbook = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const imported = await store.importWorldbookByName(battleProfileDraft.value!, selectedWorldbookName.value);
    syncDraftWorldbooks(imported);
  });
};
const refreshWorldbookEntries = async () => {
  selectedWorldbookEntryIds.value = [];
  await runUiAction(() => store.refreshWorldbookEntries(selectedWorldbookName.value));
};
const manualImportWorldbookEntries = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const imported = await store.importWorldbookEntries(
      battleProfileDraft.value!,
      selectedWorldbookName.value,
      selectedWorldbookEntryIds.value,
    );
    syncDraftWorldbooks(imported);
  });
};
const toggleWorldbook = async (worldbookId: string, enabled: boolean) => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const imported = await store.toggleImportedWorldbook(battleProfileDraft.value!, worldbookId, enabled);
    syncDraftWorldbooks(imported);
  });
};
const toggleWorldbookFromEvent = async (worldbookId: string, event: Event) => {
  await toggleWorldbook(worldbookId, (event.target as HTMLInputElement).checked);
};
const removeWorldbook = async (worldbookId: string) => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const imported = await store.removeImportedWorldbook(battleProfileDraft.value!, worldbookId);
    syncDraftWorldbooks(imported);
  });
};
const removeCurrentBattleProfile = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const profile = await store.removeBattleProfile(battleProfileDraft.value!.id);
    battleProfileDraft.value = profile ? klona(profile) : null;
    promptNotice.value = '';
    promptError.value = '';
    showToast('战斗配置已删除', profile ? `已切换到 ${profile.name || '备用配置'}` : '当前没有可用战斗配置', profile ? 'success' : 'warn');
  });
};
const toggleActivePrompt = () => {
  if (!activePromptTemplate.value) {
    return;
  }
  activePromptTemplate.value.enabled = !activePromptTemplate.value.enabled;
};
const discoverModels = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const models = await store.discoverApiModels(apiProfileDraft.value!);
    if (!apiProfileDraft.value?.model && models[0]) {
      apiProfileDraft.value!.model = models[0];
    }
    showToast('模型列表已更新', models.length ? `已拉取 ${models.length} 个模型` : '请求成功，但没有解析到模型', models.length ? 'success' : 'warn');
  });
};
const saveAndDiscoverModels = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const firstSettings = await store.saveApiProfile(apiProfileDraft.value!, { makeActive: true });
    syncApiProfileDraftFromSettings(firstSettings, apiProfileDraft.value!.id);
    const models = await store.discoverApiModels(apiProfileDraft.value!);
    if (!apiProfileDraft.value?.model && models[0]) {
      apiProfileDraft.value!.model = models[0];
      const nextSettings = await store.saveApiProfile(apiProfileDraft.value!, { makeActive: true });
      syncApiProfileDraftFromSettings(nextSettings, apiProfileDraft.value!.id);
    }
    showToast('模型列表已更新', models.length ? `已保存接口并拉取 ${models.length} 个模型` : '接口已保存，但没有解析到模型', models.length ? 'success' : 'warn');
  });
};
const applyDiscoveredModel = (modelOption: string) => {
  if (!apiProfileDraft.value) {
    return;
  }
  apiProfileDraft.value.model = modelOption;
};
const applyDiscoveredModelFromSelect = (event: Event) => {
  applyDiscoveredModel((event.target as HTMLSelectElement).value);
};
const testCurrentApiProfile = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const result = await store.testApiProfile(apiProfileDraft.value!);
    if (apiProfileDraft.value) {
      apiProfileDraft.value.last_test_result = klona(result);
    }
    showToast(result.ok ? '连接测试成功' : '连接测试失败', result.message || '无额外说明', result.ok ? 'success' : 'error');
  });
};
const saveAndTestApiProfile = async () => {
  if (!apiProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    const settings = await store.saveApiProfile(apiProfileDraft.value!, { makeActive: true });
    syncApiProfileDraftFromSettings(settings, apiProfileDraft.value!.id);
    const result = await store.testApiProfile(apiProfileDraft.value!);
    if (apiProfileDraft.value) {
      apiProfileDraft.value.last_test_result = klona(result);
    }
    showToast(result.ok ? '接口已保存并测试成功' : '接口已保存但测试失败', result.message || '无额外说明', result.ok ? 'success' : 'error');
  });
};
const runFieldAnalysis = async () => {
  if (!battleProfileDraft.value) {
    return;
  }
  await runUiAction(async () => {
    store.refresh();
    await store.runBattleFieldAnalysis(battleProfileDraft.value!);
  });
};
const retryFieldAnalysis = async () => {
  await runUiAction(() => store.retryLastFieldAnalysis());
};
const patchFieldSelectionDraft = (fields: BattleProfile['field_selection']['selected_fields']) => {
  if (!battleProfileDraft.value) {
    return;
  }
  battleProfileDraft.value = {
    ...battleProfileDraft.value,
    field_selection: buildUpdatedFieldSelectionConfig(battleProfileDraft.value.field_selection, fields, fieldSourceHash.value),
  };
};
const importAnalyzedFieldsToSelection = () => {
  if (!battleProfileDraft.value || !analyzedFields.value.length) {
    return;
  }
  patchFieldSelectionDraft(
    analyzedFields.value.map(field => ({
      path: field.path,
      label: field.label || field.path,
      enabled: true,
      source: 'ai' as const,
      reason: field.reason,
      value_kind: 'unknown' as const,
    })),
  );
};
const toggleFieldFromTree = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }

  const currentFields = fieldOverrides.value;
  const existingField = currentFields.find(field => field.path === path);

  if (existingField) {
    patchFieldSelectionDraft(removeBattleSelectedField(currentFields, path));
    return;
  }

  const isIncludedByAncestor = hasIncludedBattleFieldAncestor(currentFields, path);
  const nextField = createBattleSelectedFieldFromState(fieldSourceData.value, path, 'manual');
  patchFieldSelectionDraft(
    upsertBattleSelectedField(currentFields, {
      ...nextField,
      enabled: !isIncludedByAncestor,
      reason: isIncludedByAncestor ? '手动排除' : '手动加入',
    }),
  );
};
const addManualField = () => {
  if (!manualFieldPath.value.trim()) {
    return;
  }
  toggleFieldFromTree(manualFieldPath.value);
  manualFieldPath.value = '';
};
const updateSelectedField = (path: string, patch: Partial<BattleProfile['field_selection']['selected_fields'][number]>) => {
  if (!battleProfileDraft.value) {
    return;
  }
  patchFieldSelectionDraft(
    fieldOverrides.value.map(field =>
      field.path === path ? { ...field, ...patch } : field,
    ),
  );
};
const toggleSelectedField = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }
  toggleFieldFromTree(path);
};
const removeSelectedField = (path: string) => {
  if (!battleProfileDraft.value) {
    return;
  }
  patchFieldSelectionDraft(removeBattleSelectedField(fieldOverrides.value, path));
};
const parseRuntimeDiceInputs = () => {
  const draft = runtimeDiceInputsDraft.value.trim();
  if (!draft) {
    return {};
  }
  if (/^\d+$/u.test(draft)) {
    return { player_roll: Number(draft) };
  }
  if (/^(?:1)?d20$/iu.test(draft)) {
    return { dice_expression: draft.toLowerCase(), player_roll: battleSession.value.player_check.roll || undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch {
    throw new Error('骰子输入可以填数字、1d20，或 JSON 对象，例如 {"player_roll":20}');
  }
  if (!_.isPlainObject(parsed)) {
    throw new Error('骰子输入可以填数字、1d20，或 JSON 对象');
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
const retryRuntimeRequest = async () => {
  await runRuntimeRequest(() => store.retryLastRuntimeRequest());
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
  await runUiAction(() => store.setOutputMode(outputMode.value));
};
const commitBattle = async () => {
  await runUiAction(async () => {
    await store.commitBattle({
      summary: summaryDraft.value,
      fullLog: fullLogDraft.value,
      outputMode: outputMode.value,
    });
    summaryDraft.value = '';
    fullLogDraft.value = '';
  });
};
const abandon = async () => {
  await runUiAction(async () => {
    await store.abandon();
    summaryDraft.value = '';
    fullLogDraft.value = '';
  });
};
const formatTimestamp = (timestamp: number) => {
  if (!timestamp) {
    return '未测试';
  }
  return new Date(timestamp).toLocaleString();
};
const formatJson = (value: unknown) => JSON.stringify(value, null, 2);
</script>

<style scoped>
.battle-toast {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 30;
  display: grid;
  gap: 3px;
  max-width: min(360px, calc(100vw - 28px));
  padding: 10px 12px;
  border: 1px solid rgba(255, 243, 212, 0.28);
  border-radius: 10px;
  background: rgba(6, 7, 11, 0.96);
  color: var(--p5-paper);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42), 3px 4px 0 rgba(0, 0, 0, 0.58);
}

.battle-toast strong {
  font-size: 13px;
  font-weight: 900;
}

.battle-toast span {
  color: var(--p5-muted);
  font-size: 12px;
  line-height: 1.4;
}

.battle-toast--success {
  border-color: rgba(134, 239, 172, 0.5);
}

.battle-toast--error {
  border-color: rgba(248, 113, 113, 0.68);
}

.battle-toast--warn {
  border-color: rgba(255, 209, 102, 0.58);
}

.battle-composer__row--header {
  padding: 6px 4px;
  color: var(--p5-gold, #ffd166);
  font-size: 13px;
}

.battle-composer__row--actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
}

.battle-composer__commit,
.battle-composer__abandon,
.battle-composer__loot {
  flex: 1 1 auto;
  min-width: 0;
}

.form-field--inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-control--sm {
  width: auto;
  min-width: 120px;
}

.battle-composer__commit.btn--primary {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  border-color: rgba(34, 197, 94, 0.5);
}

.settings-busy-indicator {
  align-self: center;
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid rgba(255, 209, 102, 0.35);
  border-radius: 999px;
  background: rgba(255, 209, 102, 0.1);
  color: var(--p5-gold);
  font-size: 11px;
  font-weight: 900;
}

.settings-overview {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 243, 212, 0.18);
  border-radius: 12px;
  background: rgba(6, 7, 11, 0.72);
}

.settings-overview__main {
  min-width: 0;
}

.settings-overview__main span,
.settings-stat span,
.settings-nav-label {
  display: block;
  color: rgba(255, 243, 212, 0.58);
  font-size: 11px;
  font-weight: 800;
}

.settings-overview__main strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: #fff3d4;
  font-size: 18px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-overview__main p {
  overflow: hidden;
  margin: 6px 0 0;
  color: rgba(255, 243, 212, 0.72);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-overview__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.settings-stat {
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(255, 243, 212, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
}

.settings-stat strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-stat--ok strong {
  color: #86efac;
}

.settings-stat--error strong {
  color: #fca5a5;
}

.settings-nav-groups {
  display: grid;
  gap: 8px;
}

.settings-nav-label {
  margin-bottom: 2px;
  padding: 0 2px;
  letter-spacing: 0;
}

.section-switch--secondary {
  background: rgba(6, 7, 11, 0.62);
}

.settings-run-dashboard {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.settings-panel--focus {
  border-color: rgba(34, 197, 94, 0.22);
  background:
    linear-gradient(180deg, rgba(34, 197, 94, 0.055), rgba(255, 255, 255, 0.018)),
    rgba(6, 7, 11, 0.78);
}

.settings-panel--wide {
  min-width: 0;
}

.settings-details {
  min-width: 0;
  margin-top: 10px;
  border: 1px solid rgba(255, 243, 212, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.028);
}

.settings-details:first-child {
  margin-top: 0;
}

.settings-details summary {
  cursor: pointer;
  padding: 9px 10px;
  color: rgba(255, 243, 212, 0.78);
  font-size: 12px;
  font-weight: 900;
  list-style-position: inside;
}

.settings-details__body,
.settings-details > .state-list,
.settings-details > .rule-toggle-grid,
.settings-details > .selected-field-summary,
.settings-details > .selected-field-list,
.settings-details > .preview-block,
.settings-details > .hint {
  margin: 0 10px 10px;
}

.settings-details--group {
  margin-top: 0;
}

.settings-details__group-body {
  margin: 0;
}

.radio-group {
  display: grid;
  gap: 8px;
}

.radio-card {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 243, 212, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
}

.radio-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-card__dot {
  position: relative;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 2px solid rgba(255, 243, 212, 0.48);
  border-radius: 999px;
  background: rgba(6, 7, 11, 0.9);
}

.radio-card__dot::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #ffd166;
  transform: translate(-50%, -50%) scale(0);
  transition: transform 160ms ease;
}

.radio-card__body strong,
.radio-card__body small {
  display: block;
}

.radio-card__body strong {
  color: #f8fafc;
  font-size: 13px;
}

.radio-card__body small {
  margin-top: 3px;
  color: rgba(255, 243, 212, 0.62);
  font-size: 11px;
  line-height: 1.45;
}

.radio-card:has(input:checked) {
  border-color: rgba(255, 209, 102, 0.56);
  background: rgba(255, 209, 102, 0.08);
}

.radio-card:has(input:checked) .radio-card__dot {
  border-color: #ffd166;
}

.radio-card:has(input:checked) .radio-card__dot::after {
  transform: translate(-50%, -50%) scale(1);
}

.battle-settings-page :deep(.btn),
.battle-settings-page :deep(.form-control),
.battle-settings-page :deep(.rule-toggle),
.section-pill {
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, opacity 160ms ease;
}

.battle-settings-page :deep(.btn:disabled),
.battle-settings-page :deep(.form-control:disabled),
.battle-settings-page :deep(select:disabled),
.battle-settings-page :deep(input:disabled),
.battle-settings-page :deep(textarea:disabled),
.battle-settings-page :deep(.rule-toggle:disabled),
.section-pill:disabled {
  border-color: rgba(255, 243, 212, 0.1);
  background: rgba(255, 255, 255, 0.035);
  color: rgba(255, 243, 212, 0.42);
  opacity: 0.7;
  cursor: not-allowed;
}

.battle-settings-page :deep(.btn:hover:not(:disabled)),
.section-pill:hover:not(:disabled) {
  border-color: rgba(255, 209, 102, 0.52);
}

.battle-settings-page :deep(.json-preview) {
  max-height: 280px;
  border-color: rgba(255, 209, 102, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 243, 212, 0.035), rgba(255, 255, 255, 0.015)),
    rgba(1, 2, 5, 0.92);
  color: #f6f0df;
  font-size: 12px;
  line-height: 1.65;
  tab-size: 2;
}

@media (min-width: 900px) {
  .battle-settings-page {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    align-items: start;
    gap: 10px 12px;
    padding: 10px;
  }

  .battle-settings-page :deep(.page-header) {
    grid-column: 1 / -1;
  }

  .settings-overview {
    grid-column: 1 / -1;
    grid-template-columns: minmax(220px, 1.1fr) minmax(0, 1.9fr);
    align-items: stretch;
  }

  .settings-overview__stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .settings-nav-groups {
    position: sticky;
    top: 10px;
    grid-column: 1;
    gap: 10px;
  }

  .settings-run-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-panel--wide {
    grid-column: 1 / -1;
  }

  .section-switch {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 8px;
    border: 1px solid rgba(255, 243, 212, 0.16);
    border-radius: 10px 18px 10px 10px;
    background: rgba(6, 7, 11, 0.94);
    box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.46);
  }

  .section-pill {
    min-height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    text-align: left;
    font-size: 12px;
  }

  .section-pill--active {
    box-shadow: inset 4px 0 0 var(--p5-gold);
  }

  .battle-settings-page > :deep(.card) {
    grid-column: 2;
    min-width: 0;
  }

  .battle-settings-page :deep(.settings-card--api .settings-stack),
  .battle-settings-page :deep(.settings-card--prompt .settings-stack) {
    grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.35fr) !important;
    align-items: start;
  }
}
</style>
