# Roomark

Roomark 是一个给小团队用的会议室预约应用。每间会议室门口贴一张二维码，扫码就能看到房间现在有没有人用、今天还有哪些空档，并直接预约。

- **免账号**：管理员维护一份名单，每人用一个 6 位数字口令确认身份；不在名单里的人可以自己加名字。
- **有空就能约**：没有审批、签到和爽约处罚。时段冲突时，会推荐当天附近的空档和之后几天的同一时间。
- **多端**：同一套代码构建出服务端（同时提供网页）、Windows 桌面端和 Android 应用。

## 功能

| 模块 | 内容 |
| --- | --- |
| 会议室概况 | 当前状态（空闲 / 谁在用、几点结束）、下一场预约、今天的时间线、本周会议热力图、公告 |
| 马上使用 | 一键占用 30 / 60 / 90 / 120 分钟；进行中可以续时或提前结束 |
| 预约 | 免滚动的日期和时间选择器，必填用途，实时检查冲突；冲突时给出推荐时段 |
| 重复预约 | 每周或隔周、可多选星期；提交前逐次预览，冲突的那几次可以跳过或改到推荐时段 |
| 日历 | 手机三日视图，宽屏周视图，左右滑动翻页 |
| 我的预约 | 即将开始和已结束的预约，重复预约合并显示；个人 iCal 订阅 |
| 房间码 | 每间会议室有一个固定的 6 位房间码，印在二维码海报上，桌面端可以手动输入绑定 |
| 管理后台 | 房间与预约规则、名单（导入、重置口令、管理员）、全部预约（代人预约、不可预约时段）、公告、二维码海报导出（PNG / PDF） |
| 统计 | 使用时长、利用率与趋势、时段热力图、使用习惯、需求缺口（冲突与推荐采纳率）、取消情况、人员排行，支持 CSV 导出 |

界面只有简体中文，时区固定为 `Asia/Shanghai`。支持浅色和深色主题，按屏宽分为手机（< 768 px）、窄屏（768–1279 px）、宽屏（≥ 1280 px）三档布局。

## 架构

```
            ┌───────────────────────────────┐
 浏览器 ───▶│ 服务端（Wails server 模式）    │
 桌面端 ───▶│  /       网页前端              │
 Android ──▶│  /api    业务 HTTP API（huma） │
            │  /ical   iCal 订阅             │
            │  SQLite（唯一的数据存储）       │
            └───────────────────────────────┘
```

- 所有业务逻辑都在服务端的 HTTP API 里。桌面端和 Android 只是外壳，和浏览器一样通过 HTTP 调用服务端，不在本地保存业务数据。
- Wails 绑定只用于宿主能力：平台信息、服务器地址设置、保存文件、扫码、托盘和开机自启。

| 层 | 技术 |
| --- | --- |
| 后端 | Go 1.26、Wails v3、huma v2（OpenAPI 3.1）、sqlc、goose、SQLite（modernc，纯 Go） |
| 前端 | React 19 + React Compiler、TypeScript、Vite+、StyleX、Base UI / Animate UI、TanStack Router / Query / Form / Table、Zod、Motion、Temporal polyfill |
| 测试 | Go test、Vitest 浏览器模式、MSW、Playwright + axe |

## 快速开始

### 环境

- Go 1.26+
- Node.js 与 pnpm
- [Wails v3 CLI](https://v3.wails.io/)（`wails3`）
- 构建 Android 需要 JDK 21 和 Android SDK（设置 `JAVA_HOME`、`ANDROID_HOME`）

### 本地运行服务端

```bash
cd frontend && pnpm install && cd ..
ROOMARK_ADMIN_NAME=管理员 ROOMARK_ADMIN_PASSCODE=123456 \
ROOMARK_PUBLIC_URL=http://localhost:8080 WAILS_SERVER_PORT=8080 \
  wails3 task run:server
```

打开 http://localhost:8080/admin ，用上面的管理员姓名和口令登录，新建房间并导出二维码。

### 构建与打包

| 目标 | 命令 | 产物 |
| --- | --- | --- |
| 服务端（含网页） | `wails3 task build:server` | `bin/roomark-server`（Windows 为 `.exe`） |
| 服务端 Docker 镜像 | `wails3 task build:docker` | 本地镜像 `roomark:latest`，容器内端口 8080 |
| Windows 便携版 | `wails3 task package` | `bin/Roomark-portable-windows-amd64.zip` |
| Windows 安装包（可选） | `wails3 task package FORMAT=nsis` | NSIS 安装程序 |
| Android | `wails3 task android:package` | `bin/roomark.apk` |

Windows 便携版解压即用，所有数据（服务器地址、网页存储）都放在程序同目录的 `data` 文件夹，不写入系统目录。桌面端和 Android 首次启动时填写服务器地址，也可以在构建时通过 `-X main.defaultServerURL=https://...` 预置。

每个版本的服务端程序、Windows 便携版、Android 安装包和 Docker 镜像（`ghcr.io/qianfuv/roomark`）都由 CI 构建并发布在 [Releases](https://github.com/QianFuv/Roomark/releases)。

部署细节见 [docs/deployment.md](docs/deployment.md)，开发和测试见 [docs/development.md](docs/development.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/spec.md](docs/spec.md) | 产品规则、数据模型、HTTP API、前端页面与宿主服务 |
| [docs/deployment.md](docs/deployment.md) | 服务端配置、Docker、反向代理、客户端分发 |
| [docs/development.md](docs/development.md) | 目录结构、开发命令、代码生成、测试与检查、CI 与发布 |
| [docs/design/visual-system.md](docs/design/visual-system.md) | 字体、字号角色、间距、图标和弹窗规则 |
| [docs/design/t3-soft.json](docs/design/t3-soft.json) | T3 Soft 配色（深色为 `colors`，浅色为 `variants.light`） |
| [api/openapi.json](api/openapi.json) | 由后端导出的 OpenAPI 3.1 接口描述 |

## 许可证

本项目以 [MIT 许可证](LICENSE) 发布。

`frontend/assets/` 中随附的 JetBrainsLxgwNerdMono 字体（JetBrains Mono + 霞鹜文楷 Mono 合并字体）使用 SIL Open Font License 1.1，见 [frontend/assets/OFL.txt](frontend/assets/OFL.txt)。
