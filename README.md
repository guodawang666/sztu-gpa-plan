# SZTU GPA Planner

面向深圳技术大学学生的 GPA 汇总、目标规划、学期模拟和单科成绩反推工具。

## 当前进度

- 已完成：后端计算核心与 HTTP API。
- 已完成：SZTU 4.5 成绩映射、F/P-NP/补考处理。
- 已完成：目标 GPA 与单科成绩反推。
- 已完成：产品规范与功能区说明。
- 待实现：前端可交互页面、截图 OCR 识别与本地数据保存。

## 本地运行

```bash
npm install
npm run dev
```

默认地址为 `http://127.0.0.1:3000`，健康检查为 `GET /health`。

## 质量检查

```bash
npm test
npm run typecheck
npm run build
```

后端接口说明见 [backend/README.md](backend/README.md)。
