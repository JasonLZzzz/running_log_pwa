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

用户已在本轮 RC 修订前完成 GitHub Pages HTTPS 部署及 iPhone 验收，详见验收报告。现有 `.github/workflows/pages.yml` 提供手动部署入口，可选择 `build_v2_mvp` 分支并按 Actions 返回的 HTTPS 地址访问。本轮只修订本地代码与文档，不重新部署，不调整 Pages 设置或默认分支，也不合并到 main。

### 使用与验收

- 数据页可新增、编辑和归档本地目标；记录页新增目标后立即选中。
- JSON 导入先严格校验格式、版本、全部字段与目标引用，再显示合并预览。确认后使用单个 IndexedDB 事务；同ID按实际时刻比较 `updated_at`，较新者优先，时间相同则保留本地。
- 坡向/路面空值与 `none` 分开；附加目的 `null` / `[]` / 多选数组分开；关联目标保存 `unset` / `none` / `linked` 三态。取消最后一个附加目的恢复“未填写”，明确无必须单独选择。
- JSON 完整保存所有工程字段；CSV 使用 UTF-8 BOM、中文列名/标签与中文分号，并转义逗号、引号及多行备注。CSV 用于分析，恢复备份请用 JSON。
- 数据保存在当前浏览器/PWA 的本地存储，域名/浏览器环境变化可能隔离数据，清除网站数据或系统清理可能丢失。请定期导出 JSON。

详细设计、文件清单、验收证据与真机步骤见 [实现说明](docs/IMPLEMENTATION.md) 和 [验收报告](docs/ACCEPTANCE.md)。根目录原始任务规格文件保持不变。
