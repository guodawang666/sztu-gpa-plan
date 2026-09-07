# SZTU GPA Planner 宝塔部署说明

## 部署结果

- 公开地址：`https://gpa.gzkang.com`
- 前端：宝塔 Nginx 静态网站
- 后端：Node.js / Fastify，仅监听 `127.0.0.1:3000`
- 接口：Nginx 将同域 `/api/*` 和 `/health` 转发给后端
- 数据：成绩保存在访问者当前浏览器，后端不配置成绩数据库

## 一、域名解析

在域名 DNS 管理中新增：

- 类型：`A`
- 主机记录：`gpa`
- 记录值：你的宝塔服务器公网 IPv4

等待解析生效后，`gpa.gzkang.com` 应指向宝塔服务器。

## 二、上传程序

将 `sztu-gpa-planner-baota.zip` 上传到：

`/www/wwwroot/gpa.gzkang.com/`

然后在宝塔文件管理中解压。解压后应看到：

```text
gpa.gzkang.com/
├── public/
├── api/
├── ecosystem.config.cjs
├── nginx-gpa.gzkang.com.conf
└── DEPLOYMENT.md
```

## 三、启动后端

推荐在宝塔软件商店安装“Node.js 版本管理器”或“Node 项目管理器”，使用 Node.js 20.19 或 22.12 以上版本。

在 `/www/wwwroot/gpa.gzkang.com/api` 中安装生产依赖：

```bash
npm install --omit=dev
```

两种启动方式任选其一：

### 宝塔 Node 项目管理器

- 项目目录：`/www/wwwroot/gpa.gzkang.com/api`
- 启动文件：`dist/server.js`
- 项目端口：`3000`
- 运行用户：建议 `www`
- 环境变量：`HOST=127.0.0.1`、`PORT=3000`、`NODE_ENV=production`

### PM2

在 `/www/wwwroot/gpa.gzkang.com` 中执行：

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## 四、创建宝塔网站

在“网站 → 添加站点”中填写：

- 域名：`gpa.gzkang.com`
- 根目录：`/www/wwwroot/gpa.gzkang.com/public`
- PHP：纯静态

进入该站点的“配置文件”，把仓库提供的 `nginx-gpa.gzkang.com.conf` 中两个 `location` 反向代理段加入宝塔生成的 `server` 块。也可以把模板完整内容作为参照，但要保留宝塔自动生成的 SSL 配置。

关键代理规则是：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
}

location = /health {
    proxy_pass http://127.0.0.1:3000/health;
}
```

保存前先点击宝塔的配置检查，确保 Nginx 语法正确。

## 五、开启 HTTPS

进入“网站 → gpa.gzkang.com → SSL”，申请 Let's Encrypt 证书并开启强制 HTTPS。证书申请前必须确保 DNS 已生效且服务器的 80、443 端口可访问。

## 六、上线验收

1. 打开 `https://gpa.gzkang.com/health`，确认显示 `status: ok`。
2. 打开 `https://gpa.gzkang.com`，确认蓝白主页加载。
3. 粘贴两条样例成绩：2 学分 81 分、4 学分 75 分。
4. 一键通过审核并导入，应显示质量分 `19.00`、GPA 学分 `6.00`、累计 GPA `3.17`。
5. 打开总览，确认数据与课程页面一致。
6. 用手机浏览器重复打开和导入，无需安装插件。

## 更新版本

每次更新先在开发电脑执行测试和构建，再重新生成上传包。上传时替换 `public` 和 `api/dist`，然后重启 Node 项目。不要删除服务器上的 SSL 配置。
