# Tab Suspender Lite

一个极简的 Chrome 标签页冻结扩展：把暂时不用的标签页换成一张轻量占位页，点击占位页任意位置即可恢复。

目标是**最小实现、最小内存占用**：没有框架、没有字体、没有 content script、没有后台轮询、没有 `storage` 依赖。

![占位页预览](docs/preview.png)

## 特性

- **冻结当前标签页** `Ctrl+Shift+F`（macOS: `⌘+Shift+F`）
- **冻结当前窗口内除当前页外的所有标签页** `Alt+Shift+G`（macOS: `⌥+Shift+G`）
  - 注：`Ctrl+Shift+G` 是 Chrome 内置的「查找上一个」快捷键，Chrome 不允许扩展占用，因此默认改用 `Alt+Shift+G`；可以在 `chrome://extensions/shortcuts` 改成任意可用组合
  - 跳过当前标签页
  - 跳过所有固定（pinned）标签页
  - 跳过非 `http(s)` 页面（`chrome://`、`chrome-extension://`、`about:` 等）
  - 跳过已经是占位页的标签页
- **点击占位页任意位置恢复**（也支持 Enter / Space），恢复后自动重新加载原页面
- 占位页展示：站点图标（32px）、标题（超过 20 字符截断）、URL（超过 50 字符截断）
  - 标题与 URL 的完整内容放在原生 `title` 属性里，鼠标悬停可看全文；标签栏标题也保留完整标题
- 不主动丢弃占位页，交给 Chrome 自己的内存管理；占位页本身只有几 KB

## 安装（开发者模式）

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库根目录

快捷键可在 `chrome://extensions/shortcuts` 修改。

## 占位页 URL 结构

冻结后的标签页 URL 形如：

```
chrome-extension://<extension-id>/suspended.html?url=<encodeURIComponent(original-url)>&title=<encodeURIComponent(original-title)>
```

设计参考了 [Tab Suspender](https://chromewebstore.google.com/detail/tab-suspender/laameccjpleogmfhilmffpdbiibgbekf)，但去掉了 `time` 参数：

- **标签页自描述**：原 URL 和标题都编码在标签页自己的 URL 里，不需要 `chrome.storage`，也不怕 MV3 service worker 被随时终止；浏览器重启后 session restore 也能正确恢复。
- **无状态后台**：service worker 只负责「把标签页导航到占位页」；恢复完全由占位页自己做（`location.replace(targetUrl)`），后台不维护 tabId → URL 的映射，因此不需要处理标签页换 id、worker 重启等状态问题。
- **图标不写进 URL**：占位页加载时用 [`_favicon`](https://developer.chrome.com/docs/extensions/how-to/ui/favicons) 按目标 URL 向 Chrome 的本地 favicon 缓存取图，不访问原网站，也不生成 data URI。

## 设计取舍

| 选择 | 原因 |
| --- | --- |
| 用扩展占位页，而不是 `data:text/html` | 扩展无法把已有标签页导航到 `data:` URL；即使绕道新建标签页，`data:` 页面也是独立 opaque origin，会为每个挂起页单独占用一个渲染进程，内存反而更高，且拿不到 `chrome.*` API、无法用 `_favicon`。 |
| 不调用 `chrome.tabs.discard` 丢占位页 | 保留「切过去就能看到图标/标题/URL」的体验；占位页只有几 KB，Chrome 在内存压力下会自行丢弃它（丢弃后激活重载占位页，仍可点击恢复）。 |
| 无 content script / 无 storage | 极简，权限最小；代价是恢复后无法保留滚动位置和表单内容（浏览器重载页面的固有行为）。 |
| 无框架、无外部字体、无图片资源 | 占位页只有一个 HTML + 一个几 KB 的 JS，CSS 内联；favicon 直接指向 `_favicon` URL，不做 fetch/canvas。 |
| 恢复用 `location.replace` | 用原页面替换占位页，避免占位页留在前进/后退历史里。 |

## 权限

- `tabs`：读取标签页的 `url` / `title` / `pinned`，并更新标签页 URL。
- `favicon`：使用 `_favicon` 读取 Chrome 本地缓存的站点图标（与 `tabs` 一起声明不会额外弹权限警告）。

没有 host permissions，不会读取或修改任何网页内容。

## 目录结构

```
.
├── manifest.json      # MV3 清单：权限、快捷键、图标
├── background.js      # service worker：冻结逻辑 + 两个命令
├── suspended.html     # 占位页（内联 CSS，无外部依赖）
├── suspended.js       # 占位页逻辑：读 URL 参数、取图标、点击恢复
├── icons/             # 16/32/48/128 扩展图标
├── README.md
└── LICENSE
```

## 已知限制

- 只能冻结 `http(s)` 页面；`chrome://`、扩展页、`about:` 等会被跳过。
- “冻结其他标签页”只作用于**当前窗口**。
- 恢复是重新加载原 URL，不保留滚动位置、表单内容、SPA 内部状态（这是所有“换页式”冻结方案的共同代价）。
- 占位页被 Chrome 自动丢弃后，切换到该标签页会先重新加载占位页，再点击恢复。
- Chrome 156 上 `chrome.tabs.discard` 会让标签页换新 id（本项目不依赖 tabId，因此不受影响；如果你要加自动丢弃/统计功能需注意）。

## 开发

无构建步骤，改完文件后在 `chrome://extensions` 点扩展卡片上的「重新加载」即可。

调试提示：

- MV3 扩展页面的默认 CSP 禁止内联 `<script>`，所以占位页逻辑必须放在 `suspended.js` 里（CSS 可以内联）。
- 占位页的 favicon 用 `chrome.runtime.getURL('/_favicon/')` 构造，离开扩展上下文（如普通网页）无法使用。
- `background.js` 末尾把两个冻结函数挂到了 worker 的全局对象上，便于在 service worker 控制台里手动调用测试。

## 已验证行为（Chrome 156 / Windows）

- 两个命令成功绑定（`Ctrl+Shift+F`、`Alt+Shift+G`；`Ctrl+Shift+G` 被 Chrome 保留而无法绑定）
- 冻结后 URL 为 `suspended.html?url=...&title=...`，不含 `time`
- 占位页：完整标题写入 `document.title`，可见标题截断到 20 字符、URL 截断到 50 字符，完整值在 `title` 属性
- 图标来自 `_favicon`（32×32），`<link rel=icon>` 与 `<img>` 使用同一 URL，标签栏图标正常
- 点击占位页任意位置可以恢复；`Enter` / `Space` 也可
- “冻结其他标签页”跳过当前页、固定页、非 `http(s)` 页与已冻结页；重复执行返回 0
- 对非 `http(s)` 页面执行“冻结当前页”为空操作
- 扩展没有 `storage` 权限（`chrome.storage` 为 undefined），后台不保存任何状态

## 后续可选

- 自动冻结（空闲计时 / 内存压力 / 系统内存低）
- 滚动位置与表单内容恢复
- 白名单、按域名规则
- 右键菜单、弹窗面板
- i18n

## License

[MIT](LICENSE)

> 图标素材取自 Tab Suspender 扩展（Chrome 应用商店）的安装包，仅用于本地/个人项目；如需公开发布，请替换为自己的图标。
