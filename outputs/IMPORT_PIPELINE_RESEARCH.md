# SZTU GPA Planner 成绩导入方案调研

> 调研日期：2026-09-07  
> 范围：只使用项目官方 GitHub 仓库、官方文档、官方发布页和 GitHub 官方 API。  
> 目标：判断是否应以结构化 Excel/CSV 或带文本层 PDF 替代截图 OCR，作为深圳技术大学 GPA Planner 的主要导入方式。

## 结论先行

**应该替换主次顺序，但不需要删除截图功能。** 推荐把导入管线改成：

1. **一级入口：CSV / XLSX 结构化成绩单**——字段和值本来就是机器可读数据，不发生字符识别错误；在用户能从教务系统导出表格时，这是精度最高、成本最低的方式。
2. **二级入口：带文本层的电子成绩单 PDF**——先用 PDF.js 在浏览器读取文字及坐标，不做 OCR；若能提取出足够文本，再按表头和坐标恢复行列。
3. **三级兜底：扫描 PDF / 截图**——只有文件没有可用文本层时才进入 OCR；生产方案优先考虑后端 PaddleOCR PP-StructureV3，RapidOCR 可作较轻量的纯文字识别引擎。
4. **所有入口统一进入同一套审核层**——保留原始行、字段映射、规则校验、重复检测和替换前确认，不能把“解析成功”直接等同于“成绩正确”。

建议第一阶段采用 **SheetJS CE（XLS/XLSX）+ Papa Parse（CSV）+ PDF.js（文本型 PDF）**，全部在浏览器本地解析；截图继续保留为“兼容导入（精度较低）”。只有实际样本证明扫描件仍是高频来源时，再单独部署 **PaddleOCR PP-StructureV3** 后端服务。

## 为什么结构化文件会明显更准确

截图 OCR 同时要解决字符识别、列位置恢复、跨图分页、中文/英文混排、小数点、`IB` 与 `1B` 等视觉歧义。任何一层出错都会污染 GPA。XLSX/CSV 直接提供单元格值和行列关系；文本型 PDF 至少提供真实 Unicode 文本，PDF.js 的 `getTextContent()` 还能返回页面文本内容，避免重新“猜字符”。[SheetJS 导入教程](https://docs.sheetjs.com/docs/getting-started/examples/import/)展示了把工作簿读取为二维数组的方式；[PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html#getTextContent)和[官方示例](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)展示了直接读取 PDF 文本内容。

这并不意味着结构化文件可以跳过审核：成绩单可能有多行表头、合并单元格、不同导出模板、公式结果、空白学期或缺失考试性质。因此正确设计是“确定性解析 + 规则校验 + 批量审核”，而不是“无条件自动导入”。

## 候选方案总览

| 项目 | 截至 2026-09-07 的维护证据 | 许可证 | 浏览器 / 后端适配 | 中文与表格能力 | 成本判断 | 对本项目的建议 |
|---|---|---|---|---|---|---|
| SheetJS CE | GitHub 镜像最后推送 2024-04-18；官方说明源码已迁出 GitHub；官方文档 2026-08-03 更新，当前分发版 0.20.3 | Apache-2.0 | 浏览器、Web Worker、Node 均适合 | 中文是单元格字符串，无 OCR 问题；可读工作表、合并区域和二维单元格 | 中等；完整浏览器脚本约 0.95 MB（未压缩传输口径） | **采用，负责 XLS/XLSX**；固定版本并 vendoring，不依赖 npm 上的旧包 |
| ExcelJS | 最新发布 v4.4.0：2023-10-19；最后推送 2025-01-21 | MIT | 浏览器有预构建入口，Node 有流式读取 | 正常读取 Unicode/中文和 XLSX 行列；偏向完整工作簿读写 | 中高；依赖 JSZip、流、CSV 等，导入专用场景较重 | **不作为首选**；可作 SheetJS 的替代验证器或未来需要复杂写回时使用 |
| Papa Parse | v5.7.0：2026-08-24；最后推送 2026-09-01 | MIT | 浏览器、Web Worker、Node 流均适合 | 中文 UTF-8 文本可直接保留；处理分隔表格，不处理 XLSX | 很低；无运行时依赖，官方 min 文件约 19 KB | **采用，负责 CSV/TSV** |
| Mozilla PDF.js | v6.3.289：2026-08-29；最后推送 2026-09-06 | Apache-2.0 | 浏览器原生优势，Worker 分离；也支持 Node | 能保留 PDF 文本层中的中文；不是 OCR，也不保证自动恢复表格 | 中高；核心与 Worker 需独立加载，按页处理 | **采用，负责文本型 PDF**；文本不足时才转 OCR |
| IBM Docling | v2.126.0：2026-09-04；最后推送同日 | MIT；模型另看各自许可 | Python 后端；不适合塞进当前浏览器包 | PDF/XLSX/CSV/图片、OCR、布局和 TableFormer 均支持；中文效果取决于 OCR 引擎 | 高；官方 slim 规划估算基础约 50 MB，完整本地模型可达约 2.5–2.8 GB | **暂不进入 MVP**；多模板复杂电子文档增多时再评估 |
| PaddleOCR / PP-StructureV3 | v3.7.0：2026-06-11；最后推送 2026-07-22 | Apache-2.0 | 最适合独立 Python/推理后端；不建议直接加入 React 主包 | 明确支持中文 OCR、布局与表格结构；PP-StructureV3 是当前推荐代际 | 高；由多个检测、识别、版面和表格模型组成，可选 CPU/GPU | **截图/扫描件首选后端兜底**；不是结构化文件的替代品 |
| RapidOCR | v3.9.2：2026-07-21；最后推送 2026-09-07 | Apache-2.0；OCR 模型版权归原模型方 | Python + ONNX/OpenVINO/Paddle 等后端，离线部署方便 | 默认中英文文字识别；核心强项是快速 OCR，不是完整表格结构恢复 | 中；比完整 Docling/PP-Structure 更轻，仍需模型与推理运行时 | **可作轻量 OCR 引擎**；不能单独解决成绩表行列错配 |

维护日期来自对应 [GitHub repository API](https://docs.github.com/en/rest/repos/repos#get-a-repository) 的 `pushed_at` 与官方发布页；逐项链接见下文。

## 逐项分析

### 1. SheetJS Community Edition

**维护与许可证。** [GitHub 镜像 README](https://github.com/SheetJS/sheetjs/blob/github/README.md)明确说明新源码仓库迁到 `git.sheetjs.com`，GitHub 只保留截至特定提交的镜像；[GitHub API](https://api.github.com/repos/SheetJS/sheetjs)显示该镜像最后推送为 2024-04-18。因此不能把 GitHub 无新提交误判为项目停止维护。当前[官方安装文档](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)仍指定 0.20.3，并说明官方 CDN 才是权威分发源；[许可证](https://github.com/SheetJS/sheetjs/blob/github/LICENSE)为 Apache-2.0。

**适配性。** 官方教程直接展示 `ArrayBuffer -> XLSX.read -> sheet_to_json({ header: 1 })`，与当前 React/Vite 前端天然匹配。对 SZTU 成绩单最重要的不是样式写入，而是：多工作表枚举、二维原始值、合并区域、日期/数字类型和 XLS/XLSX 兼容，这些都适合 SheetJS CE。[浏览器安装文档](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)还支持 Web Worker，并建议 vendoring。

**风险。** 当前版本不应直接写成普通 `npm install xlsx`，因为官方明确说明 npm registry 上版本不是当前权威版本。应固定 0.20.3 tarball、保留许可证与完整性哈希，最好把审核过的发行文件 vendoring 到项目中。GitHub 与实际开发仓库分离也会增加供应链审查成本。

**建议：采用。** 它最适合承担 `.xlsx/.xls` 的本地读取，但应用自己的“成绩表头识别与字段映射”仍需单独实现。

### 2. ExcelJS

**维护与许可证。** [最新发布页](https://github.com/exceljs/exceljs/releases/tag/v4.4.0)为 v4.4.0，发布于 2023-10-19；[GitHub API](https://api.github.com/repos/exceljs/exceljs)显示最后推送为 2025-01-21。截至本次调研已明显缺少近期发布。其[许可证](https://github.com/exceljs/exceljs/blob/master/LICENSE)为 MIT。

**适配性。** [package.json](https://github.com/exceljs/exceljs/blob/master/package.json)声明浏览器构建 `dist/exceljs.min.js`，并依赖 JSZip、fast-csv、streams 等；官方 README 说明可读取、修改和写入 XLSX/JSON。中文单元格属于 Unicode 数据，不需特殊 OCR。Node 侧还提供大型 XLSX 的流式读取，但当前 GPA 成绩单只有几十至数百行，用不到这一优势。

**建议：暂不采用。** ExcelJS 功能偏完整工作簿编辑，当前仅导入时成本高于收益，且维护新鲜度弱于其他候选。若未来需要生成带样式的官方模板、修改后再写回 XLSX，可重新比较。

### 3. Papa Parse

**维护与许可证。** [v5.7.0 发布页](https://github.com/mholt/PapaParse/releases/tag/5.7.0)显示 2026-08-24 发布，[GitHub API](https://api.github.com/repos/mholt/PapaParse)显示 2026-09-01 仍有推送；[package.json](https://github.com/mholt/PapaParse/blob/master/package.json)声明 MIT、浏览器构建、Web Worker 与流式大文件支持。

**适配性。** [官方 README](https://github.com/mholt/PapaParse)列出自动分隔符检测、表头模式、逐块处理、暂停/终止和零依赖。它不会识别视觉表格，但这正是 CSV 的优势：文件已经给出稳定列结构。中文 CSV 应默认按 UTF-8 处理，同时兼容 UTF-8 BOM；遇到 GBK/ANSI 文件应提示用户另存为 UTF-8，而不是悄悄产生乱码。

**建议：采用。** 它应作为 CSV/TSV 的专用轻量入口，而不是让 SheetJS 同时包办所有格式。

### 4. Mozilla PDF.js

**维护与许可证。** [v6.3.289](https://github.com/mozilla/pdf.js/releases/tag/v6.3.289)于 2026-08-29 发布，[GitHub API](https://api.github.com/repos/mozilla/pdf.js)显示 2026-09-06 仍有推送，活跃度很高；仓库采用 [Apache-2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE)。

**适配性。** PDF.js 是浏览器优先的 PDF 解析/渲染库。`PDFPageProxy.getTextContent()` 返回页面文本内容，官方 Node 示例也逐页读取 `items`。对于教务系统直接生成、可选中文字的 PDF，这比 OCR 精确得多。中文支持取决于 PDF 内是否有正确字符映射：有文本层时可直接得到中文；只有扫描图像时，PDF.js 不会凭空识别文字。

**表格限制。** PDF 本质上常只保存“把某段文字画在某坐标”的指令，并不一定保存行列语义。实现时要用文本项的坐标聚类为行、依据表头 x 区间映射列，并对列错位做规则校验。带 tagged-table 结构的 PDF 可以利用结构树，但不能假定所有 SZTU PDF 都带标签。

**建议：采用。** 先检测文本层：若字符数量、课程代码命中率和表头命中率达到阈值，则走确定性解析；否则明确提示“这是扫描版 PDF，将进入 OCR，准确率较低”。

### 5. IBM Docling

**维护与许可证。** [v2.126.0](https://github.com/docling-project/docling/releases/tag/v2.126.0)于 2026-09-04 发布，[GitHub API](https://api.github.com/repos/docling-project/docling)显示同日仍有推送；[官方仓库](https://github.com/docling-project/docling)采用 MIT，但模型许可需逐项核对。

**适配性。** [支持格式文档](https://github.com/docling-project/docling/blob/main/docs/usage/supported_formats.md)覆盖 PDF、XLSX、CSV 和图片；[模型目录](https://github.com/docling-project/docling/blob/main/docs/usage/model_catalog.md)包含布局检测、TableFormer 表格结构和多种 OCR 引擎；[CLI 文档](https://github.com/docling-project/docling/blob/main/docs/reference/cli.md)允许选择 PDF 后端、OCR 引擎及准确/快速表格模式。

**成本。** 它是 Python 文档理解栈，不适合进入当前 React 浏览器 bundle。[docling-slim 官方规划](https://github.com/docling-project/docling/blob/main/.plans/active/docling-slim.md)给出的估算是基础约 50 MB、完整本地模型约 2.5–2.8 GB。对格式固定、字段很少的成绩单来说，直接引入属于过度配置。

**建议：暂缓。** 当未来要统一处理多个学校、复杂 PDF、DOCX 和扫描材料时，它的统一文档模型才有明显价值。若采用，应独立成受限的 Python 服务，设置文件大小、页数、超时和沙箱，不与主 Node API 进程混装。

### 6. PaddleOCR / PP-StructureV3

**维护与许可证。** [v3.7.0 发布页](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0)显示 2026-06-11 发布 PP-OCRv6，[GitHub API](https://api.github.com/repos/PaddlePaddle/PaddleOCR)显示最后推送 2026-07-22；仓库采用 [Apache-2.0](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)。

**能力。** [PP-StructureV3 官方文档](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.en.md)明确覆盖 OCR、版面检测、表格识别与结构化输出；旧 PP-Structure 页面也明确建议转用第三代。[v3.7.0 发布说明](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.7.0)称 PP-OCRv6 单模型覆盖中文、英文等 50 种语言，并给出 tiny/small/medium 三档参数规模。

**适配性与成本。** 官方提供 CPU/GPU 和服务部署方案，适合后端而非直接塞入 Vite 页面。完整 PP-StructureV3 由多条子管线组成，启动、模型下载、内存和部署复杂度显著高于纯 JS 解析。它能减少截图的字符和表格结构错误，但不能保证对 SZTU 特定列名、跨页重复和补考语义零错误，仍需本项目规则层校验。

**建议：截图/扫描件的首选升级。** 在有足够真实匿名样本建立回归集之前，不应立刻替换现有 OCR。先实现结构化入口，再用同一批标注样本比较 Tesseract.js 与 PP-StructureV3 的“整行完全正确率”和最终 GPA 误差。

### 7. RapidOCR

**维护与许可证。** [v3.9.2](https://github.com/RapidAI/RapidOCR/releases/tag/v3.9.2)于 2026-07-21 发布，[GitHub API](https://api.github.com/repos/RapidAI/RapidOCR)显示 2026-09-07 当天仍有推送；[官方 README](https://github.com/RapidAI/RapidOCR)说明工程代码采用 Apache-2.0，OCR 模型版权归原模型方。

**能力。** RapidOCR 将 OCR 模型部署到 ONNX Runtime、OpenVINO、Paddle、TensorRT 等运行时，默认支持中英文，定位是快速、跨平台、离线的文字检测与识别。它适合替换较慢的文字识别引擎，但项目本身不是成绩表的业务解析器，也不能单靠文字框彻底解决“某个分数属于哪一列/哪门课”。Docling 也把 RapidOCR列为可选轻量 OCR 引擎，而把表格结构识别交给 TableFormer。

**建议：条件采用。** 如果 PP-StructureV3 部署过重，可用 RapidOCR 输出“文本 + 位置”，再接 SZTU 专用列解析；但必须拿真实成绩截图验证整行正确率，不应仅比较字符置信度。

## 推荐目标架构

```text
用户文件
├─ CSV / TSV ── Papa Parse（浏览器 Worker） ───────────┐
├─ XLS / XLSX ─ SheetJS CE（浏览器 Worker） ──────────┤
├─ 文本型 PDF ─ PDF.js 文本项 + 坐标聚类 ─────────────┤
└─ 图片 / 扫描 PDF ─ OCR 兜底                         │
                     ├─ 近期：现有截图导入，标低精度    │
                     └─ 后续：PaddleOCR 后端            │
                                                        ▼
        SZTU 表头映射 -> 字段规范化 -> 规则校验 -> 去重 -> 审核预览
                                                        ▼
                            用户确认“追加”或“替换全部成绩”
```

### 统一中间数据

每一条记录除现有课程字段外，应保留导入证据：

```ts
type ImportedCourseCandidate = {
  sourceType: "CSV" | "XLSX" | "PDF_TEXT" | "OCR";
  sourceFileName: string;
  sourceSheet?: string;
  sourcePage?: number;
  sourceRow?: number;
  rawCells?: unknown[];
  rawText?: string;
  semester?: string;
  courseCode?: string;
  courseName?: string;
  credits?: number;
  score?: number;
  grade?: string;
  gradePoint?: number;
  examType?: "NORMAL" | "MAKEUP" | "RETAKE";
  confidence: "EXACT" | "MAPPED" | "INFERRED" | "OCR";
  issues: string[];
};
```

结构化来源的 `confidence` 表示字段映射确定性，不要伪造 OCR 式百分比。最终审核页应能回看原始单元格/页码，便于用户定位错误。

### 表头识别与验证

1. 逐工作表扫描前 30 行，找包含至少三个核心别名的表头行。
2. 别名至少覆盖：`课程代码/课程编号`、`课程名称`、`学分`、`成绩`、`等级`、`绩点`、`学年学期/开课学期`、`考试性质`、`补重学期`。
3. 不依赖固定列号；先映射表头，再读数据行。
4. 数值型成绩和等级必须按 SZTU 映射互相校验；冲突时禁止一键通过。
5. `P/通过`、`NP/不通过`、零学分、F、补考和重修继续使用已经确认的领域规则处理。
6. 课程编号缺失时不得自动合并；有编号时，重复键至少包含学期、课程编号、考试性质和成绩，防止误删合法的 F + 补考记录。
7. 导入完成前显示校验总计：课程条数、GPA 学分、质量点、计算 GPA。若用户提供的成绩单有官方汇总值，必须先对账才允许“全部替换”。

## 分阶段实施建议

### Phase 1：先解决 80% 精度问题

- 新增 `.csv/.tsv/.xlsx/.xls` 拖拽入口。
- Papa Parse 处理 CSV/TSV；SheetJS CE 处理 Excel。
- 复用现有审核表、一键审核、重复检测和安全替换流程。
- 用脱敏的 SZTU 导出文件建立固定测试样本；验收标准不是“能读出来”，而是关键字段逐格一致、最终 GPA 完全一致。

### Phase 2：支持电子成绩单 PDF

- 使用 PDF.js 检测并提取文本层。
- 通过 y 坐标聚类行、x 坐标映射列；保存页码和原始文本项。
- 文本为空或表头/课程代码命中率过低时，不猜测，转入 OCR 兜底提示。

### Phase 3：按数据决定是否部署 OCR 后端

- 先收集并脱敏 20–50 份不同分辨率、分页和设备来源的真实截图/扫描件。
- 比较现有 Tesseract.js、RapidOCR、PaddleOCR PP-StructureV3。
- 关键指标：课程整行完全正确率、漏行率、错列率、需要人工修改的行数、最终 GPA 与官方值误差；平均字符置信度只能作为辅助指标。
- 若 PaddleOCR 明显胜出，再部署独立 OCR 服务，并设置文件大小、页数、并发、超时、临时文件清理和隐私说明。

## 最终采用清单

- **立即采用：Papa Parse 5.7.x**——CSV/TSV 主入口，轻量且维护活跃。
- **立即采用：SheetJS CE 0.20.3（固定版本并 vendoring）**——XLS/XLSX 主入口；接受其 GitHub 镜像非主仓库的供应链现实。
- **第二步采用：PDF.js 6.3.x（固定小版本）**——只解析带文本层 PDF，不把它宣传成 OCR。
- **暂不采用：ExcelJS**——功能重叠、包较重、维护节奏偏慢。
- **按需采用：PaddleOCR PP-StructureV3**——扫描件/截图的后端高精度兜底。
- **备选：RapidOCR**——轻量 OCR 运行时，但必须搭配专用表格/字段解析。
- **暂不采用：Docling**——能力强但对单校成绩单场景过重；未来多学校、多格式平台化时再引入。

## 决策

SZTU GPA Planner 的产品文案和交互应明确调整为：

> 推荐上传 Excel、CSV 或可复制文字的电子成绩单 PDF，系统将优先读取原始结构化数据；截图仅作为兼容方式，识别结果必须审核。

这条路线比继续单独调 OCR 参数更能解决“行列错配导致 GPA 偏差”的根因，同时保留手机截图场景的可用性。

