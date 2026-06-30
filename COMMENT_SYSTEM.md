# 评论系统

本站使用纯前端 Formspree 评论表单，无数据库、无自建 API、可直接部署到 Nginx 静态站。

## 当前行为

- `comment` 必填。
- `nickname/name` 可选，不填就是匿名。
- `email` 可选，只会随邮件发给站长，不在网页展示。
- 评论不会公开展示在页面上，只发送邮件通知站长。
- 保留 `_gotcha` honeypot 字段和频率提示，降低垃圾评论。

## 配置 Formspree

1. 在 Formspree 创建一个 form。
2. 在 Formspree 后台设置站长收件邮箱。
3. 替换 `hugo.toml`：

```toml
[params.formspree]
  endpoint = "https://formspree.io/f/YOUR_FORM_ID"
```

每条评论会提交：`page_url`、`page_title`、`timestamp`、`name`、`email`、`comment`。

## Hugo 复用 snippet

```go-html-template
{{ partial "comments.html" . }}
```

默认文章页会自动显示评论区。单篇文章关闭评论：

```yaml
comments: false
```
