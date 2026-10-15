# 02 — 存储、迁移、备份与导入的强制合同

本文件优先级高。一次手机真实数据丢失的成本远高于小程序功能更新的便利性。

## 一、目标版本与数据层

- APP_VERSION：`2.0.1` → **`2.1.0`**；`package.json` 同步。
- 数据结构 SCHEMA_VERSION：`1.0.0` → **`2.0.0`**（现有代码共用此版本号，Record/Goal/Shoe 应采取一致且明确的迁移策略）。
- IndexedDB `running_log_db` 的 IDB 整数版本 **1 → 2**。
- `run_records`、`goals`、`app_meta` 原 store 均保留；新增 `shoes` store，主键为 `shoe_id`。
- `Snapshot` 从 `records, goals` 扩为 `records, goals, shoes`；读写与 UI 刷新必须完整支持。
- `RunRecord` 新增 `shoe_id: string | null`，其他既有业务字段和语义均不变。
- `Goal` 业务字段不变；如果因当前共用 SCHEMA_VERSION 要求把目标的 `schema_version` 升到 2.0.0，必须保留所有 ID、名称、目标日期、归档状态及原时间戳，且明示该变化是技术性版本更新。
- `Shoe` 完整类型见 `01_FIELD_AND_DOMAIN_SPEC.md`。

## 二、就地升级：不得导致用户历史记录丢失

升级发生于同一 origin 的现有 IndexedDB **versionchange 原子事务**中，不允许通过清空 DB、删除再建、导出后强制用户手工重导来实现。

迁移必须覆盖：

1. **空数据库安装**：`oldVersion=0 -> version=2` 时完整创建全部 4 个 stores；不要保留现有代码 `newVersion === 1` 这种会阻断跨版本初装的条件。
2. **旧版存量数据升级**：`oldVersion=1 -> 2` 时添加 `shoes`，将全部原记录补上 `shoe_id=null`；升级原记录/目标的 `schema_version` 到 2.0.0；更新 `app_meta.schema_version`。用 cursor 或其他符合 IDB versionchange 事务生命周期的方式完成。
3. **保留历史属性**：旧 `record_id`、`goal_id`、`created_at`、`updated_at`、`activity_time`、训练标签、目标关系、RPE、备注一律不变。迁移不能伪装成用户编辑、不能批量刷新 `updated_at`。
4. **迁移失败**：事务整体 abort，不能留下半迁移或部分清空状态；向用户提示数据库升级失败，不做破坏性自动重试/重建。
5. **多个页面阻塞迁移**：保留现有 blocked / blocking 处理，提示关闭其他窗口后重开；防止旧页面与新 schema 并发写导致异常。
6. **升级后未关联鞋的记录**：均为 `shoe_id=null`，后续逐条编辑可补录；不从备注里自动判断鞋子。

## 三、保存/验证中的引用完整性

- 记录的 `shoe_id` 为 `null` 或存在于 `shoes` 的有效 UUID v4；非 null 必须能从当前鞋库解析到实体。可引用 retired 鞋。
- `saveRecord` 原本读取 goals；现应在单次事务中一致性检查 goals 与 shoes，确保不产生悬空引用。
- `saveShoe` 创建/编辑必须验证必填字段、允许的类型/状态、昵称冲突及时间戳规则；ID 永远不变。
- 禁止无意中擦除其他记录字段或目标关联；鞋库名称修改不需要修改每条历史记录。
- `previewImport`、`importBackup`、`planMerge` 必须纳入 shoes；导入时在实际事务内重新计算和校验预览，避免预览后数据变更。
- 在导入冲突中，**不要按 `brand+model+nickname` 自动合并不同 `shoe_id`**。两个设备若分别建了同名鞋，它们可能是不同实体。显示预览并允许保留二者。

## 四、JSON 备份合同：向后兼容（旧备份 → 新程序）

### 旧版 v1（必须接受）

旧版备份格式：

```json
{
  "format": "running-log-backup",
  "backup_version": "1.0.0",
  "exported_at": "2026-10-01T10:00:00.000+08:00",
  "records": ["...旧版记录结构..."],
  "goals": ["...旧版目标结构..."]
}
```

旧版每条 record/goal 的 `schema_version` 为 `1.0.0`，record 没有 `shoe_id`。必须先按 **v1 字段合同**验证，再显式转换为内部 v2 规范格式：记录加 `shoe_id=null`，原 ID/全部字段/created_at/updated_at 均不改变，目标同样技术升级版本号。不要放宽新版验证器为接受“任意未知字段”。

### 新版 v2（新程序输出/接受）

```json
{
  "format": "running-log-backup",
  "backup_version": "2.0.0",
  "exported_at": "2026-10-15T15:33:25.262+08:00",
  "records": [{"record_id":"...", "shoe_id":"...或null", "schema_version":"2.0.0"}],
  "goals": [{"goal_id":"...", "schema_version":"2.0.0"}],
  "shoes": [{"shoe_id":"...", "brand":"ASICS", "model":"Novablast 6", "nickname":"1号", "shoe_type":"daily", "status":"active", "note":null, "schema_version":"2.0.0", "created_at":"...", "updated_at":"..."}]
}
```

上述仅展示字段位置，**非可直接导入的完整合法样例**。实际文件必须保留完整 records/goals 字段及有效 UUID、ISO 时间。

- `backup_version` 新增到 2.0.0；`format` 不变；新增顶层 `shoes` 数组，包含在用和已退役全部鞋实体。
- `records` 的 `shoe_id` 只能引用同份备份 `shoes` 中存在的鞋，或为 null。即使鞋子已退役也需带上。
- 新程序必须继续接受 V2.0/V2.0.1 导出的 `backup_version=1.0.0`；**旧 V2.0.1 程序不保证能读取新 v2 备份**，不要宣称双向兼容。
- 新导出仍按设备本地时间给文件名加 `YYYYMMDD_HHmmss` 时间戳，JSON 内 `exported_at` 与文件名来自同一个 Date 时刻；不变更这项已验收行为。

### 防止旧备份覆盖已补录的用鞋

旧 v1 备份根本没有鞋关联字段，因此它的“缺失”不能被解释为“用户主动清除了用鞋”。如果本地 v2 记录已有非空 `shoe_id`，再次导入同 ID 的 v1 记录时，**不得让旧备份将其清空**（即使该 v1 记录的 `updated_at` 恰好更新）；其余旧字段仍可按照现有更新时间合并策略处理，但保护现存 `shoe_id`。应在导入预览和测试中明确体现。

新版 v2 备份的 `shoe_id=null` 才表示确实由新版数据表示“未填写”，同 ID 更新冲突沿用已有 `updated_at` 规则。导入前保证引用鞋实体存在，不存在则全部拒绝/提示，不能 silently null。

## 五、CSV 输出合同

- 保持原 CSV 的既有列名、顺序、BOM 和转义规则不变，仅**在末尾追加**：`用鞋ID`、`用鞋品牌`、`用鞋型号`、`用鞋昵称`、`用鞋类型`。
- 未填写 `shoe_id=null` 时新增列均留空；有关联时从鞋库读取，品牌/型号/昵称提供便于后续分析的独立列。
- `shoe_type=null` 输出空值，有值输出中文标签；不把“退役”误当成跑步当时的状态。鞋子状态仍在 JSON 鞋库中存储，本版不强制追加 CSV 动态状态列。
- 每条跑步记录仍仅 1 行。不增加里程列、不改变历史字段语义。

## 六、恢复能力与降级风险（不可省略）

- 首次手机升级前，用户必须手工导出一份 v1 JSON 备份并**保存到 PWA/设备网站存储之外**（如文件 App 中独立目录、其他可信备份位置）。不要把备份提交公开 GitHub。
- 升级后立即导出 v2 JSON，并验证 v1 导入、新版 v2 导入、同 ID 合并计数与引用完整性。测试用合成记录；生产手机上避免破坏性覆盖操作。
- **数据库版本 2 不是可无代价回滚到 V2.0.1 的**：旧版使用 `openDB(...,1)`，重新部署旧代码后会碰到 `VersionError`，无法直接打开已升级至版本 2 的库。旧 tag 是代码锚点，**不是完整的数据回滚方案**。如必须回退，应开发能打开新数据库的兼容补丁，或明确告知用户需依靠之前导出的备份进行受控恢复；绝不直接删除用户数据库。
- 非同源数据不会自动同步：iPhone 主屏幕 PWA / Safari / PC 浏览器各自有本地数据库；本版仅使用 JSON 手工迁移与备份，不引入账号或服务器同步。
