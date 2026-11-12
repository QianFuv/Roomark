# 开发

## 目录结构

```
.
├── main.go, main_*.go        程序入口：main_server.go（-tags server）与 main_client.go（桌面端、Android）
├── host*.go, hostservices.go 宿主服务（Wails 绑定）：平台信息、服务器地址、文件、扫码、托盘、开机自启
├── internal/
│   ├── api/                  HTTP API（huma）、鉴权、限流、iCal
│   ├── domain/               领域类型
│   ├── rules/                预约规则校验、重复预约展开、冲突推荐
│   ├── statistics/           统计与会议热力图
│   ├── roomcode/             6 位房间码
│   └── store/                sqlc 生成的数据访问代码
├── db/
│   ├── migrations/           goose 迁移（SQL）
│   ├── queries/              sqlc 查询
│   └── room_codes.go         Go 迁移
├── cmd/
│   ├── openapi/              导出 api/openapi.json
│   └── smoke/                对构建好的服务端做真实 HTTP 冒烟测试
├── api/openapi.json          OpenAPI 3.1 接口描述（生成）
├── frontend/
│   ├── src/                  React 应用（routes、features、ui、styles、api、lib）
│   ├── assets/               JetBrainsLxgwNerdMono 字体分片
│   ├── bindings/             Wails 绑定（生成）
│   └── e2e/                  Playwright 端到端测试
├── build/                    各平台构建配置（Taskfile、Android、Windows、Docker）
└── docs/                     项目文档
```

## 日常命令

```bash
wails3 task dev              # 桌面端开发模式（热更新）
wails3 task run:server       # 构建并运行开发版服务端
cd frontend && pnpm dev:mock # 只跑前端，接口由 MSW 模拟
```

开发版服务端需要的环境变量见 [deployment.md](deployment.md#环境变量)。

## 代码生成

| 生成物 | 来源 | 命令 |
| --- | --- | --- |
| `internal/store/` | `db/migrations/`、`db/queries/` | `sqlc generate` |
| `api/openapi.json` | `internal/api/` 中的 huma 定义 | `go run ./cmd/openapi` 或 `wails3 task openapi` |
| `frontend/src/api/schema.d.ts` | `api/openapi.json` | `cd frontend && pnpm api:types` |
| `frontend/bindings/` | 宿主服务 | 构建时由 `wails3 generate bindings` 自动生成 |

改接口时按顺序走一遍：改 Go 代码，导出 `openapi.json`，再生成前端类型。

## 测试与检查

### 后端

```bash
gofmt -l .
go vet ./...
golangci-lint run ./...
go test ./...
go test -tags server ./...
```

服务端构建好之后，可以用 `go run ./cmd/smoke -binary bin/roomark-server.exe` 以真实 HTTP 请求跑一遍主要流程。

### 前端

```bash
cd frontend
pnpm check     # 格式、lint、类型检查（vp check）
pnpm test      # Vitest 浏览器模式单元测试
pnpm build     # 生产构建
pnpm knip      # 未使用的文件、依赖和导出
```

### 端到端

端到端测试使用真实的服务端和全新的 SQLite 数据库，在手机（360×780）和桌面（1280×860）两种视口下运行，并用 axe 检查可访问性：

```bash
cd frontend && pnpm build && cd ..
wails3 task build:server
cd frontend && pnpm e2e
```

默认使用 `bin/roomark-server.exe`，可以用环境变量 `ROOMARK_E2E_SERVER` 指定其他路径。`e2e/layout.spec.tsx` 会检查各档屏宽下是否有横向溢出和大块留白；设置 `ROOMARK_SCREENSHOT_DIR` 后会顺便保存截图。

## 约定

- 代码、注释和提交信息使用英文，文档使用中文。
- 提交信息遵循 Conventional Commits，一次提交只做一件事，例如 `feat(web): ...`、`fix(api): ...`。
- Go 导出标识符写文档注释；TypeScript 新函数和组件写 TSDoc，新文件用 `.tsx`。
- 前端样式只用 [视觉规范](design/visual-system.md) 中的字号角色、间距和图标尺寸，颜色只用 `tokens.stylex.tsx` 中的变量。
- 用户可见的错误信息由服务端给出中文 `detail`，前端直接显示。
