# SZTU GPA Planner

面向深圳技术大学学生的 GPA 汇总、目标规划、学期模拟和单科成绩反推工具。

## 当前进度

- 已完成：后端计算核心与 HTTP API。
- 已完成：可交互的 React 前端（总览、课程、目标规划、学期模拟、单科反推）。
- 已完成：成绩截图的浏览器端 OCR 导入和人工核对流程。
- 已完成：SZTU 4.5 成绩映射、F/P-NP/补考处理。
- 已完成：目标 GPA 与单科成绩反推。
- 已完成：产品规范与功能区说明。
- 待实现：OCR 表格结构提高、培养方案毕业学分审核与云端同步。

## 本地运行

```bash
npm install
npm run dev
```

前端默认地址为 `http://localhost:5173`，后端为 `http://127.0.0.1:3000`，健康检查为 `GET /health`。

## 截图 OCR 说明

- 截图内容由浏览器中的 WebAssembly OCR 引擎处理，应用不会向用户索取教务系统帐号或密码。
- 首次使用会下载中英文识别模型；之后将由浏览器缓存。
- OCR 从不自动导入成绩：每一条记录都必须在“导入前核对”表格中确认。

## 质量检查

```bash
npm test
npm run typecheck
npm run build
```

后端接口说明见 [backend/README.md](backend/README.md)。
