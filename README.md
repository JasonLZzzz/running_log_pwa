# 跑后记录 PWA：Codex 任务包

版本：Task Pack v1.0  
日期：2026-10-06

## 任务目的

开发一个**面向 iPhone、local-first、可安装到主屏幕的跑后记录 PWA**，用于在每次跑步后快速记录“只有跑者本人知道”的计划、意图与主观体验信息，并为后续 Garmin/FIT 客观数据分析提供可合并的人工语义层。

本任务不做训练分析，不接 Garmin API，不做云端账户，不做后端数据库。

## 任务包文件

- `00_TASK_BRIEF.md`：任务边界、交付物、技术约束与实施顺序
- `01_FIELD_SPEC.md`：字段及全部选项的语义定义和边界
- `02_DATA_SCHEMA.md`：IndexedDB / JSON / CSV 数据结构
- `03_UI_UX_SPEC.md`：iPhone 端交互与页面设计要求
- `04_ACCEPTANCE_TESTS.md`：验收标准与测试场景
- `05_CODEX_PROMPT.md`：可直接复制给 Codex 的启动提示词

## 核心原则

1. **人工记录只保存算法不可靠知道的信息**：计划、意图、情境、完成情况、RPE、备注。
2. **客观事实留给 Garmin/FIT 与后续算法**：距离、时长、配速、心率、爬升、客观长距离属性等不在本表单重复记录。
3. **每个字段只回答一个问题**，避免“间歇 + 阈值 + 爬坡 + 比赛专项”混成一个标签。
4. **计划与实际分离**：本网页记录“原计划/主观体验”，未来算法记录“实际发生了什么”，两者都保留。
5. **不把未填写自动解释为‘无’**。可选字段必须区分“未填写”和“明确无该项”。
6. **移动端记录速度优先**，普通训练应能在约 20–30 秒内完成。
7. **数据归用户所有**：本地保存，可无损导出 JSON，并可导出适合 Python/Codex 分析的 UTF-8 CSV。

---

## V2.0 MVP 实现与运行

React + TypeScript + Vite，普通 CSS；`idb` 封装 IndexedDB。没有后端、账号或数据上传。全部字段以任务包为准，内部 code 与中文显示集中在 `src/domain/fields.ts`。

### Windows 本机运行

使用 Node.js 24 LTS 与 pnpm 11.25.0。此电脑已有 Codex 的 Node/pnpm 运行时，可直接使用仓库内的 PowerShell 包装脚本（优先使用已安装的 `pnpm.cmd`）。脚本只使用 ASCII 字符，兼容 Windows PowerShell 5.1 和 PowerShell 7，不需要手工添加 UTF-8 BOM：

```powershell
Set-Location -LiteralPath 'E:\Garmin活动\running_log_pwa'
.\scripts\pnpm.ps1 install --frozen-lockfile
.\scripts\pnpm.ps1 dev --port 5173 --strictPort
```

浏览器打开 `http://localhost:5173/`。如果 PowerShell 执行策略阻止脚本，可将每条脚本命令改为 `powershell -ExecutionPolicy Bypass -File .\scripts\pnpm.ps1 ...`。没有 Codex 运行时的电脑请先安装 Node.js 24，然后用 `npm install -g pnpm@11.25.0` 安装 pnpm；也可以直接用 `pnpm` 替代上述脚本。

### 生产构建与 PWA 测试

开发模式显示“开发预览”，不注册 service worker。安装和离线测试必须使用生产构建：

```powershell
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 preview --port 4173 --strictPort
```

打开 `http://localhost:4173/`，等顶部显示“离线可用”后，在开发者工具中断网并刷新。桌面浏览器将 localhost 视为安全上下文；iPhone 通过局域网 IP 访问普通 HTTP 不具备相同条件，应使用静态 HTTPS 站点测试安装和离线。

IndexedDB 按 origin（协议、主机名、端口）隔离。`localhost` 与 `127.0.0.1` 是不同主机名，5173 与 4173 也是不同端口，数据不会共享；开发预览、生产预览和 HTTPS 站点各有独立记录。切换地址后看不到原记录并不表示记录已丢失，请回到原地址查看；迁移请在原地址导出 JSON，再在新地址导入。

### 自动验证

```powershell
.\scripts\pnpm.ps1 typecheck
.\scripts\pnpm.ps1 lint
.\scripts\pnpm.ps1 test
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 exec playwright install chromium webkit
.\scripts\pnpm.ps1 test:e2e
.\scripts\pnpm.ps1 audit
```

首次下载浏览器之后，`.\scripts\pnpm.ps1 check` 会顺序运行类型检查、lint、单元测试、生产构建和浏览器测试。浏览器测试占用 4173、4174 两个端口，请先关闭预览服务。报告在 `playwright-report/index.html`，失败截图/轨迹在 `test-results/`。

### 静态 HTTPS 部署

构建输出为 `dist/`，全部业务资源、manifest 与 service worker 都使用部署目录相对路径，可以部署在站点根目录或 `/running_log_pwa/` 等子目录。上传完整 `dist/`，不要只上传 `index.html`。建议让 `sw.js` 使用 `Cache-Control: no-cache`，并保留浏览器默认更新检查；应用发现新版本时会提示用户先保存再更新。

V2.0.1 已完成正式发布及真机验收。V2.1.0 当前仅在特性分支本地开发，未部署。生产发布须经人工授权后从 `main` 手动运行现有工作流；Pages 环境继续只允许 `main`，不要为了预览放开分支规则。本轮不调整 Pages、默认分支或工作流。

### 使用与验收

- 数据页可新增、编辑和归档本地目标；记录页新增目标后立即选中。
- JSON 导入先严格校验格式、版本、全部字段与目标引用，再显示合并预览。确认后使用单个 IndexedDB 事务；同ID按实际时刻比较 `updated_at`，较新者优先，时间相同则保留本地。
- 坡向/路面空值与 `none` 分开；附加目的 `null` / `[]` / 多选数组分开；关联目标保存 `unset` / `none` / `linked` 三态。取消最后一个附加目的恢复“未填写”，明确无必须单独选择。
- JSON 完整保存所有工程字段；CSV 使用 UTF-8 BOM、中文列名/标签与中文分号，并转义逗号、引号及多行备注。CSV 用于分析，恢复备份请用 JSON。
- 数据保存在当前浏览器/PWA 的本地存储，域名/浏览器环境变化可能隔离数据，清除网站数据或系统清理可能丢失。请定期导出 JSON。

详细设计、文件清单、验收证据与真机步骤见 [实现说明](docs/IMPLEMENTATION.md) 和 [验收报告](docs/ACCEPTANCE.md)。根目录原始任务规格文件保持不变。

## V2.1.0 鞋库与升级安全

实现依据为 `tasks/v2_1_0_shoe_library/`。每双具体跑鞋有独立 UUID，可新增、编辑、退役和恢复在用；数据页管理鞋库，记录页训练时间之后选择本次用鞋，也可以就地新增。未填写为 null，允许历史补录；退役不删除实体或历史关联。同型号多双靠昵称区分，实际关联始终使用 ID。名称编辑后历史动态显示当前名称。本版不做里程、图片、自动同步或智能选鞋。

应用版本 2.1.0；IndexedDB 整数版本 2；记录/目标/鞋子 schema 与 JSON backup 版本 2.0.0。原三个 stores 保留，新增 shoes；旧记录/目标在同一个升级事务中转换，ID、原时间戳、标签、备注和目标引用不变，用鞋一律补 null。事务失败整体回滚并提示，不清空数据库。

新版 JSON 包含全部在用/退役鞋，可导入严格合法的旧 v1 或新 v2 备份。旧备份较新记录可更新其他字段，但不能清空本地已补录的用鞋；预览明确显示保护数量。不同 UUID 的同名鞋按独立实体保留，不按名称合并。CSV 保持前 20 列，在末尾追加用鞋 ID、品牌、型号、昵称、类型五列；文件名本地时间戳保持不变。

**正式手机升级前，必须先从现有 V2.0.1 主屏幕 PWA 导出 v1 JSON，保存到网站存储之外，并确认文件可打开。不要把真实备份提交公开仓库。** 升级后导出并保留 v2 备份。旧应用不能读取新 v2 备份，也不能直接打开 IDB 2；重新部署旧 tag 不是数据回滚方案。发生问题时保留网站数据和外部备份，使用兼容 IDB 2 的修复版本或受控恢复，绝不直接删库、卸载重装或清理 Safari 数据。

不同 origin、浏览器和主屏幕 PWA 的数据不会自动同步。完整实现、自动验收与待真机步骤见 [V2.1.0 工作报告](docs/V2_1_SHOE_LIBRARY.md)。本地运行命令仍使用上文 localhost 地址。
