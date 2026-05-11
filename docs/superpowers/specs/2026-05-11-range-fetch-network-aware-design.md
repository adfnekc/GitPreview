# RangeFetch + 网络感知加载 — 设计文档

## 问题

当前 GitPreview 通过 `fetch` → `arrayBuffer()` → `base64` 将整个文件一次性加载到内存中，存在以下问题：

- **大文件**：没有流式加载，必须等待整个文件下载完成才能播放或显示
- **蜂窝或热点网络**：没有网络感知能力，大文件可能消耗用户流量而不给出提示
- **未来的文件类型**：视频、ZIP 浏览器、Excel 查看器都需要分段加载

## 设计方案

### 目录结构

```
src/
├── lib/
│   ├── range-fetcher.ts      Range Request 工具类
│   └── network-aware.ts      网络检测 + 大文件警告对话框
├── background.ts             新增 fetchHead / fetchRange 消息
├── content.ts                注册 video handler
├── preview/
│   ├── handler.ts
│   ├── registry.ts
│   ├── ui.ts
│   ├── audio/index.ts        不变（保持全量加载）
│   ├── pdf/index.ts          不变
│   ├── video/index.ts        新增：流式视频预览
│   └── preview.css           视频相关样式
└── utils.ts
```

### 1. `src/lib/range-fetcher.ts`

封装备份 Range Request 逻辑的工具类，各 handler 自行决定是否使用。

```typescript
interface FileInfo {
  size: number;           // Content-Length
  acceptsRanges: boolean; // Accept-Ranges: bytes
  mimeType: string;       // Content-Type
}

class RangeFetcher {
  static getFileInfo(url: string): Promise<FileInfo>;
  static fetchChunk(url: string, start: number, end: number): Promise<ArrayBuffer>;
  static supportsRange(): boolean;
}
```

- `getFileInfo`：通过 background 发 HEAD 请求，提取 Content-Length、Accept-Ranges、Content-Type
- `fetchChunk`：通过 background 发 GET 请求 + `Range: bytes=start-end` 头，返回 ArrayBuffer
- `supportsRange`：检查浏览器是否支持 MediaSource（用于视频流式播放）

### 2. `src/lib/network-aware.ts`

网络检测和用户确认对话框。

```typescript
class NetworkAware {
  static isExpensiveConnection(): boolean;
  static exceedsThreshold(bytes: number, thresholdMB?: number): boolean;
  static shouldWarn(fileSize: number): boolean;
  static confirmLoad(filename: string, size: number): Promise<boolean>;
}
```

- `isExpensiveConnection()`：使用 `navigator.connection.effectiveType` 和 `navigator.connection.type`
  - 当 `type === 'cellular'` 或 `effectiveType === 'slow-2g' | '2g' | '3g'` 时返回 true
- `exceedsThreshold()`：默认阈值 5MB
- `shouldWarn()`：当**同时**满足昂贵网络且超过阈值时返回 true
- `confirmLoad()`：渲染 GitHub 风格覆盖层对话框，显示"在蜂窝网络下继续加载 (X MB)？"

### 3. Background Worker 改动（`src/background.ts`）

新增消息类型：

| Action | HTTP Method | Headers | Response |
|--------|------------|---------|----------|
| `fetchHead` | HEAD | — | `{size, acceptsRanges, mimeType}` |
| `fetchRange` | GET | `Range: bytes=\${start}-\${end}` | `{data: ArrayBuffer}` |

已有的 `fetchAudio` 和 `fetchBinary` 保持不变，保证向后兼容。

### 4. 视频 Handler（`src/preview/video/index.ts`）

新增的视频文件处理器：

```typescript
export const videoHandler: PreviewHandler = {
  extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg'],
  opensInNewTab: false,
  getBlobButtonSelector() { ... },
  openPreview(rawUrl, filename, container) { ... },
};
```

加载流程：
1. 调用 `RangeFetcher.getFileInfo(url)` 获取文件大小和 Range 支持情况
2. 如果 `NetworkAware.shouldWarn(size)` 返回 true，弹出确认对话框，用户取消则中止
3. 创建 `<video>` 元素，通过 MediaSource API + SourceBuffer 实现分块加载
4. 初始加载第一个约 1MB 的分块，追加到 SourceBuffer
5. 当播放进度接近未加载区域时，自动拉取下一个分块
6. 分块加载过程中显示进度指示器

### 5. Content Script 改动（`src/content.ts`）

- 导入并注册 `videoHandler`
- blob 页面自动打开视频预览（与音频行为一致）

### 6. UI 改动

- 视频预览容器（inline 或 modal）包含 `<video>` 元素
- 支持 GitHub 深色和浅色主题
- 分块加载中的 loading 指示器
- 网络警告对话框使用 GitHub 风格 UI

## 错误处理

- 服务器不支持 Range 请求：回退到全量加载（使用已有的 `fetchBinary`）
- 分块加载网络错误：重试一次，失败后显示错误信息
- 浏览器不支持 MediaSource：回退到渐进式下载（`<video>` 使用完整 blob URL）
- 播放过程中网络切换（如蜂窝切到 WiFi）：不影响已加载的数据

## 测试

- `RangeFetcher` 单元测试：mock background message 响应
- `NetworkAware` 单元测试：mock `navigator.connection`
- `videoHandler` 渲染测试：验证创建了 `<video>` 元素
- 已有 49 个单元测试必须继续通过
