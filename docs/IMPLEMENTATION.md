# V2.0 MVP 实现说明

## 范围与设计

按根目录七份任务包实现。版本 V2.0.0、数据 schema 1.0.0。技术栈为 React、TypeScript、Vite 与 idb，普通 CSS；Vitest + fake-indexeddb 验证领域/数据库，Playwright 验证 Chromium/WebKit 移动视口。没有后端或外部数据接口，运行时只请求本站静态资源。

常用计划字段与完成情况按验收清单必填，不隐含任何分类答案。训练时间默认本地当前时刻；编辑时若未改变分钟显示值，原始秒、毫秒和时区串完整保留。所有保存时间带时区；历史排序和冲突判断比较实际时间戳，避免跨时区 ISO 字符串字典序错误。

JSON 导入是完整备份校验：拒绝未来版本、字段缺失/未知字段、无效 UUID、无效日期、非法 code/RPE、重复ID和目标悬空引用。不剥离字段或默默降级。完整文件有一处错误就拒绝整份，并显示文件错误数量 1；没有部分导入。预览不写库，确认时在单事务中重新计算合并，避免预览与写入之间其他页面修改数据造成错误覆盖。同更新时间跳过，保留本地。批量排入写入请求，仅写入新增/更新项，减少 WebKit 的数据库往返等待。

JSON 恢复原始工程字段；之后编辑保留 ID/创建时间，仅递增更新时间。普通表单保存提前生成一次 UUID，使用同步锁与禁用按钮防止双击；保存失败仍保留输入。目标只支持归档，不删除，以保证历史引用完整。列表每次最多追加 50 张卡片，1000 条历史不一次渲染全部节点。

可选附加目的取消最后一项回到未填写，不把取消动作当成“明确无”。其他说明切换离开“其他”时清空，备注不裁剪换行或限制长度。帮助文案与标签来自字段规范，所有展示使用中文。

## IndexedDB 与迁移

数据库 `running_log_db`，版本 1，包含 `run_records`、`goals`、`app_meta`。记录索引：`activity_time`、`updated_at`；目标索引：`target_date`。schema 版本保存在工程字段与 app_meta。迁移入口为 `migrateIndexedDb` 和 `migrateBackup`，当前不编造未来迁移规则。

任务包中的 `archived` 索引是建议项。布尔值不是合法的 IndexedDB 索引键，因此保留 `archived: boolean` 数据结构，并在目标列表读取后筛选，没有添加替代工程字段或修改规格文件。

## 离线与更新

生产构建脚本扫描全部构建资源，按内容 hash 生成 service worker 和预缓存列表。缓存名称包含部署 scope，根路径/子目录可独立工作。首次安装用 `cache.addAll`，资源有缺失则不激活不完整的新版本。页面与构建资源使用当前版本缓存；仅处理同源、scope 内静态 GET，不缓存业务数据，IndexedDB 独立持久化。

新版本等待用户点击更新后才请求 `skipWaiting`，保留未保存表单。其他标签页触发更新不会使当前标签页自动重载。应用加载完成后显示“离线可用”；开发服务不注册 service worker。

## 文件清单

| 文件/目录 | 职责 |
| --- | --- |
| `src/domain/{fields,types,time,draft}.ts` | 标签、类型、时间处理、表单校验和多选语义 |
| `src/data/{schema,db,merge,export}.ts` | 严格 schema 校验、IndexedDB、原子合并、JSON/CSV |
| `src/pages/{RecordPage,HistoryPage,DataPage}.tsx` | 跑后表单、历史详情、备份与目标管理 |
| `src/components/Controls.tsx` | 单选/多选按钮、字段帮助、原生弹窗、目标编辑 |
| `src/app/{App.tsx,pwa.ts,service-worker.template.js}` | 导航、保存后摘要、离线状态与更新、缓存实现 |
| `src/main.tsx`, `src/styles/app.css`, `index.html` | 入口、中文手机布局、safe-area、浏览器元数据 |
| `public/manifest.webmanifest`, `public/icons/*` | PWA 配置、标准/可遮罩/Apple 图标 |
| `scripts/build-sw.mjs`, `scripts/generate-icons.py`, `scripts/pnpm.ps1` | 生成离线缓存、可选图标重建、Windows 启动工具 |
| `tests/unit/*`, `tests/e2e/*`, `tests/fixtures.ts` | 单元测试、生产浏览器验收、测试数据 |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | 固定版本与可复现依赖 |
| `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `playwright.config.ts` | 类型、开发构建、静态检查、双浏览器测试配置 |
| `.gitignore`, `.github/workflows/pages.yml` | 生成物忽略、仅手动触发的静态 HTTPS 发布配置 |
| `README.md`, `docs/*` | 运行/部署说明、验收证据和已知限制 |

## 已知限制

未在真实 iPhone 上操作，也没有实际部署 HTTPS 站点。本地移动视口与 WebKit 自动测试不能替代 iOS 主屏幕安装、系统存储回收、真实飞行模式和 Home Indicator 检查。普通记录 20–30 秒是交互设计目标，需用户真机计时确认。

Playwright 1.63 的 WebKit 离线模拟会提前拒绝 service worker 响应，见 [上游问题 #42775](https://github.com/microsoft/playwright/issues/42775)。浏览器离线验收采用实际停止本地源站，并断言页面由 service worker 返回；没有跳过 WebKit 缓存/离线操作要求，也没有改动产品需求。

本地存储依赖浏览器保留数据；网页无法保证网站数据清理或系统存储回收后恢复，必须使用 JSON 备份。浏览器/PWA 的存储环境可能不同，跨环境以 JSON 手动迁移。没有跨设备同步，也没有合并删除墓碑；重新导入包含已删除记录的旧备份会按正常合并规则恢复该记录。

只接受 schema 1.0.0 完整备份；未知未来版本明确拒绝。无复杂筛选、训练图表或算法分类。版本更新机制已实现；多版本真实线上更新仍需部署后人工验证。
