# 部署

Roomark 只有一个有状态的部分：服务端和它的 SQLite 数据库。网页由服务端直接提供，桌面端和 Android 应用通过 HTTP 访问同一个服务端。

## 服务端

### 构建

在 `apps/roomark` 目录下运行（本文所有 `wails3 task` 命令都是如此）：

```bash
wails3 task build:server    # 生成 bin/roomark-server
wails3 task build:docker    # 生成镜像 roomark-server:latest
```

两个任务都会先构建生产版前端（`apps/roomark/frontend/dist`），再把它嵌入 Go 程序。Docker 镜像基于 `distroless/static`，程序是不依赖 CGO 的静态二进制，容器内监听 8080 端口。

不想自己构建时，可以用 [GitHub Releases](https://github.com/QianFuv/Roomark/releases) 里的 `roomark-server_<版本>_linux_amd64.tar.gz` 或 `roomark-server_<版本>_windows_amd64.zip`，解压后进入同名目录运行 `roomark-server`（Windows 为 `roomark-server.exe`）。每个目录都附带 `LICENSE`，下载文件可用 `SHA256SUMS` 校验。也可以直接拉取镜像 `ghcr.io/qianfuv/roomark-server:v<版本>`（最新版本也标记为 `latest`），把下面示例里的 `image` 换成它即可。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ROOMARK_DB` | `./roomark.db` | SQLite 数据库文件路径。启动时自动执行迁移 |
| `ROOMARK_PUBLIC_URL` | 无 | 对外访问的根地址，例如 `https://rooms.example.com`。二维码链接和 iCal 地址都用它生成，导出二维码前必须设置 |
| `ROOMARK_ADMIN_NAME`、`ROOMARK_ADMIN_PASSCODE` | 无 | 启动时如果还没有任何管理员，就用这组姓名和 6 位口令创建一个 |
| `ROOMARK_ALLOWED_ORIGINS` | 无 | 额外允许跨域访问的来源，逗号分隔。桌面端和 Android 应用的来源始终允许 |
| `ROOMARK_TRUSTED_PROXIES` | 无 | 反向代理的地址或网段，逗号分隔，例如 `172.20.0.0/16`。只有来自这些地址的请求才能用 `X-Real-IP` 指定客户端 IP，登录和房间码的限流按这个 IP 计算 |
| `WAILS_SERVER_HOST` | `localhost`（镜像中为 `0.0.0.0`） | 监听地址 |
| `WAILS_SERVER_PORT` | `8080` | 监听端口 |

首个管理员创建后，记得在后台修改口令，或者在下次启动前去掉 `ROOMARK_ADMIN_PASSCODE`。

### Docker Compose 示例

```yaml
services:
  roomark:
    image: roomark-server:latest
    restart: unless-stopped
    environment:
      ROOMARK_DB: /data/roomark.db
      ROOMARK_PUBLIC_URL: https://rooms.example.com
      ROOMARK_ADMIN_NAME: 管理员
      ROOMARK_ADMIN_PASSCODE: "123456"
      ROOMARK_TRUSTED_PROXIES: 172.20.0.0/16
    volumes:
      - ./data:/data
    networks:
      - proxy

networks:
  proxy:
    external: true
```

数据库在挂载的 `./data` 目录里，备份时复制 `roomark.db` 即可（建议先停服务，或使用 `sqlite3 roomark.db ".backup backup.db"`）。

### 反向代理

服务端本身只提供 HTTP，HTTPS 交给反向代理（Nginx、Nginx Proxy Manager、Caddy、Cloudflare Tunnel 等）：

- 把整个站点转发到服务端的 8080 端口，路径不需要改写。
- 代理需要设置 `X-Real-IP` 为真实客户端地址，并把代理所在网段写进 `ROOMARK_TRUSTED_PROXIES`。经过 Cloudflare 时，先用 `CF-Connecting-IP` 还原真实地址。
- 服务端绑定在回环地址（`localhost`）时会拒绝 Host 不是 localhost 的请求；对外提供服务时，要么让代理把 Host 改写成 `localhost:<端口>`，要么把 `WAILS_SERVER_HOST` 设为 `0.0.0.0` 并只在内网暴露端口。
- Android 应用只能访问 HTTPS 地址（应用页面本身运行在 `https://wails.localhost`，HTTP 会被当作混合内容拦截）。

## 首次使用

1. 用管理员身份打开 `<ROOMARK_PUBLIC_URL>/admin` 并登录。
2. 在「房间」里新建会议室，设置开放时间和预约规则。
3. 在「名单」里添加或批量导入成员。名单上的人第一次使用时自己设置 6 位口令。
4. 在房间里「导出二维码」，选择 A4、A5 或仅二维码，导出 PNG 或 PDF 打印后贴在门口。海报上同时印有 6 位房间码。

房间码创建后固定不变。扫码打开的链接带着房间码，浏览器会记住它；桌面端可以在首页直接输入房间码绑定房间。

## 客户端分发

### Windows 便携版

```bash
wails3 task package
```

生成 `apps/roomark/bin/roomark-client_<版本>_windows_amd64.zip`，里面只有一个 `roomark-client_<版本>_windows_amd64/` 目录，包含 `roomark-client.exe`、空的 `data/` 和 `LICENSE`。解压到任意有写入权限的文件夹后运行 `roomark-client.exe`：

- 服务器地址保存在 `data/server.json`，网页存储（房间绑定、登录状态、缓存）保存在 `data/webview/`。
- 文件夹不可写（例如放在 `C:\Program Files` 下）时，程序会弹窗说明并退出，不会改写到系统目录。
- 使用 Windows 10/11 自带的 WebView2 运行时。
- 唯一写入系统的设置是「开机自启」，只在用户打开它时写入当前用户的注册表启动项。

需要安装包时可以用 `wails3 task package FORMAT=nsis`。

### Android

```bash
JAVA_HOME=<JDK 21> ANDROID_HOME=<Android SDK> wails3 task android:package
```

生成 `apps/roomark/bin/roomark-client_<版本>_android_arm64.apk`。正式签名通过环境变量 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 传入（见 `apps/roomark/build/android/app/build.gradle`）。正式发布只上传正式签名的 APK；日常 CI 的调试签名包带 `_debug-signed` 后缀。系统返回手势会先关闭弹窗，再回到上一页。

### 预置服务器地址

桌面端和 Android 首次启动时需要填写服务器地址，之后可以在「设置」里修改。服务器地址保存后优先于预置值。

要让用户免填，可以在构建时通过链接参数写入默认地址 `main.defaultServerURL`。Taskfile 目前没有这个开关，需要在对应平台 Taskfile 的 `-ldflags` 中追加 `-X main.defaultServerURL=https://rooms.example.com`（Windows 见 `apps/roomark/build/windows/Taskfile.yml`，Android 见 `apps/roomark/build/android/Taskfile.yml`）。
