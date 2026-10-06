export type Option = { code: string; label: string; help: string };
export const fields = {
  planned_structure: {
    label: '计划结构',
    help: '原计划怎样组织主体训练？热身和放松不决定主体训练结构。',
    options: [
      {
        code: 'continuous_steady',
        label: '连续稳定',
        help: '主体训练连续完成，没有刻意安排明显的阶段性速度/强度变化。自然配速波动、路口、微小地形变化不改变分类。',
      },
      {
        code: 'continuous_progressive',
        label: '连续渐进',
        help: '全程或主体部分有明确的单向递增强度/速度意图，中间不设置恢复段。',
      },
      {
        code: 'segmented_continuous',
        label: '分段连续',
        help: '主体由少数几个性质不同的连续阶段组成，但不是周期性“工作—恢复—工作”。',
      },
      {
        code: 'repeat_interval',
        label: '重复间歇',
        help: '存在两个及以上有计划的工作段，并由恢复段隔开，整体存在重复结构。工作段不要求完全等长，但必须具有明显的重复“工作—恢复”逻辑。',
      },
      {
        code: 'fartlek',
        label: '自由变速',
        help: '有意快慢变化，但工作段/恢复段没有严格固定的次数、时间或距离模板。',
      },
      {
        code: 'run_walk',
        label: '跑走交替',
        help: '“跑”和“走”本身就是原计划结构的重要组成，而非偶尔走几步。越野遇到个别陡坡临时走路，不自动属于这一类。',
      },
      {
        code: 'unstructured',
        label: '无明确结构',
        help: '出发前没有预先规定主体训练怎样组织。',
      },
      {
        code: 'other',
        label: '其他',
        help: '无法合理落入以上类别时使用。必须补充文字。',
      },
    ],
  },
  planned_intensity: {
    label: '计划主要强度',
    help: '主体工作部分原计划达到什么训练强度？对于间歇训练，以工作段目标强度为准，不看整场平均心率。',
    options: [
      {
        code: 'recovery',
        label: '恢复',
        help: '有意保持极低负荷，主要目的偏恢复而非产生明显训练刺激。主观参考：约 RPE 1–2。',
      },
      {
        code: 'easy',
        label: '轻松',
        help: '舒适低强度有氧，可长时间维持，可以完整交谈。主观参考：约 RPE 2–4。',
      },
      {
        code: 'moderate',
        label: '中等稳态',
        help: '明显高于轻松跑，但仍受控、可持续。主观参考：约 RPE 4–6。',
      },
      {
        code: 'threshold',
        label: '阈值附近',
        help: '接近个人乳酸阈值附近，明显吃力但仍可控制。典型：连续节奏跑、阈值间歇。主观参考：约 RPE 6–8。',
      },
      {
        code: 'high',
        label: '高强度',
        help: '明显高于阈值，通常依赖有限长度的工作段完成。主观参考：约 RPE 8–10。',
      },
      {
        code: 'mixed',
        label: '混合强度',
        help: '原计划本身包含多个重要强度层级，且不存在明显单一主体强度。渐进跑不自动等于“混合强度”。',
      },
      {
        code: 'unspecified',
        label: '无明确强度目标',
        help: '出发前没有规定要跑多用力，根据感觉、环境或同伴自行调整。',
      },
    ],
  },
  activity_context: {
    label: '活动情境',
    help: '这次跑步总体发生在什么场景/性质下？',
    options: [
      {
        code: 'regular_training',
        label: '常规训练',
        help: '正常训练安排的一部分。绝大多数计划性训练默认属于此类。',
      },
      {
        code: 'race',
        label: '比赛',
        help: '正式赛事或具有正式竞赛/成绩意义的活动。',
      },
      {
        code: 'social',
        label: '社交/陪跑',
        help: '活动安排主要受到朋友、跑团、陪跑等社交因素影响。',
      },
      {
        code: 'commute',
        label: '通勤/代步',
        help: '跑步主要承担从一个地点移动到另一个地点的功能。',
      },
      {
        code: 'leisure',
        label: '休闲/随意',
        help: '主要为了放松、散心、探索，没有明显训练安排。',
      },
      { code: 'other', label: '其他', help: '低频其他场景。必须补充文字。' },
    ],
  },
  slope_focus: {
    label: '坡向专项',
    help: '是否刻意训练某种坡向能力？不是路线是否有坡。',
    options: [
      {
        code: 'none',
        label: '无坡向专项',
        help: '路线即使有坡，也没有把上坡/下坡能力作为专项训练目标。',
      },
      {
        code: 'uphill',
        label: '上坡专项',
        help: '明确针对爬坡能力、爬坡跑姿、爬坡输出等。',
      },
      {
        code: 'downhill',
        label: '下坡专项',
        help: '明确针对下坡速度、下坡技术、离心耐受或控制能力。',
      },
      {
        code: 'uphill_downhill',
        label: '上下坡综合专项',
        help: '有意识同时训练连续爬升与下降能力。',
      },
    ],
  },
  surface_focus: {
    label: '路面专项',
    help: '是否刻意针对某类特殊路面能力？不是实际跑过哪些路面。',
    options: [
      {
        code: 'none',
        label: '无路面专项',
        help: '对具体特殊路面没有专项训练意图。',
      },
      {
        code: 'technical_trail',
        label: '技术越野路面专项',
        help: '重点处理石块、树根、碎石、湿滑等需要频繁落脚判断的路面。',
      },
      {
        code: 'stairs',
        label: '台阶/楼梯专项',
        help: '以连续台阶、楼梯等作为主要技术/负荷对象。',
      },
      {
        code: 'soft_unstable',
        label: '松软/不稳定路面专项',
        help: '有意训练沙地、泥地、松软草地等稳定性较差的路面适应。',
      },
      {
        code: 'mixed_complex',
        label: '混合复杂路面专项',
        help: '训练本身强调多种复杂路面的连续适应。',
      },
      { code: 'other', label: '其他', help: '低频特殊路面。必须补充文字。' },
    ],
  },
  additional_purposes: {
    label: '附加目的',
    help: '除正常完成训练刺激外，这次还承担了哪些明确的验证、适应或练习任务？允许同时多选。',
    options: [
      {
        code: 'race_simulation',
        label: '比赛模拟',
        help: '有意识模拟赛事负荷、节奏、装备、流程或综合情境。关联某场比赛与比赛模拟不等价。',
      },
      {
        code: 'gear_test',
        label: '装备测试',
        help: '验证跑鞋、背心、登山杖、服装、心率设备等。',
      },
      {
        code: 'fuel_hydration_test',
        label: '补给/饮水测试',
        help: '验证能量胶、盐丸、水量、补给频率等。',
      },
      {
        code: 'pace_intensity_calibration',
        label: '配速/强度校准',
        help: '想验证某目标配速、心率或强度与体感/持续能力的对应关系。',
      },
      {
        code: 'capability_test',
        label: '能力测试',
        help: '主要为了测量当前能力水平，而不是完成常规训练量。',
      },
      {
        code: 'route_course_adaptation',
        label: '路线/赛道适应',
        help: '特意熟悉目标赛道，或训练与比赛高度类似的路线特征。',
      },
      {
        code: 'environment_adaptation',
        label: '环境适应',
        help: '刻意适应高温、湿热、高海拔、寒冷等环境。',
      },
      {
        code: 'form_skill_practice',
        label: '动作/技术练习',
        help: '主要关注动作或技能，例如登山杖技术、跑姿练习等。',
      },
      { code: 'other', label: '其他', help: '低频附加目的。必须补充文字。' },
    ],
  },
  completion_status: {
    label: '完成情况',
    help: '原计划实际完成到什么程度？',
    options: [
      {
        code: 'as_planned',
        label: '按计划完成',
        help: '核心结构、训练量和主要目标基本按计划完成。',
      },
      {
        code: 'adjusted_completed',
        label: '调整后完成',
        help: '中途调整距离、次数、配速等，但原定核心训练目标仍基本实现。',
      },
      {
        code: 'partial',
        label: '部分完成',
        help: '完成了计划的一部分，但核心目标没有完整实现。',
      },
      {
        code: 'aborted',
        label: '提前中止',
        help: '因疲劳、不适、天气、时间等明显提前结束，核心训练没有完成。',
      },
      {
        code: 'not_applicable',
        label: '无明确计划/不适用',
        help: '本次本来就没有明确训练计划，因此不适合评价“完成多少”。',
      },
    ],
  },
} as const;
export type FieldKey = keyof typeof fields;
export type Code<K extends FieldKey> =
  (typeof fields)[K]['options'][number]['code'];
export function label(key: FieldKey, code: string | null): string {
  return code === null
    ? '未填写'
    : (fields[key].options.find((o) => o.code === code)?.label ?? '无法识别');
}
export const goalStatusLabels = {
  unset: '未回答',
  none: '无具体关联目标',
  linked: '已关联目标',
} as const;
export const rpeHelp = [
  '几乎没有运动负担',
  '非常轻松',
  '轻松，可以长时间继续',
  '轻松偏中等，开始有明显运动感',
  '中等，需要一定注意力但很受控',
  '中等偏难，已经明显在训练',
  '较难，需要专注才能维持',
  '很难，只适合有限时间维持',
  '非常接近极限',
  '当次条件下的最大努力',
];
