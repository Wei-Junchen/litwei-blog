# 评论系统

本站使用纯前端 Formspree 评论表单，无数据库、无自建 API、可直接部署到 Nginx 静态站。

## 配置 Formspree

1. 在 Formspree 创建一个 form。
2. 在 Formspree 后台设置站长收件邮箱。
3. 替换 `hugo.toml`：

```toml
[params.formspree]
  endpoint = "https://formspree.io/f/YOUR_FORM_ID"
  captchaQuestion = "2 + 3 = ?"
  captchaAnswer = "5"
```

每条评论会提交：`page_url`、`page_title`、`timestamp`、`name`、`email`、`comment`、`captcha`。

## Hugo 复用 snippet

```go-html-template
{{ partial "comments.html" . }}
```

默认文章页会自动显示评论区。单篇文章关闭评论：

```yaml
comments: false
```
