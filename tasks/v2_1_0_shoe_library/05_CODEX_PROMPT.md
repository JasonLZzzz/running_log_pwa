# 05 — 发给 Codex 的实施提示词

请在本地 `E:\Garmin活动\running_log_pwa` 仓库中，基于已验收的 `main / v2.0.1` 开展 **V2.1.0 鞋库功能**。本轮按照本目录的 `00_README.md`、`01_FIELD_AND_DOMAIN_SPEC.md`、`02_STORAGE_AND_MIGRATION.md`、`03_UI_UX_SPEC.md`、`04_ACCEPTANCE_TESTS.md` 工作。若任务包当前在仓库外，请先将这五份规范复制到仓库的适当 `tasks/` 子目录（仅文档），不要重建仓库或引入嵌套 Git。

## 启动约束

1. 先确认工作目录、分支、工作树状态、`v2.0.1` 基线；不要假设工作树干净，不要覆盖用户未提交改动。
2. 若用户尚未创建，请在最新 `main` 的干净状态下创建 `feature_shoe_library_v2_1`，不得直接在 `main` 修改。遵循仓库已有脚本、测试和界面风格。
3. 严格限制为鞋库 + 跑步记录用鞋关联 + 历史补录 + 数据兼容，不做里程/照片/Diagrun/Garmin/训练标签改造。
4. 禁止将用户真实 JSON 备份及真实训练备注写入任何 Git 跟踪路径；测试 fixture 全部使用虚构信息。

## 建议实施顺序（可做等效实现，必须说明差异）

1. 数据模型与校验：Shoe 类型/字段、RunRecord.shoe_id、Schema/Backup/Snapshot 版本，严格 v1/v2 验证和转换。
2. 原子 IndexedDB v1→2 迁移：新 shoes store、旧记录补 null、目标技术版本升级、保留既有 ID/时间戳/业务值，处理多 tab 阻塞和异常事务。
3. Repository：鞋库 CRUD（不硬删）、snapshot、saveRecord 引用校验、导入/预览/merge 加 shoes；旧 v1 备份不可覆盖本地既有用鞋引用。
4. 导出：新版 JSON `shoes`，CSV 原列保持并在末尾加鞋字段，保留 V2.0.1 时间戳功能。
5. UI：数据页鞋库管理、记录页前置用鞋选择及就地新增、历史详情/编辑与退役补录；保留原有导航和其他 UX。
6. 测试：完整执行 `04_ACCEPTANCE_TESTS.md` A–D，记录通过项/缺口；模拟老库升级和旧备份导入是强制项。
7. 更新 README/实施说明及验收说明，特别解释本地存储、备份、旧备份导入、数据迁移不可直接退回旧 DB 版本。

## 交付要求

- 本地完成代码与自动测试后仅提交到 `feature_shoe_library_v2_1`，不要 push、不要合并 `main`、不要发布 Pages、不要变更环境规则、不要打 tag；等待 GPT/用户审查。
- 列出新增与修改文件、重要数据模型变更、迁移流程、旧备份安全策略、测试数目及失败/跳过原因、commit SHA、`git status`。
- 实际无法验证的 iPhone 行为标记为待真机复验，不能预先声称通过。
- 如发现任务文档无法满足数据安全或与现有代码矛盾，请先报告方案与影响，不可用删除旧数据的捷径完成任务。

## 人工启动前提醒

开始开发前用户先在 iPhone 主屏幕 PWA 导出一份最新版 V2.0.1 JSON，保存在独立位置。这份备份**不要发给公开仓库，也不要作为测试 fixture**。
