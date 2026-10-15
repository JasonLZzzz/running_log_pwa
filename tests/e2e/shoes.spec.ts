import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Backup, LegacyBackup } from '../../src/domain/types';
import {
  backup,
  goal,
  goalId,
  legacyBackup,
  record,
  shoe,
  shoeId,
  t1,
} from '../fixtures';
import { startOfflineServer } from './offline-server';

async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name, exact: true })
    .click();
}
async function importData(page: Page, data: unknown) {
  await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toBeVisible();
}
async function exported(page: Page): Promise<Backup> {
  await nav(page, '数据');
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('button', { name: '导出 JSON 备份', exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^跑后记录备份_\d{8}_\d{6}\.json$/,
  );
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Backup;
}
async function save(page: Page) {
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '记录已保存' })).toBeVisible();
}
async function base(page: Page) {
  for (const [field, option] of [
    ['计划结构', '连续稳定'],
    ['计划主要强度', '轻松'],
    ['活动情境', '常规训练'],
    ['完成情况', '按计划完成'],
  ])
    await page
      .getByRole('group', { name: new RegExp(`^${field}`) })
      .getByRole('button', { name: option, exact: true })
      .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
const picker = (page: Page) =>
  page.getByRole('group', { name: '本次用鞋', exact: true });
const manager = (page: Page) =>
  page.locator('.panel').filter({
    has: page.getByRole('heading', { name: '鞋库管理', exact: true }),
  });

async function seedLegacy(page: Page, data: LegacyBackup, hold = false) {
  await page.route('**/migration-seed', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Isolated migration fixture</title>',
    }),
  );
  await page.goto('/migration-seed');
  await page.evaluate(
    async ({ data, hold }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('running_log_db', 1);
        request.onupgradeneeded = () => {
          const records = request.result.createObjectStore('run_records', {
            keyPath: 'record_id',
          });
          records.createIndex('activity_time', 'activity_time');
          records.createIndex('updated_at', 'updated_at');
          request.result
            .createObjectStore('goals', { keyPath: 'goal_id' })
            .createIndex('target_date', 'target_date');
          request.result.createObjectStore('app_meta', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(
        ['run_records', 'goals', 'app_meta'],
        'readwrite',
      );
      for (const record of data.records)
        tx.objectStore('run_records').put(record);
      for (const goal of data.goals) tx.objectStore('goals').put(goal);
      tx.objectStore('app_meta').put({ key: 'schema_version', value: '1.0.0' });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      if (hold)
        (window as unknown as { fixtureDb: IDBDatabase }).fixtureDb = db;
      else db.close();
    },
    { data, hold },
  );
}

for (const width of [320, 390])
  test(`${width}px 鞋库：就地新增/同款多双/草稿保留/编辑退役恢复/历史补录清空`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await expect(
      page.getByText('鞋库暂无跑鞋，可先保存记录，之后补录。'),
    ).toBeVisible();
    await base(page);
    await page
      .getByLabel('备注', { exact: true })
      .fill('合成草稿：保留备注、RPE和训练时间');
    await page.getByLabel('训练时间', { exact: true }).fill('2026-10-01T06:05');
    await page.getByRole('button', { name: 'RPE 6', exact: true }).click();
    const model =
      '合成长型号ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const number of [1, 2]) {
      await picker(page)
        .getByRole('button', { name: '＋ 新增鞋子', exact: true })
        .click();
      const dialog = page.getByRole('dialog', { name: '新增鞋子' });
      await expect(
        dialog.getByRole('button', { name: '保存鞋子' }),
      ).toBeDisabled();
      await dialog.getByLabel('品牌', { exact: true }).fill('示例品牌');
      await dialog.getByLabel('鞋款型号', { exact: true }).fill(model);
      await expect(dialog.getByLabel('编号/昵称', { exact: true })).toHaveValue(
        `${number}号`,
      );
      if (number === 2) {
        await dialog.getByLabel('编号/昵称', { exact: true }).fill('1号');
        await dialog.getByRole('button', { name: '保存鞋子' }).click();
        await expect(dialog.getByRole('alert')).toContainText('已存在');
        await dialog.getByLabel('编号/昵称', { exact: true }).fill('2号');
      }
      await noOverflow(page);
      if (number === 1)
        await page.screenshot({
          path: `test-results/${test.info().project.name}-${width}-shoe-editor.png`,
        });
      await dialog
        .getByRole('button', { name: '保存鞋子' })
        .evaluate((button) => {
          (button as HTMLButtonElement).click();
          (button as HTMLButtonElement).click();
        });
      await expect(dialog).toHaveCount(0);
      await expect(
        picker(page).getByRole('button', {
          name: `示例品牌 ${model} · ${number}号`,
          exact: true,
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('textbox', { name: '备注', exact: true }),
      ).toHaveValue('合成草稿：保留备注、RPE和训练时间');
      await expect(page.getByLabel('训练时间', { exact: true })).toHaveValue(
        '2026-10-01T06:05',
      );
    }
    await picker(page)
      .getByRole('button', { name: `示例品牌 ${model} · 1号`, exact: true })
      .click();
    await noOverflow(page);
    await page.screenshot({
      path: `test-results/${test.info().project.name}-${width}-shoe-picker.png`,
    });
    await save(page);
    const before = await exported(page);
    expect(before.shoes).toHaveLength(2);
    expect(new Set(before.shoes.map((shoe) => shoe.shoe_id)).size).toBe(2);
    const used = before.records[0].shoe_id!;
    expect(before.records[0].rpe).toBe(6);
    const first = manager(page)
      .getByRole('listitem')
      .filter({ hasText: `示例品牌 ${model} · 1号` });
    await first.getByRole('button', { name: '编辑鞋子' }).click();
    const editor = page.getByRole('dialog', { name: '编辑鞋子' });
    await editor.getByLabel('编号/昵称', { exact: true }).fill('改名那双');
    await editor
      .getByRole('combobox', { name: '鞋子主要类型', exact: true })
      .selectOption('trail');
    await editor.getByRole('button', { name: '保存鞋子' }).click();
    const changed = manager(page)
      .getByRole('listitem')
      .filter({ hasText: '改名那双' });
    await changed.getByRole('button', { name: '退役', exact: true }).click();
    await expect(changed).toHaveCount(0);
    await manager(page)
      .getByRole('button', { name: '显示已退役', exact: true })
      .click();
    await expect(changed).toContainText('已退役');
    await changed
      .getByRole('button', { name: '恢复在用', exact: true })
      .click();
    await expect(changed).toContainText('在用');
    await changed.getByRole('button', { name: '退役', exact: true }).click();
    await expect(changed).toContainText('已退役');
    expect((await exported(page)).records[0]).toEqual(before.records[0]);
    await nav(page, '记录');
    await expect(
      picker(page).getByRole('button', { name: /改名那双/ }),
    ).toHaveCount(0);
    await nav(page, '历史');
    await page.locator('.record-card').click();
    await expect(page.getByRole('dialog')).toContainText('改名那双');
    await page.getByRole('button', { name: '编辑记录', exact: true }).click();
    await expect(
      picker(page).getByRole('button', { name: /改名那双/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await picker(page)
      .getByRole('button', { name: '未填写', exact: true })
      .click();
    await save(page);
    const cleared = (await exported(page)).records[0];
    expect(cleared.shoe_id).toBeNull();
    expect(cleared.record_id).toBe(before.records[0].record_id);
    expect(cleared.created_at).toBe(before.records[0].created_at);
    const {
      shoe_id: ignoredShoe,
      updated_at: ignoredTime,
      ...remaining
    } = cleared;
    void ignoredShoe;
    void ignoredTime;
    expect(remaining).toEqual(
      Object.fromEntries(
        Object.entries(before.records[0]).filter(
          ([key]) => !['shoe_id', 'updated_at'].includes(key),
        ),
      ),
    );
    await page.reload();
    await nav(page, '历史');
    await page.locator('.record-card').click();
    await page.getByRole('button', { name: '编辑记录', exact: true }).click();
    await expect(
      picker(page).getByRole('button', { name: /改名那双/ }),
    ).toHaveCount(0);
    await picker(page).getByRole('button', { name: '显示已退役' }).click();
    await picker(page)
      .getByRole('button', { name: /改名那双/ })
      .click();
    await save(page);
    expect((await exported(page)).records[0].shoe_id).toBe(used);
    await noOverflow(page);
  });

test('真实浏览器 IDB 1→2：原字段保留、鞋为空、历史补录可保存', async ({
  page,
}) => {
  const old = legacyBackup(
    [
      record({
        note: '合成旧记录\n换行',
        rpe: 8,
        linked_goal_status: 'linked',
        linked_goal_id: goalId,
      }),
    ],
    [goal({ archived: true })],
  );
  await seedLegacy(page, old);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '记录本次跑步' }),
  ).toBeVisible();
  const result = await exported(page);
  expect(result.records).toEqual(
    old.records.map((record) => ({
      ...record,
      schema_version: '2.0.0',
      shoe_id: null,
    })),
  );
  expect(result.goals).toEqual(
    old.goals.map((goal) => ({ ...goal, schema_version: '2.0.0' })),
  );
  expect(result.shoes).toEqual([]);
  await nav(page, '历史');
  await page.locator('.record-card').click();
  await expect(page.getByRole('dialog')).toContainText('本次用鞋');
  await page.getByRole('button', { name: '编辑记录' }).click();
  await picker(page).getByRole('button', { name: '＋ 新增鞋子' }).click();
  const dialog = page.getByRole('dialog', { name: '新增鞋子' });
  await dialog.getByLabel('品牌', { exact: true }).fill('合成旧鞋');
  await dialog.getByLabel('鞋款型号', { exact: true }).fill('历史用鞋');
  await dialog.getByRole('button', { name: '保存鞋子' }).click();
  await save(page);
  const updated = (await exported(page)).records[0];
  expect(updated.shoe_id).not.toBeNull();
  expect(updated.note).toBe(old.records[0].note);
  expect(updated.created_at).toBe(old.records[0].created_at);
  expect(updated.linked_goal_id).toBe(goalId);
});

test('真实浏览器迁移失败提示及原数据保留', async ({ page }) => {
  const old = legacyBackup([
    record(),
    record({ record_id: crypto.randomUUID(), rpe: 11 }),
  ]);
  await seedLegacy(page, old);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('升级事务已撤销');
  await expect(page.getByRole('alert')).toContainText('不要清空数据库');
  const preserved = await page.evaluate(async () => {
    const request = indexedDB.open('running_log_db', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const rows = db
      .transaction('run_records')
      .objectStore('run_records')
      .getAll();
    const records = await new Promise<unknown[]>((resolve) => {
      rows.onsuccess = () => resolve(rows.result);
    });
    const stores = [...db.objectStoreNames];
    db.close();
    return { records, stores };
  });
  expect(preserved.records).toEqual(
    [...old.records].sort((a, b) => a.record_id.localeCompare(b.record_id)),
  );
  expect(preserved.stores).not.toContain('shoes');
});

test('旧标签页阻塞升级有中文提示，关闭后可正常继续', async ({
  page,
  context,
}) => {
  const blocker = await context.newPage();
  await seedLegacy(blocker, legacyBackup(), true);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('另一个页面阻挡');
  await blocker.close();
  await expect(
    page.getByRole('heading', { name: '记录本次跑步' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('v1 导入预览说明保护既有用鞋，缺失 v2 关联拒绝，导出 v2 可恢复', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await nav(page, '数据');
  await importData(page, backup([record({ shoe_id: shoeId })], [], [shoe()]));
  const old = legacyBackup([
    record({ note: '旧备份较新合成备注', updated_at: t1 }),
  ]);
  await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({
    name: 'synthetic-v1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(
    page.getByText(
      '旧版备份没有用鞋信息；将保护本地已有用鞋关联。本次保护 1 条关联。',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('鞋库：新增 0 / 更新 0 / 跳过 0 / 错误 0'),
  ).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toContainText('保护已有用鞋关联 1 条');
  const data = await exported(page);
  expect(data.records[0].shoe_id).toBe(shoeId);
  expect(data.records[0].note).toBe(old.records[0].note);
  await page.getByLabel('导入 JSON', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify(backup([record({ shoe_id: crypto.randomUUID() })])),
    ),
  });
  await expect(page.getByRole('alert')).toContainText('用鞋');
  expect((await exported(page)).records).toEqual(data.records);
  const isolated = await context.browser()!.newContext();
  try {
    const fresh = await isolated.newPage();
    await fresh.goto(page.url());
    await nav(fresh, '数据');
    await importData(fresh, data);
    expect((await exported(fresh)).records).toEqual(data.records);
    expect((await exported(fresh)).shoes).toEqual(data.shoes);
  } finally {
    await isolated.close();
  }
});

test('源站关闭后鞋库离线新增/编辑/退役和关联导出可用', async ({ page }) => {
  const server = await startOfflineServer();
  try {
    await page.goto(server.url);
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
    await server.stop();
    expect((await page.reload())?.fromServiceWorker()).toBe(true);
    await picker(page).getByRole('button', { name: '＋ 新增鞋子' }).click();
    const dialog = page.getByRole('dialog', { name: '新增鞋子' });
    await dialog.getByLabel('品牌', { exact: true }).fill('离线合成品牌');
    await dialog.getByLabel('鞋款型号', { exact: true }).fill('离线合成型号');
    await dialog.getByRole('button', { name: '保存鞋子' }).click();
    await base(page);
    await save(page);
    const data = await exported(page);
    expect(data.shoes).toHaveLength(1);
    expect(data.records[0].shoe_id).toBe(data.shoes[0].shoe_id);
    await manager(page).getByRole('button', { name: '编辑鞋子' }).click();
    await page
      .getByRole('dialog')
      .getByLabel('鞋子备注')
      .fill('离线编辑合成备注');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '保存鞋子' })
      .click();
    await manager(page)
      .getByRole('button', { name: '退役', exact: true })
      .click();
    await expect(manager(page).getByRole('listitem')).toHaveCount(0);
    expect((await page.reload())?.fromServiceWorker()).toBe(true);
    const result = await exported(page);
    expect(result.shoes[0].status).toBe('retired');
    expect(result.shoes[0].note).toBe('离线编辑合成备注');
    expect(result.records).toEqual(data.records);
  } finally {
    await server.stop();
  }
});
