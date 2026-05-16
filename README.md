【github ci移植 总览 Dashboard】
测试链接 https://nodeparties.github.io/koipy-config/

# Koiboard 独立运行说明

`web/koiboard` 现在可以作为独立前端部署，Koipy 仅提供 API。

## 1. 启动 Koipy API

确保 Koipy 后端已启用 `webapp.enable=true`，并设置了 `webapp.password`。

把 https://nodeparties.github.io/ 加入 allowOrigin 内才可正常工作

## 2. 启动静态文件服务

在当前目录启动任意静态服务器（示例）：

```powershell
cd E:\koipy\web\koiboard
node dev-server.js 8080
```

浏览器访问：`http://127.0.0.1:8080`

## 3. 配置 API 地址

页面顶部有 `API 地址` 输入框：

- 留空：使用同源 API（适合同域反向代理）
- 跨域部署：填写 Koipy API 地址，例如 `http://127.0.0.1:8899`

你也可以用 URL 参数预设：

`http://127.0.0.1:8080/?apiBase=http://127.0.0.1:8899`

## 4. 跨域要求

如果前端和 Koipy API 不同源，需要在 Koipy 配置 `webapp.allowOrigins` 中加入前端来源（origin），例如：

- `http://127.0.0.1:8080`
- `http://localhost:8080`

否则浏览器会拦截跨域请求。
