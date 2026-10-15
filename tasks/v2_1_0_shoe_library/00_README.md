# 跑后记录 PWA — V2.1.0 鞋库功能任务包

状态：**需求范围拟冻结，等待开发实施；非已实现功能。** 适用基线：`main` / `v2.0.1`（基线提交 `fedd22b`）。

## 目标

以「一双实际存在的鞋」为基本实体创建鞋库，并为每条跑步记录选择一双鞋。允许为既有记录补录；保障 iPhone 主屏幕 PWA 的现有 IndexedDB 数据、现有记录/目标、旧 JSON 备份继续可用。

本版**不做**里程统计、照片、Diagrun 接入、Garmin 数据同步、训练标签重新分类、云端同步。

## 文件索引及优先级

1. `01_FIELD_AND_DOMAIN_SPEC.md`：业务含义、字段、取值和边界（优先遵守）。
2. `02_STORAGE_AND_MIGRATION.md`：IndexedDB、数据结构与备份迁移约束（数据安全的核心合同）。
3. `03_UI_UX_SPEC.md`：鞋库、记录页、历史页与状态展示。
4. `04_ACCEPTANCE_TESTS.md`：自动测试与人工验收，不允许跳过高风险测试。
5. `05_CODEX_PROMPT.md`：Codex 启动与交付要求，可直接复制执行。

如实现方式与合同冲突，应先说明并等待人工确认，不要擅自修改冻结的数据语义。此前的 V2.0/V2.0.1 规格和原有训练标签继续有效，本包只增补「鞋库」相关内容。

## 已核对的现有实现（基于 main）

- `src/data/db.ts`：`openDB('running_log_db', 1)`；object stores 为 `run_records`、`goals`、`app_meta`。
- `src/domain/types.ts`：`APP_VERSION='2.0.1'`，`SCHEMA_VERSION='1.0.0'`，`Snapshot` 只有 `records/goals`。
- `src/data/schema.ts`：`validateRecord`、`validateGoal`、`validateBackup` 使用精确字段校验；旧备份 `backup_version='1.0.0'`。
- `src/data/merge.ts`：同 ID 按 `updated_at` 保留较新对象；预览后导入时在事务内重新计算。
- `src/pages/RecordPage.tsx`：已有目标关联与就地新增目标交互，可借鉴但不可等同于鞋子实体。
- `src/pages/DataPage.tsx`：目标管理、JSON/CSV 导入导出、预览；鞋库适合放在这里。
- `src/pages/HistoryPage.tsx`：详情查看与编辑入口；可用于历史补录。

**隐私提醒**：GitHub 仓库为公开仓库。任何真实训练备份、真实主观备注、真实个人记录都不得进入 Git 历史、测试 fixture、PR 截图或公开日志。统一用合成数据测试。正式升级前，用户先从 iPhone 主屏幕 PWA 导出 JSON 备份，保存到应用以外的安全位置。

## 推荐开发流程

基于 `main` 拉取最新代码并创建 `feature_shoe_library_v2_1`；仅在新分支开发、提交，暂不推送、合并、部署或打 tag。人工审查 diff 与测试后再决定部署。当前生产环境 `github-pages` 只允许 `main` 部署，不要为了预览而放开生产环境分支规则。

> 本文档中的 V2.1.0、数据库版本 2、数据结构/备份版本 2.0.0 是此任务包拟定的目标，不表示仓库现已升级。
