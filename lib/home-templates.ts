export interface SceneTemplate {
  label: string;
  queries: readonly string[];
}

/** 按用餐类型准备多句需求，点击同一按钮会轮换，避免每次都是同一句 */
export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    label: "周末约会",
    queries: [
      "周末约会，要安静，人均150到200",
      "两个人约会，想吃日料，氛围浪漫一点",
      "周末晚上约会，不要太吵，想吃西餐",
      "纪念日双人餐，人均200左右，最好能靠窗",
    ],
  },
  {
    label: "同事聚餐",
    queries: [
      "同事聚餐，人均100左右，不要太辣",
      "下班和同事吃饭，要热闹能拼桌，预算80到120",
      "部门聚餐十来个人，想吃火锅，要有大桌",
      "同事聚餐，上菜快一点，人均120以内",
    ],
  },
  {
    label: "家庭聚餐",
    queries: [
      "带4岁小孩，预算200，想吃粤菜，要有包间",
      "周末带父母吃饭，要安静有包间",
      "家庭聚餐六个人，想吃本帮菜，有包间能停车",
      "带老人小孩，不要太辣，环境安静一点",
    ],
  },
  {
    label: "一个人随便吃",
    queries: [
      "一个人随便吃，家常菜就行",
      "独自用餐，不想等位，清淡一点",
      "一个人想吃简餐，人均50左右",
      "一个人吃饭，方便快点，不要太贵",
    ],
  },
];

export function sceneQueriesInclude(template: SceneTemplate, query: string): boolean {
  return template.queries.includes(query);
}

/** 若当前句已在该类型里，轮到下一句；否则从第一句开始 */
export function nextSceneQuery(template: SceneTemplate, current: string): string {
  if (template.queries.length === 0) {
    throw new Error(`场景「${template.label}」没有需求句`);
  }
  const index = template.queries.indexOf(current);
  const nextIndex = index === -1 ? 0 : (index + 1) % template.queries.length;
  const query = template.queries[nextIndex];
  if (!query) {
    throw new Error(`场景「${template.label}」缺少第 ${nextIndex} 句`);
  }
  return query;
}
