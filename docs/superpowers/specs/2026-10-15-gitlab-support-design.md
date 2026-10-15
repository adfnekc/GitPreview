# GitLab 支持 — 设计文档

> 日期：2026-10-15

## 问题

GitPreview 目前只支持 GitHub。读者在 GitLab（gitlab.com 或自托管实例）上浏览仓库时，无法直接预览音频、视频、PDF、Office 文档和字体，仍需下载文件。

GitHub 相关内容散落在多个文件中（URL 转换、DOM 选择器、按钮插入位置），没有统一的扩展点。直接在里面加 `if (isGitLab())` 分支会导致站点逻辑进一步碎片化，且无法复用到第三个站点。

## 目标

1. 在 **gitlab.com** 上提供与 GitHub 完全一致的功能（全部 7 类预览、inline / modal 模式、键盘快捷键、流式视频、网络感知）。
2. 支持**自托管 GitLab 实例**：用户在扩展设置中添加实例地址并授权后，功能与 gitlab.com 一致。
3. 把站点差异收敛到 **Site Adapter** 抽象中，GitHub / GitLab 各自实现；预览引擎保持站点无关，便于后续扩展（Gitea、Bitbucket 等）。

## 非目标

- 不新增预览类型（图像查看器、CSV 等见 TODO.md，另行设计）。
- 不改变现有 GitHub 行为。
- 不为自托管实例自动发现/预置域名，必须由用户显式添加。

---

## 实测数据（gitlab.com）

| 项目 | 结果 |
| --- | --- |
| blob 页面 URL | `/{namespace}/{project}/-/blob/{ref}/{path}` |
| raw 文件 URL | `/{namespace}/{project}/-/raw/{ref}/{path}` |
| tree 页面 URL | `/{namespace}/{project}/-/tree/{ref}/{path}` |
| `HEAD /-/raw/...` | `content-type: text/plain`（二进制按实际类型）、`accept-ranges: bytes`、`content-disposition: inline` |
| Range 请求 | 返回 `206`，可分段 —— **视频流式加载可用** |
| CSP | `media-src 'self' data: blob: http: https:`、`img-src ... blob:`、`style-src 'self' 'unsafe-inline'` |
| tree 文件行 | `a[data-testid="file-row"]`，父容器 `[data-testid="file-row-container"]` |
| blob 页操作区 | `.file-actions`（位于 `.js-file-title` 内） |
| blob 页内容区 | `#fileHolder > .blob-viewer`（README 等渲染型为 `.file-content`） |

**CSP 结论**：GitLab 的 CSP 已允许 `blob:` 媒体与内联样式，且 raw 地址与页面同源，因此 GitLab **不需要**剥离 CSP，也**不需要** declarativeNetRequest 规则（GitHub 需要，是因为 `raw.githubusercontent.com` 是跨域）。`rules.json` 保持 GitHub 专用。

---

## 方案总览

引入 Site Adapter：每个站点实现一个对象，描述「如何识别页面 / 如何得到 raw 地址 / DOM 选择器 / 树页面按钮挂载方式」。`content.ts`、`ui.ts` 通过 `getActiveSite()` 取得当前站点适配器。

```
src/
├── sites/
│   ├── types.ts       SiteAdapter 接口 + SiteId
│   ├── github.ts      GitHub 适配器（从现有硬编码逻辑抽出）
│   ├── gitlab.ts      GitLab 适配器
│   └── index.ts       detectSite(url) / getActiveSite()
├── options/
│   ├── options.ts     自托管实例管理页逻辑
│   └── options.css    设置页样式
├── content.ts         改用 getActiveSite()
├── background.ts      动态注册自托管实例的 content script
├── preview/
│   ├── handler.ts     去掉 getBlobButtonSelector（站点适配器负责按钮位置）
│   ├── ui.ts          插入选择器来自 getActiveSite()
│   └── <handlers>/    删除 getBlobButtonSelector 样板
options.html           设置页
```

---

### 1. `src/sites/types.ts`

```ts
export type SiteId = 'github' | 'gitlab';

export interface SiteAdapter {
  id: SiteId;

  /** 当前 URL 是否属于本站点。 */
  matches(url: URL): boolean;

  /** 是否为单文件（blob）页面。 */
  isBlobPage(url: string): boolean;

  /** 是否为目录（tree）页面。 */
  isTreePage(url: string): boolean;

  /** 单文件页面 URL → 直链 raw URL。 */
  toRawUrl(blobUrl: string): string;

  /** 用于 SPA 导航去重：返回 blob 后的文件路径，非 blob 页返回 null。 */
  getBlobPath(url: string): string | null;

  /** 目录页面中文件链接的选择器。 */
  fileLinkSelector: string;

  /** 该链接是否指向文件（而非目录 / 锚点）。 */
  isFileLink(link: HTMLAnchorElement): boolean;

  /** 从文件链接提取展示用文件名。 */
  getLinkFilename(link: HTMLAnchorElement): string;

  /** 在目录行中把预览按钮挂到合适位置。 */
  mountTreeButton(link: HTMLAnchorElement, btn: HTMLElement): void;

  /** blob 页面按钮插入目标（按优先级）。 */
  blobButtonSelectors: string[];

  /** inline 预览容器插入目标（按优先级）；命中元素会被隐藏。 */
  inlineInsertSelectors: string[];

  /** 兜底：仓库主内容容器（inline 插入失败时使用）。 */
  repoContentSelectors: string[];
}
```

`getBlobButtonSelector` 从 `PreviewHandler` 中移除。PDF 在 GitHub 上原本想插到下载按钮前，这个偏好改由 GitHub 适配器的 `blobButtonSelectors` 首位表达。

### 2. `src/sites/github.ts`

行为与现状完全一致：

- `matches`：`hostname === 'github.com'`。
- `isBlobPage` / `isTreePage`：路径含 `/blob/`、`/tree/`（沿用现有 `utils.isBlobPage/isTreePage`）。
- `toRawUrl`：复用现有 `utils.convertToRawUrl`（`github.com` → `raw.githubusercontent.com`，`/blob/` → `/`）。
- `getBlobPath`：`/\/blob\/(.+?)(?:\?|#|$)/`（现有实现）。
- `fileLinkSelector`：`a[href*="/blob/"]`。
- `isFileLink`：恒真（GitHub 目录行只链接文件页）。
- `getLinkFilename`：`link.textContent?.trim() || href 末段`。
- `mountTreeButton`：若存在 `.react-directory-truncate` 则 append，否则 `link.after(btn)`。
- `blobButtonSelectors`：`['button[data-testid="download-raw-button"]', 'a[data-testid="raw-button"]', 'a[href*="/raw/"]', 'a#raw-url', '[class*="react-blob-header-actions"]', '.file-actions', '[data-testid="file-header"]', '.Box-header .d-flex', '.Box-header']`。
- `inlineInsertSelectors`：`['[class*="BlobViewContent-module__blobContentWrapper"]', '[class*="BlobContent-module__blobContentSection"]', '[data-testid="blob-content"]', '.blob-wrapper', '.Box-body', '.react-code-view', '[data-testid="file-content"]']`。
- `repoContentSelectors`：`['.repository-content', '[data-testid="repo-content"]', '[id="repo-content-pjax-container"]', '[class*="PageLayout-PageLayoutContent"]', 'main', '#js-repo-pjax-container']`。

### 3. `src/sites/gitlab.ts`

- `matches`：`/-/blob/`、`/-/tree/`、`/-/raw/` 之一出现在 `pathname` 中。（不校验 host，内容脚本只会注入到 gitlab.com 与用户授权的实例。）
- `isBlobPage`：`pathname.includes('/-/blob/')`。
- `isTreePage`：`pathname.includes('/-/tree/')`。
- `toRawUrl`：用 `new URL(url, location.origin)` 规范化，`pathname.replace('/-/blob/', '/-/raw/')`，清空 `search` / `hash`。
- `getBlobPath`：匹配 `/-/blob/(.+?)(?:\?|#|$)`。
- `fileLinkSelector`：`a[data-testid="file-row"]`。
- `isFileLink`：href 含 `/-/blob/`。
- `getLinkFilename`：优先 `link.querySelector('[data-qa-file-name]')?.getAttribute('data-qa-file-name')`，否则 href 末段（`decodeURIComponent`，去掉 query）。
- `mountTreeButton`：`link.closest('[data-testid="file-row-container"]')` 存在则 append，否则 `link.after(btn)`。
- `blobButtonSelectors`：`['.file-actions', '.js-file-title', '#fileHolder .file-title-flex-parent']`。
- `inlineInsertSelectors`：`['#fileHolder > .blob-viewer', '.blob-viewer', '.file-content']`。
- `repoContentSelectors`：`['#fileHolder', '#content-body', '.content', '.tree-holder', 'main']`。

`inlineInsertSelectors` 命中元素即为「插入前 + 隐藏」的目标：在 `.blob-viewer` 前插入预览容器并隐藏 `.blob-viewer`，`#fileHolder` 的标题栏（含我们插入的按钮）保持可见。**注意**：不要把 `#fileHolder` / `.file-holder` 放进 `inlineInsertSelectors`，否则会隐藏标题栏和预览按钮；它只作为 `repoContentSelectors` 的兜底（该兜底是 append，不隐藏）。

### 4. `src/sites/index.ts`

```ts
export function detectSite(url: URL): SiteAdapter | null;
export function getActiveSite(): SiteAdapter | null; // 基于 location.href，带缓存
```

`detectSite` 依次询问各适配器 `matches()`，返回首个命中者。`getActiveSite()` 缓存上一次的 `location.href` 结果，避免在 MutationObserver 高频回调中重复解析。

### 5. `src/content.ts` 改动

- 删除本地 `getBlobFilePath`，改用 `site.getBlobPath`。
- `addPreviewButtons`：`site.fileLinkSelector` + `site.isFileLink` + `site.getLinkFilename` + `site.mountTreeButton`。
- `handleBlobPage` / `insertBlobPageButton`：使用 `site.blobButtonSelectors`。
- `openPreview`：`site.toRawUrl(fileUrl)`。
- `isBlobPage` / `isTreePage` 调用改为 `site.isBlobPage` / `site.isTreePage`。
- `init` 开始时 `const site = getActiveSite()`；若为 `null` 直接返回（不认识的站点不注入任何 UI）。

### 6. `src/preview/ui.ts` 改动

- `insertInlineContainer`：选择器改为 `getActiveSite().inlineInsertSelectors`，失败后依次尝试站点 `repoContentSelectors`，最后 `document.body`。
- tree 兜底选择器（`.js-navigation-container` 等）保留在 `repoContentSelectors` 之后作为通用兜底。
- `insertBlobPageButton` 从 `handler.getBlobButtonSelector()` 改为读取 `site.blobButtonSelectors`。

### 7. `manifest.json` 改动

```jsonc
{
  "manifest_version": 3,
  "name": "GitPreview - GitHub & GitLab File Previewer",
  "version": "1.1.0",
  "description": "Preview various file types directly on GitHub and GitLab without leaving the page.",
  "permissions": ["storage", "activeTab", "declarativeNetRequest", "scripting"],
  "host_permissions": [
    "https://github.com/*",
    "https://raw.githubusercontent.com/*",
    "https://gitlab.com/*"
  ],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "content_scripts": [
    { "matches": ["https://github.com/*", "https://gitlab.com/*"], "js": ["content.js"], "css": ["content.css"], "run_at": "document_idle" }
  ]
}
```

`declarative_net_request` / `rules.json` 保持不变（仍仅针对 github.com）。

### 8. 自托管实例支持

**存储**：`chrome.storage.sync` 键 `gitlabInstances: string[]`，元素为 origin（如 `https://gitlab.example.com`）。

**options.html + src/options/options.ts**：
- 输入框 + 「添加」按钮：校验为合法 `http(s)` URL，取其 `origin`。
- 添加时调用 `chrome.permissions.request({ origins: [origin + '/*'] })`；用户拒绝则不保存并提示。
- 授权成功后写入 `gitlabInstances`。
- 列表展示已添加实例，支持移除：`chrome.permissions.remove` + `chrome.scripting.unregisterContentScripts({ ids })` + 更新存储。
- 样式写在 `src/options/options.css`，仿 GitLab/预览 UI 的简洁配色；不复用注入页面的 `content.css`（后者面向 GitHub/GitLab 页面 DOM）。

**background.ts**：
- `syncInstanceScripts()`：读取 `gitlabInstances`，对每个已授权 origin 调用
  `chrome.scripting.registerContentScripts([{ id: 'gitpreview-gitlab-' + host, matches: [origin + '/*'], js: ['content.js'], css: ['content.css'], runAt: 'document_idle', persistAcrossSessions: true }])`。
- 先 `getRegisteredContentScripts` 过滤已有 id，避免重复注册报错。
- 触发时机：`runtime.onInstalled`、`runtime.onStartup`、`storage.onChanged`（`gitlabInstances` 变化时）。
- 删除无用的 `getRawFileUrl` 消息分支与 background 内重复的 `convertToRawUrl`。

### 9. `vite.config.ts`

`rollupOptions.input` 增加 `options: resolve(__dirname, 'options.html')`；`options.html` 放在仓库根目录，`<script type="module" src="/src/options/options.ts">`。构建产物为 `dist/options.html`。

---

## 错误处理

- 站点无法识别（`getActiveSite()` 返回 null）：不注入任何 UI，直接返回。
- raw 地址转换失败（URL 非法）：`toRawUrl` 返回空字符串，`openPreview` 提前返回，不抛异常。
- 自托管实例未授权：动态注册跳过该实例，不报错。
- 自托管实例 CSP 更严格导致媒体加载失败：沿用现有 handler 的错误渲染（`renderErrorContent`），不额外处理。

## 测试

单元测试（vitest）：

- `tests/unit/sites.spec.ts`
  - `detectSite`：GitHub blob/tree、GitLab blob/tree/raw、自托管路径（含子路径前缀）、无关 URL 返回 null。
  - `gitlabAdapter.toRawUrl`：`/-/blob/` → `/-/raw/`；相对路径；带 query/hash；带子路径前缀的实例。
  - `gitlabAdapter.isBlobPage/isTreePage/getBlobPath`。
  - `githubAdapter.toRawUrl`：与现有 `utils.convertToRawUrl` 结果一致（回归保护）。
- 更新 `tests/unit/utils.spec.ts` 中注册的测试 handler（移除 `getBlobButtonSelector`）。
- `npm test` 全绿，`npm run build` 成功。

E2E 保持不变（GitHub）；GitLab 手工验证：gitlab.com 公共仓库的 blob 页 / tree 页各类型文件。

## 文档

- `README.md`：标题与说明加入 GitLab；Quick start 增加「在设置页添加自托管实例」；新增 Supported hosts 小节。
- `CONTRIBUTING.md`：更新「添加预览类型」示例（不再有 `getBlobButtonSelector`）；新增「添加新站点」小节，说明实现 `SiteAdapter` 并注册到 `src/sites/index.ts`。
- 版本号 `package.json` / `manifest.json` → `1.1.0`。

## 影响面 / 兼容性

- GitHub 现有行为不变（适配器抽取等价于原逻辑）。
- `utils.isBlobPage/isTreePage/convertToRawUrl` 保留导出，单元测试与 `ui.ts` 仍可使用。
- 新增 `scripting` 权限与可选主机权限，会触发扩展更新时的权限提示（可选权限不阻塞安装）。
