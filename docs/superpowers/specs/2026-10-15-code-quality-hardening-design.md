# 代码质量加固 — 设计文档

> 日期：2026-10-15

## 背景

GitPreview 在功能上已支持 GitHub / GitLab 与 7 类文件预览，但在一次全量代码审计中发现了若干正确性缺陷、死代码、重复实现和结构问题。CI 只运行 `npm test`、`prettier` 和 `vite build`，**没有类型检查**，因此 `tsc` 报出的类型错误长期存在。本设计定义一轮“加固”改造：修复缺陷、引入类型与 lint 门禁、消除重复、拆分过大模块、补充测试，且**不改变任何用户可见行为**。

## 目标

1. 修复已知缺陷（`debounce` 失效、视频重复 HEAD、重试逻辑重复等）。
2. 让类型检查与 ESLint 成为强制门禁（本地脚本 + CI）。
3. 删除死代码与误导性配置。
4. 消除跨 handler 的重复实现（fetch / loading / download / mime / base64 / 实例配置）。
5. 拆分超长模块（`audio` 592 行、`powerpoint` 424 行、`content.ts` 384 行）。
6. 补充关键单元测试（registry、keyboard、mime、manifest 版本一致性）。

## 非目标

- 不新增文件预览类型，不新增站点。
- 不改变 DOM 结构 / 类名 / 预览交互行为。
- 不改变 `manifest.json` 的权限与匹配规则。
- 不引入运行时依赖（仅新增 devDependencies）。

## 审计问题清单

### 正确性

| # | 位置 | 问题 |
| --- | --- | --- |
| B1 | `content.ts:160` | `MutationObserver` 回调里 `debounce(addPreviewButtons, 200)()` 每次新建防抖函数，防抖完全失效 |
| B2 | `powerpoint/index.ts` | `tsc` 报 8 处错误（`mode:'scroll'` 非法、`stage/viewport` 可能为 null、未使用变量），CI 未拦截 |
| B3 | `video/index.ts:14,183` | `openVideoPreview` 与 `init` 各发一次 HEAD（`getFileInfo`）请求 |
| B4 | `video/index.ts:86-115` | `loadNextChunk` 内联重复了一遍相同的重试代码；多处 `fileInfo!` 非空断言 |
| B5 | `video/index.ts:118-137` | `initDirectFetch` 重新实现了 `range-fetcher.fetchBinary` |
| B6 | `audio/index.ts:520` | `this.arrayBuffer = null!` 类型欺骗 |
| B7 | `content.ts` | 生产环境每次 mutation / URL 轮询都 `console.log` |

### 死代码 / 误导

| # | 位置 | 问题 |
| --- | --- | --- |
| D1 | `utils.ts` | `extractFilenameFromUrl`、`clamp` 仅测试引用，生产未用 |
| D2 | `audio/index.ts` | `isAudioExtension`、`getCurrentPlayer`、`onError`、`updateDuration` 未使用 |
| D3 | `ui.ts` | `showError`、`showErrorModal` 未使用 |
| D4 | `registry.ts` | `getAllHandlers` 未使用 |
| D5 | `content.ts` / `background.ts` | `autoPreview`、`previewMode` 读取后从未使用；`getSettings` / `updateSettings` 消息无人发送 |

### 重复

| # | 位置 | 问题 |
| --- | --- | --- |
| R1 | `audio` / `video` | 各自实现了一遍“通过 background 取二进制” |
| R2 | 7 个 handler | `Loading ${filename}...` HTML 拷贝 7 份 |
| R3 | `audio` / `word` / `powerpoint` | 各写一遍 blob 下载逻辑 |
| R4 | `audio` | 自带 `formatTime`，`utils` 已有同实现 |
| R5 | `background.ts` | `fetchAudio` 与 `fetchBinary` 完全等价 |
| R6 | `background.ts` / `options.ts` | 各自定义 `gitlabInstances` key 与 script id 规则 |
| R7 | `background.ts` / `utils` / `pdf-viewer-loader` | 三处 base64 编解码 |
| R8 | `audio` | 自带 mime 映射表 |

### 结构 / 一致性

| # | 位置 | 问题 |
| --- | --- | --- |
| S1 | `audio/index.ts` 592 行 | 播放器类与 handler 混在一起 |
| S2 | `powerpoint/index.ts` 424 行 | 单个 350 行函数 + 大量模块级可变全局状态 + `any` |
| S3 | `content.ts` 384 行 | 入口、页面观察、按钮注入、预览编排混杂 |
| S4 | 多处 | 中英文注释混用（`video`、`powerpoint`） |
| S5 | `tsconfig.json` | 未开启 `noUnusedLocals` / `noUnusedParameters` / `noUncheckedIndexedAccess` |
| S6 | 根目录 | 无 ESLint |
| S7 | `manifest.json` / `package.json` | 版本号手工同步，无一致性校验 |

## 方案

### 1. 工具链

`tsconfig.json` 增加：`noUnusedLocals`、`noUnusedParameters`、`noImplicitReturns`、`noFallthroughCasesInSwitch`、`noImplicitOverride`、`noUncheckedIndexedAccess`。

`package.json` 脚本：

```json
{
  "typecheck": "tsc --noEmit",
  "lint:js": "eslint .",
  "lint": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" && eslint .",
  "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\""
}
```

新增 devDependencies：`eslint`、`typescript-eslint`、`jsdom`。

新增 `eslint.config.js`（flat config，`typescript-eslint` recommended + 规则）：

- `@typescript-eslint/no-unused-vars`（argsIgnorePattern `^_`）
- `@typescript-eslint/no-explicit-any`: error
- `@typescript-eslint/consistent-type-imports`: error
- `prefer-const`、`eqeqeq`、`no-var`
- `no-console`: warn，允许 `warn` / `error`（`src/lib/logger.ts`、`pdf-viewer-loader.ts` 例外），或统一走 `logger`

`.github/workflows/ci.yml`：lint job 增加 `npm run typecheck` 与 `npm run lint:js`。

### 2. 缺陷修复

- **B1**：把防抖函数在 `init` 时创建一次并传给 observer。
- **B2**：修正 `powerpoint` 类型（见 §5）；`tsc` 全绿。
- **B3/B4/B5**：新增 `src/preview/video/stream-player.ts`，内部只做一次 `getFileInfo`；`fetchChunkWithRetry(url, start, end, retries)` 收敛重试；用 `fetchBinary` 取代内联实现；移除 `!`。
- **B6**：`AudioPlayer` 的 `arrayBuffer` 变为 `ArrayBuffer | null`，`destroy()` 赋 `null`。
- **B7**：新增 `src/lib/logger.ts`：`debug(...)` 仅在 `import.meta.env.DEV` 下输出；替换 `content.ts` 的 `log`。

### 3. 删除死代码（D1–D5）

删除对应导出与测试；`DEFAULT_SETTINGS` 简化为 `{ keyboardShortcuts: true }`，移除 `getSettings` / `updateSettings` 消息分支。

### 4. 消除重复（R1–R8）

| 新增/复用 | 内容 |
| --- | --- |
| `src/lib/download.ts` | `downloadBuffer(buffer, filename, mime)` |
| `src/lib/mime.ts` | `getMimeType(filename)`（音频/视频/Office） |
| `src/lib/instances.ts` | `GITLAB_INSTANCES_KEY`、`instanceScriptId(origin)`、`getInstanceOrigins()` |
| `src/lib/debounce.ts` | `debounce(fn, wait)` |
| `preview/ui.ts` | `renderLoading(filename)`、`runContainerPreview(container, filename, task)` |
| `background.ts` | 单一 `fetchBinary` 动作；`arrayBufferToBase64` 改为从 `utils` 导入 |
| `audio` | 用 `fetchBinary`、`utils.formatTime`、`getMimeType` |

`runContainerPreview` 语义：

```ts
export async function runContainerPreview(
  container: HTMLElement,
  filename: string,
  task: () => Promise<void>,
): Promise<void> {
  container.innerHTML = renderLoading(filename);
  try {
    await task();
  } catch (err) {
    console.error('GitPreview preview error:', err);
    container.innerHTML = renderErrorContent((err as Error).message || 'Failed to load file');
  }
}
```

word / excel / font / powerpoint / audio 改为调用它（handlers 仍可自行做网络感知等前置逻辑）。

### 5. 拆分模块（S1–S3）

```
src/
  content.ts              ← 入口：注册 handler、引入 CSS、启动 controller
  controller.ts           ← 页面观察、URL 变化、按钮注入、openPreview/closeAll
  lib/
    debounce.ts  download.ts  instances.ts  logger.ts  mime.ts
  preview/
    ui.ts                 ← 增加 renderLoading / runContainerPreview / insertBlobPageButton
    audio/
      index.ts            ← handler + open/close（薄）
      player.ts           ← AudioPlayer 类
      waveform.ts         ← generateWaveformData / drawWaveform（纯函数）
    powerpoint/
      index.ts            ← 加载 buffer、渲染外壳、调用 viewer
      viewer.ts           ← 类型化 viewer：缩放/平移/翻页/全屏，返回 dispose()
```

`powerpoint/viewer.ts` 用局部结构类型替代 `any`：

```ts
interface PptxPreviewer {
  slideCount: number;
  htmlRender: { renderSlide(index: number): void };
  wrapper: HTMLElement;
  load(file: ArrayBuffer): Promise<unknown>;
  destroy(): void;
}
```

`viewer.ts` 暴露 `createPptxViewer({ stage, viewport, controls, previewer })` 返回 `{ dispose(): void }`，把模块级全局状态改为闭包内部状态，事件监听在 `dispose()` 中统一移除。

### 6. 测试

新增：`tests/unit/registry.spec.ts`、`tests/unit/keyboard.spec.ts`（jsdom 环境）、`tests/unit/mime.spec.ts`、`tests/unit/instances.spec.ts`、`tests/unit/manifest.spec.ts`（校验 `manifest.json.version === package.json.version`）。

更新：`tests/unit/utils.spec.ts` 删除已移除工具的用例，补充 `formatTime` 边界（现有）。

## 影响面 / 风险

- 全部为内部重构，DOM 类名、交互、权限、URL 规则不变。
- `noUncheckedIndexedAccess` 会带来一批索引访问修正（audio 波形、registry 等），逐处加保护即可。
- ESLint 首次接入可能触发较多告警，规则以 error 落地、`no-console` 为 warn。
- 新增 devDependencies 会更新 `package-lock.json`。
- 每个任务完成后必须通过 `npm test`、`npm run typecheck`、`npm run build`、`npm run lint`。
- 不执行 `git push`（见 `AGENTS.md`）。

## 验证

1. `npm test` 全绿。
2. `npm run typecheck` 无错误（含 powerpoint）。
3. `npm run build` 成功，`dist/` 产物齐全。
4. `npm run lint` 通过。
5. 用 Playwright 加载 `dist/` 复跑 GitLab blob/tree 与本地 GitLab 形状页面的预览冒烟测试，行为与改造前一致。
