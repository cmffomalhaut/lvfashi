export const Schema = z.object({
  星月市: z.object({
    当前时间: z.string(),
    当前日期: z.string(),
    当前季节: z.string(),
    当前天气: z.string(),
    当前地点: z.string(),
    场景氛围: z.string(),
  }).prefault({
    当前时间: '07:00',
    当前日期: '2025年4月1日',
    当前季节: '春季',
    当前天气: '晴',
    当前地点: '星月市·中央区',
    场景氛围: '平静的清晨，城市刚刚苏醒',
  }),

  世界状态: z.object({
    表社会安定度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
    里社会紧张度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
     秘境活跃度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
     诅咒浓度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
     时间带: z.enum(['清晨', '上午', '中午', '下午', '傍晚', '夜间', '深夜']),
     世界概述: z.string(),
   }).prefault({
     表社会安定度: 85,
     里社会紧张度: 30,
     秘境活跃度: 20,
     诅咒浓度: 40,
     时间带: '清晨',
    世界概述: '星月市，一座坐落在山海之间的现代化都市。表世界是普通的日本城市，而在暗处，魔法少女、阴阳师、忍者、魔法使等超自然势力暗中活跃。平日里各方维持着脆弱的平衡，但随着秘境活动的频繁，暗流正在涌动。',
  }),

  主角: z.object({
    名称: z.string(),
    简介: z.string(),
    阵营: z.string(),
    属性: z.object({
      武力: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      灵力: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      敏捷: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      精神: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      社交: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
    }).prefault({ 武力: 8, 灵力: 8, 敏捷: 8, 精神: 8, 社交: 8 }),
    hp: z.coerce.number(),
    hp上限: z.coerce.number().prefault(50),
    mp: z.coerce.number(),
    mp上限: z.coerce.number().prefault(30),
    状态: z.record(z.string().describe('状态名'), z.object({
      描述: z.string(),
      剩余回合: z.coerce.number(),
    })).prefault({}),
     诅咒侵蚀度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
     标签: z.record(z.string().describe('标签名'), z.string().describe('标签描述')).prefault({}),
     持有物: z.record(z.string().describe('物品名'), z.object({
       描述: z.string(),
       数量: z.coerce.number(),
     })).prefault({}),
   }).prefault({
     名称: '旅人',
     简介: '尚未设定背景',
     阵营: '自由中立',
     hp: 50,
     mp: 30,
     诅咒侵蚀度: 10,
   }),

  活跃角色: z.record(z.string().describe('角色名'), z.object({
    阵营: z.string(),
    简介: z.string(),
    属性: z.object({
      武力: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      灵力: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      敏捷: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      精神: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
      社交: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 20)),
    }).prefault({ 武力: 8, 灵力: 8, 敏捷: 8, 精神: 8, 社交: 8 }),
    hp: z.coerce.number(),
    hp上限: z.coerce.number().prefault(50),
    mp: z.coerce.number(),
    mp上限: z.coerce.number().prefault(30),
    状态: z.record(z.string().describe('状态名'), z.object({
      描述: z.string(),
      剩余回合: z.coerce.number(),
    })).prefault({}),
     立场: z.enum(['友善', '中立', '敌对', '未知']),
     诅咒侵蚀度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
     标签: z.record(z.string().describe('标签名'), z.string().describe('标签描述')).prefault({}),
  })).prefault({}),

  势力: z.record(z.string().describe('势力名'), z.object({
    影响力: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
    当前动向: z.string(),
    领袖: z.string(),
    据点: z.string(),
    简介: z.string(),
    关系: z.record(z.string().describe('目标势力'), z.enum(['同盟', '友好', '中立', '紧张', '敌对', '战争'])),
  })).prefault({}),

  事件: z.record(z.string().describe('事件名'), z.object({
    类型: z.enum(['主线', '支线', '日常', '突发', '秘境']),
    描述: z.string(),
    进度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
    参与者: z.string(),
    状态: z.enum(['进行中', '待触发', '已完成', '失败']),
  })).prefault({}),

  秘境: z.record(z.string().describe('秘境名'), z.object({
    描述: z.string(),
    入口: z.string(),
    稳定度: z.coerce.number().transform(v => _.clamp(Math.round(v), 0, 100)),
    危险度: z.coerce.number().transform(v => _.clamp(Math.round(v), 1, 10)),
    内在势力: z.string(),
    状态: z.enum(['开放', '不稳定', '即将关闭', '已关闭', '未知']),
  })).prefault({}),

  战斗: z.object({
    进行中: z.boolean(),
    回合: z.coerce.number(),
    行动顺序: z.array(z.string()),
    当前行动: z.string(),
    战场: z.string(),
    log: z.array(z.string()),
  }).prefault({
    进行中: false,
    回合: 0,
    行动顺序: [],
    当前行动: '',
    战场: '',
    log: [],
  }),
});
export type Schema = z.output<typeof Schema>;
