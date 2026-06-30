# 本地评论系统 + Turnstile 发送认证

本站评论不使用 Formspree。评论通过 VPS 本地轻量 Python 服务保存到本地文件，并使用 Cloudflare Turnstile 防止脚本刷屏。

## 行为

- `comment` 必填。
- `nickname/name` 可选，不填就是匿名。
- `email` 可选，只保存在本地 JSONL 文件中，不在页面公开展示。
- 页面读取并展示同一篇文章下的公开评论内容。
- 提交评论必须通过 Cloudflare Turnstile 校验。
- 无数据库、无 Node.js、无外部评论服务；只有 Turnstile 用作人机校验。

## Hugo 配置

`hugo.toml` 里配置公开的 site key：

```toml
[params.comments]
  endpoint = '/api/comments'
  turnstileSiteKey = '你的 Turnstile Site Key'
```

当前占位值 `1x00000000000000000000AA` 是 Cloudflare 测试 site key，上线应替换为真实 key。

## VPS Secret 配置

Cloudflare 后台创建 Turnstile widget：

- Widget type: Managed
- Domains: `litwei.fun`, `tech.litwei.fun`, `game.litwei.fun`, `life.litwei.fun`

然后在 VPS 修改：

```bash
sudo systemctl edit litwei-comments
```

写入真实 secret：

```ini
[Service]
Environment=TURNSTILE_SECRET_KEY=你的_Turnstile_Secret_Key
```

重启：

```bash
sudo systemctl daemon-reload
sudo systemctl restart litwei-comments
sudo systemctl status litwei-comments
```

不要把真实 secret 写进 GitHub。


## 管理面板

访问：

```text
https://litwei.fun/admin/comments.html
```

需要 VPS 上配置 `COMMENT_ADMIN_TOKEN`。生成一个长随机 token：

```bash
openssl rand -hex 32
```

写入 systemd override：

```bash
sudo systemctl edit litwei-comments
```

示例：

```ini
[Service]
Environment=COMMENT_ADMIN_TOKEN=替换成你的长随机token
```

如果同时启用 Turnstile secret，可以写在同一个 override：

```ini
[Service]
Environment=TURNSTILE_SECRET_KEY=你的_Turnstile_Secret_Key
Environment=COMMENT_ADMIN_TOKEN=替换成你的长随机token
```

重启：

```bash
sudo systemctl daemon-reload
sudo systemctl restart litwei-comments
```

管理面板功能：

- 列出所有评论；
- 显示页面、昵称、邮箱、IP、User-Agent、时间；
- 按条删除评论；
- token 只保存在浏览器 localStorage，不进入 GitHub。

## 本地存储

默认保存到：

```text
/var/lib/litwei-blog/comments.jsonl
```

每行是一条 JSON，包含页面、昵称、邮箱、评论、IP、User-Agent 和时间戳。

## Nginx

HTTPS server block 中保留：

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

location /api/admin/comments {
    proxy_pass http://127.0.0.1:8787/api/admin/comments;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 16k;
}
```
