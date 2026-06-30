# 本地评论系统

本站评论不再使用 Formspree。评论通过 VPS 本地轻量 Python 服务保存到本地文件。

## 行为

- `comment` 必填。
- `nickname/name` 可选，不填就是匿名。
- `email` 可选，只保存在本地 JSONL 文件中，不在页面公开展示。
- 页面会读取并展示同一篇文章下的公开评论内容。
- 无数据库、无外部评论服务、无 Node.js。

## 本地存储

默认保存到：

```text
/var/lib/litwei-blog/comments.jsonl
```

每行是一条 JSON，包含页面、昵称、邮箱、评论、IP、User-Agent 和时间戳。

## VPS 部署

```bash
sudo mkdir -p /opt/litwei-blog-comment-server /var/lib/litwei-blog
sudo cp server/comment_server.py /opt/litwei-blog-comment-server/comment_server.py
sudo cp server/litwei-comments.service /etc/systemd/system/litwei-comments.service
sudo chown -R www-data:www-data /var/lib/litwei-blog
sudo systemctl daemon-reload
sudo systemctl enable --now litwei-comments
sudo systemctl status litwei-comments
```

## Nginx

在 `litwei.fun`、`tech.litwei.fun`、`game.litwei.fun`、`life.litwei.fun` 的 HTTPS server block 里加入：

```nginx
location /api/comments {
    proxy_pass http://127.0.0.1:8787/api/comments;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 16k;
}
```

然后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Hugo 配置

```toml
[params.comments]
  endpoint = '/api/comments'
```
