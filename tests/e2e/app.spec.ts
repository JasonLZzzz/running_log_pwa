import { chromium, webkit, expect, test, type Page } from '@playwright/test';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { backup, goal, goalId, record, t1, t2 } from '../fixtures';
import type { Backup, RunRecord } from '../../src/domain/types';
import { startOfflineServer } from './offline-server';
const group = (page: Page, title: string) =>
  page.getByRole('group', { name: new RegExp(`^${title}`) });
async function choose(page: Page, title: string, option: string) {
  await group(page, title)
    .getByRole('button', { name: option, exact: true })
    .click();
}
async function base(page: Page) {
  await choose(page, '计划结构', '连续稳定');
  await choose(page, '计划主要强度', '轻松');
  await choose(page, '活动情境', '常规训练');
  await choose(page, '完成情况', '按计划完成');
}
async function save(page: Page) {
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '记录已保存' })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name, exact: true })
    .click();
}
async function downloadText(page: Page, button: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const download = await downloading;
  return readFile((await download.path())!, 'utf8');
}
async function exported(page: Page): Promise<Backup> {
  await nav(page, '数据');
  return JSON.parse(await downloadText(page, '导出 JSON 备份')) as Backup;
}
async function upload(page: Page, data: unknown) {
  // setInputFiles bypasses normal UI actionability; wait for the preceding transaction to finish.
  await expect(page.getByLabel('导入 JSON', { exact: true })).toBeEnabled();
  await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
async function importData(page: Page, data: unknown) {
  await upload(page, data);
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '记录本次跑步' }),
  ).toBeVisible();
});

test('新增 → 双击防重 → 刷新/重启 → 历史 → 编辑 → JSON/CSV → 确认删除', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const time = page.getByLabel('训练时间', { exact: true });
  expect(await time.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  await expect(page.getByRole('button', { name: '保存记录' })).toBeDisabled();
  await time.fill('2026-10-05T18:42');
  await base(page);
  await page.getByText('专项与其他信息', { exact: true }).click();
  await choose(page, '坡向专项', '无坡向专项');
  await choose(page, '路面专项', '无路面专项');
  await choose(page, '附加目的', '无附加目的');
  await page.getByRole('button', { name: 'RPE 3', exact: true }).click();
  await page
    .getByLabel('备注', { exact: true })
    .fill('中文 English, "引号"\n第二行');
  await page
    .getByRole('button', { name: '保存记录', exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(page.getByRole('heading', { name: '记录已保存' })).toBeVisible();
  const first = (await exported(page)).records[0];
  expect(first.additional_purposes).toEqual([]);
  expect(first.slope_focus).toBe('none');
  expect(first.rpe).toBe(3);
  await page.reload();
  await nav(page, '历史');
  await expect(page.locator('.record-card')).toHaveCount(1);
  await page.locator('.record-card').click();
  await expect(page.getByRole('dialog')).toContainText('2026-10-05 18:42');
  await expect(page.getByRole('dialog')).toContainText('无附加目的');
  await page.getByRole('button', { name: '编辑记录', exact: true }).click();
  await page.getByRole('button', { name: 'RPE 4', exact: true }).click();
  await save(page);
  const second = (await exported(page)).records[0];
  expect(second.record_id).toBe(first.record_id);
  expect(second.created_at).toBe(first.created_at);
  expect(Date.parse(second.updated_at)).toBeGreaterThan(
    Date.parse(first.updated_at),
  );
  expect(second.rpe).toBe(4);
  const csv = await downloadText(page, '导出 CSV');
  expect(csv.startsWith('\uFEFF记录ID,训练时间')).toBe(true);
  expect(csv).toContain('无坡向专项');
  expect(csv).toContain('"中文 English, ""引号""\n第二行"');
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto('/');
  await nav(reopened, '历史');
  await expect(reopened.locator('.record-card')).toHaveCount(1);
  await reopened.locator('.record-card').click();
  await reopened.getByRole('button', { name: '删除记录', exact: true }).click();
  await expect(reopened.getByText('删除后只能通过备份恢复。')).toBeVisible();
  await reopened.getByRole('button', { name: '取消', exact: true }).click();
  await expect(reopened.getByRole('dialog')).toBeVisible();
  await reopened.getByRole('button', { name: '删除记录', exact: true }).click();
  await reopened.getByRole('button', { name: '确认删除' }).click();
  await expect(reopened.locator('.record-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('可选字段三态、多选、其他校验、帮助和详情', async ({ page }) => {
  await base(page);
  await choose(page, '计划结构', '其他');
  await expect(page.getByRole('button', { name: '保存记录' })).toBeDisabled();
  await page.getByLabel('计划结构：请补充具体类型').fill('自定义结构');
  await page.getByText('专项与其他信息', { exact: true }).click();
  await choose(page, '路面专项', '其他');
  await page.getByLabel('路面专项：请补充具体类型').fill('特殊路面');
  const purposes = group(page, '附加目的');
  for (const purpose of ['装备测试', '补给/饮水测试', '比赛模拟', '其他'])
    await purposes.getByRole('button', { name: purpose }).click();
  await expect(page.getByRole('button', { name: '保存记录' })).toBeDisabled();
  await page.getByLabel('附加目的：请补充具体类型').fill('综合练习');
  await page.getByRole('button', { name: '主观用力程度（RPE）帮助' }).click();
  await expect(page.getByRole('dialog')).toContainText('当次条件下的最大努力');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await save(page);
  const data = await exported(page);
  expect(data.records[0].slope_focus).toBeNull();
  expect(data.records[0].linked_goal_status).toBe('unset');
  expect(data.records[0].rpe).toBeNull();
  expect(data.records[0].additional_purposes).toEqual([
    'gear_test',
    'fuel_hydration_test',
    'race_simulation',
    'other',
  ]);
  const csv = await downloadText(page, '导出 CSV');
  expect(csv).toContain('装备测试；补给/饮水测试；比赛模拟；其他');
  await nav(page, '历史');
  await page.locator('.record-card').click();
  await expect(page.getByRole('dialog')).toContainText('未填写');
  await expect(page.getByRole('dialog')).toContainText('综合练习');
});

test('表单新增目标立即选中，编辑/归档保留引用，归档目标默认隐藏', async ({
  page,
}) => {
  await base(page);
  await page.getByText('专项与其他信息', { exact: true }).click();
  await page.getByRole('button', { name: '＋ 新增目标', exact: true }).click();
  await page.getByLabel('目标名称', { exact: true }).fill('黄山百公里40 km组');
  await page.getByLabel('目标日期（可不填）').fill('2026-10-31');
  await page.getByRole('button', { name: '保存目标' }).click();
  await expect(
    group(page, '关联目标').getByRole('button', {
      name: '黄山百公里40 km组｜2026-10-31',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await save(page);
  await nav(page, '数据');
  await page.getByRole('button', { name: '编辑目标', exact: true }).click();
  await page.getByLabel('目标名称', { exact: true }).fill('黄山目标');
  await page.getByRole('button', { name: '保存目标' }).click();
  await page.getByRole('button', { name: '归档目标', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消归档' })).toBeVisible();
  await nav(page, '历史');
  await page.locator('.record-card').click();
  await expect(page.getByRole('dialog')).toContainText('黄山目标｜2026-10-31');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await nav(page, '记录');
  await page.getByText('专项与其他信息', { exact: true }).click();
  await expect(
    group(page, '关联目标').getByRole('button', { name: /黄山目标/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '查看已归档' }).click();
  await expect(
    group(page, '关联目标').getByRole('button', { name: /黄山目标/ }),
  ).toBeVisible();
  await nav(page, '数据');
  await page.getByRole('button', { name: '取消归档' }).click();
  await expect(
    page.getByRole('button', { name: '归档目标', exact: true }),
  ).toBeVisible();
});

test('导入预览、重复/新旧合并与非法文件不写入', async ({ page }) => {
  await nav(page, '数据');
  const original = backup([record({ note: '原始' })], [goal()]);
  await upload(page, original);
  await expect(
    page.getByText('新增 2 / 更新 0 / 跳过 0 / 错误 0', { exact: true }),
  ).toBeVisible();
  expect((await exported(page)).records).toHaveLength(0);
  await page.getByRole('button', { name: '确认导入' }).click();
  await importData(page, original);
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toContainText('跳过 2');
  await importData(
    page,
    backup(
      [record({ updated_at: t2, note: '较新版本' })],
      [goal({ updated_at: t1 })],
    ),
  );
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toContainText('更新 2');
  await importData(page, original);
  expect((await exported(page)).records[0].note).toBe('较新版本');
  for (const invalid of [
    { ...original, backup_version: '9.0.0' },
    { ...original, records: [{ ...original.records[0], rpe: 11 }] },
  ]) {
    await upload(page, invalid);
    await expect(page.getByRole('alert')).toContainText('错误 1');
    await expect(page.getByRole('button', { name: '确认导入' })).toHaveCount(0);
    expect((await exported(page)).records[0].note).toBe('较新版本');
  }
  await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(page.getByRole('alert')).toContainText('文件不是有效的 JSON');
  expect((await exported(page)).records).toHaveLength(1);
});

const scenarios: [string, Partial<RunRecord>][] = [
  [
    '连续阈值',
    {
      planned_structure: 'continuous_steady',
      planned_intensity: 'threshold',
      rpe: 7,
    },
  ],
  [
    '阈值间歇',
    {
      planned_structure: 'repeat_interval',
      planned_intensity: 'threshold',
      note: '4×8 分钟',
    },
  ],
  [
    '反复上下山',
    {
      planned_structure: 'repeat_interval',
      planned_intensity: 'moderate',
      slope_focus: 'uphill_downhill',
      surface_focus: 'none',
      linked_goal_status: 'linked',
      linked_goal_id: goalId,
    },
  ],
  [
    '越野自由跑',
    {
      planned_structure: 'unstructured',
      planned_intensity: 'unspecified',
      activity_context: 'leisure',
      slope_focus: null,
      surface_focus: 'technical_trail',
    },
  ],
  [
    '比赛',
    { activity_context: 'race', completion_status: 'adjusted_completed' },
  ],
  [
    '陪跑',
    { activity_context: 'social', planned_structure: 'segmented_continuous' },
  ],
  ['跑走策略', { planned_structure: 'run_walk', planned_intensity: 'easy' }],
];
for (const [name, patch] of scenarios)
  test(`真实场景：${name} 编辑保存后各维度保持独立`, async ({ page }) => {
    const original = record(patch);
    await nav(page, '数据');
    await importData(page, backup([original], [goal()]));
    await nav(page, '历史');
    await page.locator('.record-card').click();
    await page.getByRole('button', { name: '编辑记录', exact: true }).click();
    await save(page);
    const restored = (await exported(page)).records[0];
    for (const key of [
      'planned_structure',
      'planned_intensity',
      'activity_context',
      'slope_focus',
      'surface_focus',
      'linked_goal_status',
      'linked_goal_id',
      'rpe',
      'note',
    ] as const)
      expect(restored[key]).toEqual(original[key]);
  });

test('未回答 vs 明确无，JSON和历史详情区分', async ({ page }) => {
  await page.getByLabel('训练时间', { exact: true }).fill('2026-10-05T18:42');
  await base(page);
  await save(page);
  await page.getByRole('button', { name: '记录下一次跑步' }).click();
  await base(page);
  await page.getByLabel('训练时间', { exact: true }).fill('2026-10-06T18:42');
  await page.getByText('专项与其他信息', { exact: true }).click();
  await choose(page, '坡向专项', '无坡向专项');
  await choose(page, '关联目标', '无具体关联目标');
  await save(page);
  const data = await exported(page);
  expect(data.records.map((r) => r.slope_focus)).toContain(null);
  expect(data.records.map((r) => r.slope_focus)).toContain('none');
  expect(data.records.map((r) => r.linked_goal_status)).toContain('none');
  expect(data.records.map((r) => r.linked_goal_status)).toContain('unset');
  await nav(page, '历史');
  await page.locator('.record-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('无坡向专项');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.record-card').last().click();
  await expect(page.getByRole('dialog')).toContainText('未填写');
});

test('320px/横屏无水平滚动，点击尺寸，1000条分页打开', async ({ page }) => {
  test.setTimeout(60_000); // Bulk import can be slow on Windows WebKit; measure history opening separately.
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
  await page.getByText('专项与其他信息', { exact: true }).click();
  await noOverflow(page);
  expect(
    await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons.every((b) => b.getBoundingClientRect().height >= 44),
      ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-record-320.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 740, height: 320 });
  await noOverflow(page);
  await nav(page, '数据');
  const records = Array.from({ length: 1000 }, (_, i) =>
    record({
      record_id: crypto.randomUUID(),
      activity_time: new Date(Date.parse(t1) + i * 60000).toISOString(),
    }),
  );
  const importStart = Date.now();
  await upload(page, backup(records));
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toBeVisible({ timeout: 45_000 });
  console.log(
    `${test.info().project.name} 1000 条导入：${Date.now() - importStart}ms`,
  );
  const start = Date.now();
  await nav(page, '历史');
  await expect(page.locator('.record-card')).toHaveCount(50);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(3000);
  console.log(`${test.info().project.name} 1000 条历史打开：${elapsed}ms`);
  await page.getByRole('button', { name: '显示更多记录' }).click();
  await expect(page.locator('.record-card')).toHaveCount(100);
  await noOverflow(page);
});

async function waitForOfflineShell(page: Page) {
  await expect(
    page.getByRole('status').filter({ hasText: '离线可用' }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => resolve(),
          { once: true },
        ),
      );
  });
}

test('生产 PWA：源站停止后重开、新增/编辑/删除/导出', async ({
  page,
  context,
}) => {
  const server = await startOfflineServer();
  try {
    await page.goto(server.url);
    await waitForOfflineShell(page);
    const manifest = await page.evaluate(
      async () =>
        (await fetch('manifest.webmanifest')).json() as Promise<{
          display: string;
          icons: unknown[];
        }>,
    );
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toHaveLength(3);
    await server.stop();
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(
      page.getByRole('heading', { name: '记录本次跑步' }),
    ).toBeVisible();
    await base(page);
    await save(page);
    const first = (await exported(page)).records[0];
    expect(first.record_id).toBeTruthy();
    await nav(page, '历史');
    await page.locator('.record-card').click();
    await page.getByRole('button', { name: '编辑记录', exact: true }).click();
    await page.getByRole('button', { name: 'RPE 6', exact: true }).click();
    await save(page);
    expect((await exported(page)).records[0].rpe).toBe(6);
    expect(await downloadText(page, '导出 CSV')).toContain('连续稳定');
    await nav(page, '历史');
    await page.locator('.record-card').click();
    await page.getByRole('button', { name: '删除记录', exact: true }).click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(page.locator('.record-card')).toHaveCount(0);
    const reopened = await context.newPage();
    const reopenedResponse = await reopened.goto(server.url);
    expect(reopenedResponse?.fromServiceWorker()).toBe(true);
    await expect(
      reopened.getByRole('heading', { name: '记录本次跑步' }),
    ).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('静态站子目录部署：源站停止后 manifest 和 service worker 离线可用', async ({
  page,
}) => {
  const server = await startOfflineServer('/running_log_pwa/');
  try {
    await page.goto(server.url);
    await waitForOfflineShell(page);
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistration())?.scope,
      ),
    ).toBe(server.url);
    await server.stop();
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await base(page);
    await save(page);
    expect((await exported(page)).records).toHaveLength(1);
  } finally {
    await server.stop();
  }
});

test('浏览器进程完全关闭再启动，源站停止后记录和离线缓存仍保留', async ({
  browserName,
}) => {
  test.setTimeout(60_000);
  const browserType = browserName === 'webkit' ? webkit : chromium;
  const server = await startOfflineServer();
  const tempRoot = resolve(tmpdir());
  const profile = await mkdtemp(join(tempRoot, 'running-log-e2e-'));
  const taskFolder = relative(tempRoot, resolve(profile));
  if (!taskFolder.startsWith('running-log-e2e-') || taskFolder.includes(sep))
    throw new Error('Refusing to remove an unexpected test profile path');
  const options = {
    headless: true,
    baseURL: server.url,
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 390, height: 844 },
    channel:
      browserName === 'chromium'
        ? process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
        : undefined,
  };
  let id = '';
  try {
    const first = await browserType.launchPersistentContext(profile, options);
    try {
      const page = await first.newPage();
      await page.goto(server.url);
      await waitForOfflineShell(page);
      await base(page);
      await save(page);
      id = (await exported(page)).records[0].record_id;
    } finally {
      await first.close();
    }
    await server.stop();
    const reopened = await browserType.launchPersistentContext(
      profile,
      options,
    );
    try {
      const page = await reopened.newPage();
      const response = await page.goto(server.url);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(
        page.getByRole('heading', { name: '记录本次跑步' }),
      ).toBeVisible();
      expect((await exported(page)).records[0].record_id).toBe(id);
    } finally {
      await reopened.close();
    }
  } finally {
    await server.stop();
    await rm(profile, { recursive: true, force: true });
  }
});
