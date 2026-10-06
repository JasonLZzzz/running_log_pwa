# 02｜数据结构规范

## 1. 设计原则

- IndexedDB 是运行时主数据库。
- JSON 是**无损备份/迁移格式**。
- CSV 是**分析交换格式**，面向 Python/Codex/Excel。
- UI 显示中文；内部使用稳定英文 code，防止将来文案微调破坏历史数据。
- `schema_version` 必须存在。
- 所有时间使用带时区的 ISO 8601 字符串。

---

## 2. RunRecord 建议结构

```ts
type RunRecord = {
  record_id: string;              // UUID v4
  schema_version: "1.0.0";

  activity_time: string;          // ISO 8601 with timezone
  created_at: string;
  updated_at: string;

  planned_structure:
    | "continuous_steady"
    | "continuous_progressive"
    | "segmented_continuous"
    | "repeat_interval"
    | "fartlek"
    | "run_walk"
    | "unstructured"
    | "other";
  planned_structure_other: string | null;

  planned_intensity:
    | "recovery"
    | "easy"
    | "moderate"
    | "threshold"
    | "high"
    | "mixed"
    | "unspecified";

  activity_context:
    | "regular_training"
    | "race"
    | "social"
    | "commute"
    | "leisure"
    | "other";
  activity_context_other: string | null;

  slope_focus:
    | null
    | "none"
    | "uphill"
    | "downhill"
    | "uphill_downhill";

  surface_focus:
    | null
    | "none"
    | "technical_trail"
    | "stairs"
    | "soft_unstable"
    | "mixed_complex"
    | "other";
  surface_focus_other: string | null;

  // null=未回答；[]=明确无附加目的；非空=已选择
  additional_purposes: null | Array<
    | "race_simulation"
    | "gear_test"
    | "fuel_hydration_test"
    | "pace_intensity_calibration"
    | "capability_test"
    | "route_course_adaptation"
    | "environment_adaptation"
    | "form_skill_practice"
    | "other"
  >;
  additional_purpose_other: string | null;

  linked_goal_status: "unset" | "none" | "linked";
  linked_goal_id: string | null;

  completion_status:
    | "as_planned"
    | "adjusted_completed"
    | "partial"
    | "aborted"
    | "not_applicable";

  rpe: number | null;             // integer 1..10
  note: string | null;
};
```

### 校验规则

- `planned_structure === "other"` 时 `planned_structure_other` 非空。
- `activity_context === "other"` 时 `activity_context_other` 非空。
- `surface_focus === "other"` 时 `surface_focus_other` 非空。
- `additional_purposes` 包含 `other` 时 `additional_purpose_other` 非空。
- `linked_goal_status === "linked"` 时 `linked_goal_id` 必须指向存在的 goal。
- `linked_goal_status !== "linked"` 时 `linked_goal_id` 应为 null。
- `rpe` 若非 null，必须为 1–10 整数。

---

## 3. Goal 建议结构

```ts
type Goal = {
  goal_id: string;                // UUID v4
  schema_version: "1.0.0";
  name: string;
  target_date: string | null;     // YYYY-MM-DD
  archived: boolean;
  created_at: string;
  updated_at: string;
};
```

显示文本可为：

```text
{name}｜{target_date}
```

无日期时只显示 name。

---

## 4. IndexedDB

建议数据库：`running_log_db`

建议 object stores：

- `run_records`，keyPath=`record_id`
- `goals`，keyPath=`goal_id`
- `app_meta`，用于 schema / migration / app settings

建议索引：

- run_records: `activity_time`, `updated_at`
- goals: `archived`, `target_date`

历史记录读取按 `activity_time` 倒序。

---

## 5. JSON 备份格式

不要只导出数组，应带 envelope：

```json
{
  "format": "running-log-backup",
  "backup_version": "1.0.0",
  "exported_at": "2026-10-06T14:30:00+08:00",
  "records": [],
  "goals": []
}
```

要求：

- 无损保留内部 code、null、空数组、other 文本。
- 导入前验证 `format` 和版本。
- 未识别的未来版本不要静默导入。
- 合并按 `record_id` / `goal_id`。
- 同 ID 冲突时比较 `updated_at`；导入文件较新则更新，本地较新则保留。
- 导入完成显示：新增 / 更新 / 跳过 / 错误数量。

---

## 6. CSV 导出

CSV 面向人和分析程序，使用**中文列名和中文标签值**。

推荐列顺序：

```text
记录ID
训练时间
计划结构
计划结构-其他说明
计划主要强度
活动情境
活动情境-其他说明
坡向专项
路面专项
路面专项-其他说明
附加目的
附加目的-其他说明
关联目标状态
关联目标
完成情况
RPE
备注
创建时间
更新时间
数据结构版本
```

映射要求：

- 单选 code 转为中文 label。
- `null` 导出为空字符串，不伪装成“无”。
- `additional_purposes === null` → 空字符串。
- `additional_purposes === []` → `无附加目的`。
- 多选用中文分号 `；` 连接。
- 关联目标状态：`未回答 / 无具体关联目标 / 已关联目标`。
- CSV 必须正确处理逗号、引号、换行；不能靠简单字符串拼接。
- 建议 UTF-8 BOM。

---

## 7. 数据迁移

虽然 V2.0 只有 schema 1.0.0，也必须保留迁移入口，例如：

```ts
migrateBackup(inputVersion, data)
migrateIndexedDb(oldVersion, newVersion, tx)
```

不要现在实现不存在的未来规则，但架构上不能假设 schema 永远不变。
