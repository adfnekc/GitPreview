# TODO — 待新增的文件预览类型

> 调研日期：2026-05-19 · 数据来源：GitHub Code Search API

## 已支持的文件类型

| 类型 | 扩展名 | 备注 |
| --- | --- | --- |
| 音频 | mp3, wav, ogg, m4a, flac, aac | |
| PDF | pdf | PDF.js Viewer |
| 视频 | mp4, webm, mov, avi, mkv | 分块流式加载 + 网络感知 |
| 字体 | ttf, otf, woff, woff2 | |
| Word | docx | mammoth.js |
| Excel | xlsx, xls | SheetJS |
| PowerPoint | pptx, ppt | pptx-preview |

## 调研方法

通过 GitHub Code Search API 查询各扩展名索引文件数。纯二进制格式（.zip, .mp4 等）不被索引，参考 Octoverse 已知数据补充。

## 候选文件类型（按 GitHub 频率排序）

| 类型 | 扩展名 | GitHub 索引数 | 实现成本 | 实用价值 | GitHub 现有预览 |
| --- | --- | ---: | --- | --- | --- |
| CSV 表格 | .csv, .tsv | >=8M（封顶） | ⭐⭐ 中 | ⭐⭐⭐ 高 | 基础表格，无搜索/排序 |
| SVG 图像 | .svg | >=5.5M（封顶） | ⭐ 低 | ⭐⭐⭐ 高 | 基础 `<img>`，无交互 |
| PNG 图像 | .png, .jpg, .gif, .webp, .ico, .bmp | ~1.1M+ | ⭐ 低 | ⭐⭐⭐ 高 | 基础 `<img>`，无缩放/全屏 |
| LaTeX 渲染 | .tex | ~609K | ⭐⭐⭐ 中 | ⭐⭐ 中 | 纯文本源码 |
| Jupyter 笔记本 | .ipynb | ~410K | — | — | ✅ GitHub 已支持，跳过 |
| Markdown | .md, .markdown | ~162K | — | — | ✅ GitHub 已渲染，跳过 |
| 二进制/HEX | .bin, .hex, .dat | ~153K | ⭐⭐ 中 | ⭐⭐ 中 | 无 |
| 压缩包浏览器 | .zip, .tar.gz, .tgz, .7z, .rar | 未索引 | ⭐⭐⭐ 中 | ⭐⭐⭐ 高 | 无（仅下载按钮） |
| 数据库 | .db, .sqlite, .sqlite3 | <2K | ⭐⭐⭐⭐ 高 | ⭐⭐ 中 | 无 |
| 图表 | .drawio, .vsdx | ~5K | ⭐⭐⭐ 中 | ⭐⭐ 中 | 无 |
| EBook | .epub | 未索引 | ⭐⭐ 中 | ⭐ 低 | 无 |
| CAD | .stl, .obj, .step, .gltf | 未索引 | ⭐⭐⭐⭐ 高 | ⭐ 低 | ✅ GitHub 已有 3D 查看器 |

## 推荐优先级

### 第一梯队

**1. 图像查看器**（png, jpg, gif, webp, svg, ico, bmp）

理由：GitHub 最高频二进制文件类型，当前仅 `<img>` 标签，无缩放/平移/全屏/元数据。
实现成本低，PPT 预览的 zoom/pan 机制可直接复用。
加 SVG 支持后覆盖范围巨大（SVG 索引 5.5M+）。

功能：缩放滑块、滚轮缩放、拖拽平移、全屏模式、图像元数据（尺寸/类型/大小）。

**2. CSV/TSV 表格查看器**

理由：索引数最高（8M+ 封顶），GitHub 现有渲染仅基础 HTML 表格。
功能：列排序、行搜索、固定表头、大型文件虚拟滚动。
可实现无额外依赖，纯 DOM 操作。

### 第二梯队

**3. 压缩包浏览器**（.zip 优先，.tar.gz 后续）

理由：发布包、依赖缓存常见，目前完全无预览。
先支持 .zip（JSZip 成熟库），tar 系列次之。

**4. 二进制/HEX 查看器**（.bin, .hex, .dat）

理由：~153K 索引文件，固件/数据文件常见。
功能：HEX dump、ASCII 旁显、offset 定位。

### 第三梯队

**5. LaTeX 渲染**（.tex）— 需 WASM LaTeX 引擎，实现成本高
**6. 数据库查看器**（.db, .sqlite）— sql.js（WASM）体积大，包大小飙升
**7. 图表查看器**（.drawio, .vsdx）— 依赖解析库，使用率中低
**8. EBook 阅读器**（.epub）— 有现成库但场景少

## 总结

下一迭代建议做 **图像查看器** + **CSV 表格查看器**。两者在 GitHub 上都是亿级文件量级（SVG 单项 5.5M+ 索引，CSV 8M+ 封顶），实现成本低，与现有架构契合度高（图像复用 PPT zoom/pan，CSV 复用 Excel 的 UI 模式）。
