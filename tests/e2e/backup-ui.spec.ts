import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Backup } from '../../src/domain/types';
import { backup, goal, record, shoe, shoeId, t1 } from '../fixtures';

async function dataPage(page: Page) {
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: '数据', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '数据备份', exact: true }),
  ).toBeVisible();
}
async function chooseFile(page: Page, data: Backup) {
  const choosing = page.waitForEvent('filechooser');
  await page.getByLabel('导入 JSON', { exact: true }).click();
  const chooser = await choosing;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({
    name: 'synthetic-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(
    page.getByRole('heading', { name: '导入预览', exact: true }),
  ).toBeVisible();
}
async function download(page: Page, button: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await downloading;
  return {
    name: file.suggestedFilename(),
    text: await readFile((await file.path())!, 'utf8'),
  };
}
async function snapshot(page: Page) {
  const file = await download(page, '导出 JSON 备份');
  expect(file.name).toMatch(/^跑后记录备份_\d{8}_\d{6}\.json$/);
  const data = JSON.parse(file.text) as Backup;
  return { records: data.records, goals: data.goals, shoes: data.shoes };
}

for (const width of [320, 390, 1024]) {
  test.describe(`${width}px 数据备份分组`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 520,
      hasTouch: width < 520,
    });
    test('分组、用途、图标及原无障碍名称明确，控件无横向溢出', async ({
      page,
    }) => {
      await dataPage(page);
      const exports = page.getByRole('region', {
        name: '导出数据',
        exact: true,
      });
      const imports = page.getByRole('region', {
        name: '导入数据',
        exact: true,
      });
      await expect(
        exports.getByRole('heading', { name: '导出数据', level: 3 }),
      ).toBeVisible();
      await expect(
        imports.getByRole('heading', { name: '导入数据', level: 3 }),
      ).toBeVisible();
      for (const [name, description] of [
        ['导出 JSON 备份', '包含完整记录、目标和鞋库，用于备份与恢复。'],
        ['导出 CSV', '用于表格查看、整理及后续分析。'],
      ]) {
        const button = exports.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        await expect(button).toHaveAccessibleDescription(description);
        await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1);
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const input = imports.getByLabel('导入 JSON', { exact: true });
      await expect(input).toHaveAttribute('type', 'file');
      await expect(input).toHaveAttribute('accept', '.json,application/json');
      await expect(input).toBeEnabled();
      await expect(input).toHaveAccessibleDescription(
        '从 JSON 备份导入数据，操作前先预览合并结果。',
      );
      await expect(imports.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      expect(
        await imports.evaluate(
          (element) => element.getBoundingClientRect().top,
        ),
      ).toBeGreaterThan(
        (await exports.boundingBox())!.y +
          (await exports.boundingBox())!.height,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const panel = page
        .locator('.panel')
        .filter({
          has: page.getByRole('heading', { name: '数据备份', exact: true }),
        });
      await panel.screenshot({
        path: `test-results/${test.info().project.name}-backup-${width}.png`,
      });
    });
  });
}

test('文件选择器保留：先预览、确认后导入，取消不改数据，JSON/CSV 正常导出', async ({
  page,
}) => {
  await dataPage(page);
  const baseline = backup(
    [record({ shoe_id: shoeId, note: '合成既有记录' })],
    [goal()],
    [shoe()],
  );
  await chooseFile(page, baseline);
  expect(await snapshot(page)).toEqual({ records: [], goals: [], shoes: [] });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '导入完成' }),
  ).toBeVisible();
  const original = await snapshot(page);
  expect(original).toEqual({
    records: baseline.records,
    goals: baseline.goals,
    shoes: baseline.shoes,
  });
  const pending = backup(
    [
      record({ shoe_id: shoeId, note: '待取消的合成更新', updated_at: t1 }),
      record({ record_id: crypto.randomUUID(), note: '待取消的新增' }),
    ],
    baseline.goals,
    baseline.shoes,
  );
  await chooseFile(page, pending);
  expect(await snapshot(page)).toEqual(original);
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '导入预览', exact: true }),
  ).toHaveCount(0);
  expect(await snapshot(page)).toEqual(original);
  const csv = await download(page, '导出 CSV');
  expect(csv.name).toMatch(/^跑后记录_\d{8}_\d{6}\.csv$/);
  expect(csv.text.startsWith('\uFEFF记录ID,训练时间')).toBe(true);
  expect(csv.text).toContain('合成既有记录');
  expect(csv.text).not.toContain('待取消');
});
