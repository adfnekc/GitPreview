# 测试

本项目有两层自动化测试：单元测试和 E2E 冒烟测试。

## 快速开始

```bash
# 单元测试（快）
npm test

# GitHub 冒烟测试（需要配置）
npm run test:e2e:smoke
```

---

## 1. 单元测试 — `npm test`

用 Jest 测试 `utils.js` 中的纯函数。亚秒级，不需要浏览器。

- 配置：`jest.config.js`
- 测试：`tests/unit/utils.spec.js`

```bash
npm test              # 跑一次
npm run test:watch    # 监听模式
```

## 2. GitHub 冒烟测试 — `npm run test:e2e:smoke`

在真实 GitHub 页面上测试插件，验证插件在真实环境中是否正常工作。使用 Playwright 的 `launchPersistentContext` 加载浏览器扩展（扩展必须在持久化用户目录中才能运行）。

> 前置条件：已认证的 GitHub session + 包含音频文件的仓库。

### 配置步骤

**第一步：保存 GitHub 登录状态**

```bash
npm run test:e2e:setup
```

这会打开一个已加载插件的浏览器，跳转到 `github.com/login`。登录后回到终端按 Enter，session cookies 会保存到 `tests/e2e/github-auth-state.json`。

该文件已加入 `.gitignore` — 因为它包含你的 GitHub session token。

**第二步：设置测试 URL**

```bash
export TEST_BLOB_URL="https://github.com/你的用户名/你的仓库/blob/main/sample.mp3"
export TEST_TREE_URL="https://github.com/你的用户名/你的仓库/tree/main/audio"
```

指向任意包含音频文件（`mp3`、`wav`、`ogg`、`m4a`、`flac`、`aac`）的公有或私有仓库。

**第三步：运行**

```bash
npm run test:e2e:smoke
```

### 测试覆盖

| 测试项 | 验证内容 |
|-------|---------|
| blob 页面显示内联播放器 | 插件在文件页面自动加载播放器 |
| 预览按钮切换播放器 | Hide/Preview 按钮正常工作 |
| tree 页面显示预览按钮 | 音频文件在文件列表旁出现预览按钮 |
| 从 tree 页面打开弹窗预览 | 点击预览按钮 → 弹窗打开 + Escape 关闭 |
| Escape 键关闭内联播放器 | blob 页面键盘快捷键 |
| 播放器元素完整性 | 播放按钮、波形、音量、时间显示、文件名、文件大小 |

### 重新配置

GitHub session 过期后，重新执行 `npm run test:e2e:setup` 刷新状态即可。

---

## 文件结构

```
├── tests/
│   ├── unit/
│   │   └── utils.spec.js              ← Jest 单元测试
│   └── e2e/
│       ├── smoke-test.spec.js         ← GitHub 冒烟测试
│       ├── auth-setup.js              ← 认证状态保存脚本
│       └── github-auth-state.json     ← （已 gitignore）保存的 session
├── jest.config.js
├── playwright.config.js
└── utils.js
```
