# SZTU GPA Planner 公网部署说明

## 目标地址

- 主站：`https://gzkang.com`
- GPA 工具：`https://gpa.gzkang.com`
- Cloudflare Pages 项目名：`sztu-gpa-planner`

GPA 工具使用独立子域名，避免与个人网站的静态文件、路径和发布节奏互相影响。个人网站只需要增加一个跳转入口。

## 已完成的部署结构

- Vite/React 网页构建至 `frontend/dist`。
- Cloudflare Pages Functions 在 `functions/` 中提供 `/api/v1/*` 和 `/health`。
- 网页默认调用同域 API，不需要额外配置 API 地址或跨域规则。
- Pages Functions 直接复用后端的成绩映射、GPA、目标规划和单科反推代码，避免本地版与公网版出现两套公式。
- 截图 OCR、Excel/CSV 和复制粘贴解析继续在浏览器中完成。
- 成绩保存在用户当前浏览器的 localStorage；服务端不配置成绩数据库。

## 首次发布

请在仓库根目录执行：

```bash
npm install
npm run deploy:pages
```

Wrangler 会要求登录 Cloudflare。发布成功后，在 Cloudflare 控制台依次打开：

1. Workers & Pages
2. `sztu-gpa-planner`
3. Custom domains
4. Set up a domain
5. 输入 `gpa.gzkang.com`

如果 `gzkang.com` 的 DNS 已由同一个 Cloudflare 账号管理，Cloudflare 会自动创建或提示确认所需 DNS 记录。

## Cloudflare Git 自动发布设置

若希望以后推送代码自动更新，可在 Pages 中连接此 Git 仓库并设置：

- Build command：`npm ci && npm run build`
- Build output directory：`frontend/dist`
- Root directory：仓库根目录
- Node.js：20.19 或更高兼容版本

`functions/` 会与静态网页一起发布。不要给生产环境设置 `VITE_API_BASE_URL`，这样前端会使用同域 `/api/*`。

## 发布前检查

```bash
npm test
npm run typecheck
npm run build
```

发布后检查：

- 打开 `https://gpa.gzkang.com/health`，应显示 `status: ok`。
- 用电脑和手机分别打开主页。
- 粘贴一份成绩表并确认总览立即更新。
- 导入重复文件，确认出现去重提示。
- 刷新页面，确认当前设备中的成绩仍然存在。
- 在另一台设备打开时，应看到空白的新档案；当前版本不做跨设备同步。

## 隐私边界

- 不收集教务系统账号和密码。
- 成绩原始图片和 Excel 文件在浏览器中解析。
- 归一化后的课程记录会发送到同域函数进行即时计算，但应用不保存到数据库。
- 若未来加入跨设备同步，必须先增加用户认证、隐私说明、数据删除入口和数据库访问控制。
