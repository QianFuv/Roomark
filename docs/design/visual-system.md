# 视觉规范

所有页面和三档屏宽（手机 < 768 px、窄屏 768–1279 px、宽屏 ≥ 1280 px）共用一套字体、字号角色、间距和图标规则。颜色见 [t3-soft.json](t3-soft.json)。变量定义在 `apps/roomark/frontend/src/styles/tokens.stylex.tsx`，字号角色在 `apps/roomark/frontend/src/ui/typography.tsx`，图标尺寸在 `apps/roomark/frontend/src/ui/icon.tsx`。

## 字体

使用 `JetBrainsLxgwNerdMono`（JetBrains Mono 与霞鹜文楷 Mono 的合并字体，OFL-1.1）。字体经 cn-font-split 切成按 unicode-range 划分的 WOFF2 分片，放在 `apps/roomark/frontend/assets/JetBrainsLxgwNerdMono-Regular/` 和 `apps/roomark/frontend/assets/JetBrainsLxgwNerdMono-Bold/`，由 `src/styles/base.css` 通过 `@import` 引入，全局字体为 `'JetBrainsLxgwNerdMono', monospace`。浏览器只下载页面实际用到的分片。

- 只有 400 和 700 两种字重，所有样式只用 `fontWeights.regular` 或 `fontWeights.bold`；`font-synthesis-weight: none` 阻止浏览器伪造其他字重。
- 这是中英文 2:1 的等宽字体，同样像素下看起来比比例字体大一档，下面的字号已经按它校准。
- 二维码海报（PNG 和 PDF）先加载要画的字形，再用同一字体绘制。

## 字号角色

每段文字只用一个角色，角色同时决定字号、行高和字重，组件只额外指定颜色。页面标题下方的任何内容都不能比标题更醒目。

| 角色 | 字号 | 行高 | 字重 | 用途 |
| --- | --- | --- | --- | --- |
| `display` | 手机 22 px，≥ 768 为 24 px | 30 px / 32 px | 700 | 只用于页面标题（`PageHeader`） |
| `title` | 16 px | 24 px | 700 | 区块、卡片、弹窗标题；状态主句；空状态标题；品牌名 |
| `body` | 14 px | 22 px | 400 | 正文、提示、菜单项、表格内容、列表行的次要文字 |
| `label` | 14 px | 20 px | 700 | 按钮、标签页、分段选项、字段名、列表行主文字、行内强调 |
| `meta` | 12 px | 18 px | 400 | 辅助说明、徽标、行旁时间、坐标轴、日历事件文字、字段错误 |
| `figure` | 20 px | 28 px | 700 | 单独的数字：统计值、口令框、房间码框 |
| `input` | 16 px | 24 px | 400 | 只用于文本输入框和多行输入框（16 px 可避免 iOS 自动放大） |

字体本身等宽，数字不需要 `tabular-nums`；不使用 `letterSpacing`。

## 间距

以 4 为基数（`space.*`）：

| 变量 | xxs | xs | sm | md | lg | xl | xxl |
| --- | --- | --- | --- | --- | --- | --- | --- |
| px | 2 | 4 | 8 | 12 | 16 | 24 | 32 |

能对上用途时优先用语义变量：

| 变量 | 数值 | 用途 |
| --- | --- | --- |
| `pagePadding` / `Narrow` / `Wide` | 16 / 24 / 32 px | 各档页面边距 |
| `sectionGap` / `sectionGapWide` | 16 / 24 px | 区块之间、页面分栏之间 |
| `cardPadding` | 16 px（三档相同） | 卡片、面板、弹窗内边距 |
| `cardGap` | 12 px | 卡片内各块之间 |
| `controlGap` | 8 px | 相邻按钮和控件之间 |
| `rowPaddingBlock` / `rowPaddingInline` | 8 / 12 px | 列表行（日程、预约、名单） |

标题到内容 `sm`（8 px）；控件内图标到文字 `sm`，图标到 `meta` 文字 `xs`。

控件高度（`sizes.*`）：`controlSmall` 36 px 用于密集区域的次要控件；`control` 44 px 为默认值，也是触控目标的下限；`controlLarge` 48 px 用于整宽的表单提交和两行按钮。按钮分 `sm` / `md` / `lg` 三种，对应这三个高度，文字都用 `label` 角色，没有更大的按钮。

## 图标

只用 lucide-react。全局统一线宽 1.75（在根部由 `IconDefaults` 设置），组件里不传 `strokeWidth`。尺寸按场景区分（`ICON_SIZE`）：

| 场景 | 尺寸 |
| --- | --- |
| 跟随 `meta` 文字 | 14 px |
| 按钮、输入框、菜单、跟随正文（默认，不写 `size`） | 16 px |
| 导航项和标签页 | 18 px |
| 空状态和错误状态 | 32 px |

保留帮助扫读的图标（导航、标签页、主要操作、提示语气、重复标记），去掉标题旁的装饰性图标。

## 弹窗

所有弹出窗口（登录、预约详情、修改口令、后台编辑、确认框）都用 `apps/roomark/frontend/src/ui/sheet.tsx` 中的同一个组件，按屏宽切换形态：

| 屏宽 | 形态 | 关闭方式 |
| --- | --- | --- |
| 手机 < 768 px | 从底部滑出的抽屉，顶部有拖动条，最高 90dvh，内容在内部滚动，底部按钮固定并留出安全区 | 下滑、返回、Esc、点遮罩 |
| 窄屏和宽屏 ≥ 768 px | 屏幕正中的弹窗，四角圆角，缩放加淡入淡出；减少动画时只淡入淡出 | 右上角关闭按钮、返回、Esc、点遮罩 |

弹窗宽度：普通 560 px，宽内容（`isWide`，如房间编辑）720 px，确认框 440 px。打开状态下改变窗口宽度时，弹窗原地切换形态，已输入的内容和焦点不丢失。下拉菜单、日期弹层和 `?` 提示不属于弹窗，不受此规则约束。

## 导航

界面上没有返回按钮，返回依靠历史记录：Android 返回手势、浏览器后退、鼠标侧键和 Alt+←。

- 返回会先关闭最上层的弹窗。
- 会议室的标签页切换是历史记录。
- 预约表单有未保存内容时，离开前会确认。

每个页面也都能通过可见的导航进入和离开：会议室标签页、管理标签页或侧栏、品牌链接、账户菜单。
