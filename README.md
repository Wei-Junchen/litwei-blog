# Litwei Blog

一个轻量 Hugo 静态博客，用 Markdown 写作，GitHub Actions 构建并发布到 `gh-pages`，VPS 侧通过 Nginx 托管页面。

## 页面结构

- 首页：最新文章列表、站内搜索、终端风格介绍卡片。
- `tech/`：技术文章归档与列表。
- `game/`：游戏记录归档与列表。
- `life/`：生活随笔归档与列表。
- 文章页：正文、归档侧栏、评论区入口。

## 当前界面特性

- 黑绿终端风格视觉。
- 宽屏下主阅读区域有最大宽度，避免正文被拉得过宽。
- 宽屏外侧使用随机字符下落的代码雨背景。
- 窄屏下归档栏自动移动到正文上方，适配手机阅读。
- 支持站内搜索和文章归档折叠。

## 本地预览

需要安装 Hugo extended 版本。

```bash
./scripts/preview.sh
```

本地默认地址：

```text
http://localhost:1313/
```

## 新建文章

```bash
./scripts/new-post.sh tech "My Tech Note"
./scripts/new-post.sh game "My Game Note"
./scripts/new-post.sh life "My Life Note"
```

生成的文章默认是 `draft: true`，发布前需要改成 `draft: false`。

## 构建

```bash
./scripts/build.sh
```

构建流程会先执行 Markdown 规范化脚本，然后输出静态文件到 `public/`。

## 部署

`.github/workflows/deploy.yml` 会在推送到 `main` 分支时触发：

1. 安装 Hugo extended。
2. 执行 `python3 scripts/normalize-markdown.py && rm -rf public && hugo --minify`。
3. 将 `public/` 发布到 `gh-pages` 分支。
4. 通过 SSH 通知 VPS 同步 `gh-pages`。

也可以在 GitHub Actions 页面手动运行 `workflow_dispatch`。

## 评论配置

评论接口配置在 `hugo.toml`：

```toml
[params.comments]
  endpoint = '/api/comments'
  turnstileSiteKey = '...'
```

VPS 侧的评论服务配置参考 `server/` 和 `COMMENT_SYSTEM.md`。
