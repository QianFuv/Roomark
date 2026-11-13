# 开发

## 目录结构

```
.
├── apps/roomark/                 Roomark 应用（Wails 项目根目录）
│   ├── main.go, main_*.go        程序入口：main_server.go（-tags server）与 main_client.go（桌面端、Android）
│   ├── host*.go, hostservices.go 宿主服务（Wails 绑定）：平台信息、服务器地址、文件、扫码、托盘、开机自启
│   ├── internal/
│   │   ├── api/                  HTTP API（huma）、鉴权、限流、iCal
│   │   ├── domain/               领域类型
│   │   ├── rules/                预约规则校验、重复预约展开、冲突推荐
│   │   ├── statistics/           统计与会议热力图
│   │   ├── roomcode/             6 位房间码
│   │   └── store/                sqlc 生成的数据访问代码
│   ├── db/
│   │   ├── migrations/           goose 迁移（SQL）
│   │   ├── queries/              sqlc 查询
│   │   └── room_codes.go         Go 迁移
│   ├── cmd/
│   │   ├── openapi/              导出 api/openapi.json
│   │   └── smoke/                对构建好的服务端做真实 HTTP 冒烟测试
│   ├── api/openapi.json          OpenAPI 3.1 接口描述（生成）
│   ├── frontend/
│   │   ├── src/                  React 应用（routes、features、ui、styles、api、lib）
│   │   ├── assets/               JetBrainsLxgwNerdMono 字体分片
│   │   ├── bindings/             Wails 绑定（生成）
│   │   └── e2e/                  Playwright 端到端测试
│   ├── build/                    各平台构建配置（Taskfile、Android、Windows、Docker）
│   ├── Taskfile.yml              wails3 task 入口
│   └── sqlc.yaml
├── version.go                    嵌入 VERSION，供应用读取版本号
├── go.mod, go.sum                整个仓库共用一个 Go 模块
├── scripts/                      CI 发版规则（release-version.mjs）
├── .github/                      CI 工作流和 Dependabot
├── VERSION                       发布版本号
└── docs/                         项目文档
```

## 日常命令

`wails3 task`、`sqlc` 和前端命令都在 `apps/roomark` 下运行；Go 的检查和测试在仓库根目录运行。

```bash
cd apps/roomark
wails3 task dev              # 桌面端开发模式（热更新）
wails3 task run:server       # 构建并运行开发版服务端
cd frontend && pnpm dev:mock # 只跑前端，接口由 MSW 模拟
```

开发版服务端需要的环境变量见 [deployment.md](deployment.md#环境变量)。

## 代码生成

| 生成物 | 来源 | 命令 |
| --- | --- | --- |
| `internal/store/` | `db/migrations/`、`db/queries/` | `sqlc generate` |
| `api/openapi.json` | `internal/api/` 中的 huma 定义 | `wails3 task openapi`（或在根目录 `go run ./apps/roomark/cmd/openapi`） |
| `frontend/src/api/schema.d.ts` | `api/openapi.json` | `cd frontend && pnpm api:types` |
| `frontend/bindings/` | 宿主服务 | 构建时由 `wails3 generate bindings` 自动生成 |

表中路径相对于 `apps/roomark`。改接口时按顺序走一遍：改 Go 代码，导出 `openapi.json`，再生成前端类型。

## 测试与检查

### 后端

在仓库根目录运行：

```bash
gofmt -l .
go vet ./...
golangci-lint run ./...
go test ./...
go test -tags server ./...
```

服务端构建好之后，可以用 `go run ./apps/roomark/cmd/smoke`（默认使用 `apps/roomark/bin/roomark-server.exe`，可用 `-binary` 指定） 以真实 HTTP 请求跑一遍主要流程。

### 前端

```bash
cd apps/roomark/frontend
pnpm check     # 格式、lint、类型检查（vp check）
pnpm test      # Vitest 浏览器模式单元测试
pnpm build     # 生产构建
pnpm knip      # 未使用的文件、依赖和导出
```

### 端到端

端到端测试使用真实的服务端和全新的 SQLite 数据库，在手机（360×780）和桌面（1280×860）两种视口下运行，并用 axe 检查可访问性：

```bash
cd apps/roomark
cd frontend && pnpm build && cd ..
wails3 task build:server
cd frontend && pnpm e2e
```

默认使用 `apps/roomark/bin/roomark-server.exe`，可以用环境变量 `ROOMARK_E2E_SERVER` 指定其他路径。`e2e/layout.spec.tsx` 会检查各档屏宽下是否有横向溢出和大块留白；设置 `ROOMARK_SCREENSHOT_DIR` 后会顺便保存截图。

## 持续集成与发布

CI 定义在 `.github/workflows/`，推送到 `main`、提交 Pull Request 或手动运行时触发：

| 任务 | 内容 |
| --- | --- |
| Release rules | 测试发版规则，检查各处版本号一致，判断本次是否发版 |
| Go server (Linux) | 不启用 CGO：gofmt、sqlc 和 OpenAPI 生成物无差异、`-tags server` 下的 vet、golangci-lint 和测试 |
| Go desktop (Windows) | 桌面端默认标签下的 vet、golangci-lint，以及两种标签下带竞态检测的测试 |
| Frontend | `pnpm check`、Knip、接口类型无差异、单元测试、生产构建、真实服务端上的端到端测试 |
| Package | 构建 Linux / Windows 服务端程序、Docker 镜像、Windows 便携版和 Android APK，服务端和镜像都会跑冒烟测试；产物作为 Actions artifact 保留 14 天 |
| Publish release | 只在发版时运行：推送镜像到 GHCR，创建 GitHub Release 并上传全部产物和 `SHA256SUMS` |

### 发版

版本号以仓库根目录的 `VERSION` 为准（`MAJOR.MINOR.PATCH`）。Go 程序嵌入它，Android 的 `versionName` / `versionCode` 从它计算；`apps/roomark/build/config.yml` 的 `info.version` 和 `apps/roomark/build/windows/info.json` 中的四处版本号需要手动改成同一个值，CI 会检查。

1. 同时修改上面三个文件里的版本号并推送到 `main`。
2. CI 发现 `VERSION` 比推送前高，全部检查和打包通过后发布 `v<版本>`：GitHub Release、镜像 `ghcr.io/qianfuv/roomark:v<版本>` 和 `latest`。
3. 版本号不能降低；没改版本号的推送只做检查和打包，不发版。

发布失败或要补发当前版本时，在 Actions 里手动运行 CI，填入与 `main` 上 `VERSION` 相同的版本号。已存在的 Release 会覆盖同名文件，但标签必须指向同一个提交。

### Android 签名

发版时 Android APK 必须用正式密钥签名，否则这一项会被跳过（其他产物照常发布），以免不同版本签名不一致导致无法覆盖安装。在仓库的 Actions secrets 中设置：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

没有设置时，平时的 CI 会用调试密钥构建 APK，文件名带 `_debug-signed`，只用于测试。

## 约定

- 代码、注释和提交信息使用英文，文档使用中文。
- 提交信息遵循 Conventional Commits，一次提交只做一件事，例如 `feat(web): ...`、`fix(api): ...`。
- Go 导出标识符写文档注释；TypeScript 新函数和组件写 TSDoc，新文件用 `.tsx`。
- 前端样式只用 [视觉规范](design/visual-system.md) 中的字号角色、间距和图标尺寸，颜色只用 `tokens.stylex.tsx` 中的变量。
- 用户可见的错误信息由服务端给出中文 `detail`，前端直接显示。
