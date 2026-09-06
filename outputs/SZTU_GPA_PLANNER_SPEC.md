# SZTU GPA Planner 开发指令与规则规范

> 文档状态：MVP 开发基线（研究快照：2026-09-07）  
> 产品名称：SZTU GPA Planner / 深圳技术大学 GPA 规划工具  
> 用途：作为后续产品、前端、计算引擎和测试的单一事实来源。规则变化时，先更新本文档，再修改实现。

## 0. 结论先行

当前没有找到一个同时满足“较高 star、近期活跃、许可证清晰、课程/学分/GPA/目标规划完整”的开源项目。因此采用组合式参考：

1. 以 [PkuCuipy/gpa-simulator](https://github.com/PkuCuipy/gpa-simulator) 参考成绩单导入、按学期成绩簿、课程模拟和可编辑记录。
2. 以 [johenking/grade-planner](https://github.com/johenking/grade-planner) 参考学期、课程分组、学分进度和毕业进度的数据组织。
3. 以 [5uhag/gpa-calculator](https://github.com/5uhag/gpa-calculator) 参考目标 GPA 反推、不可达目标提示和本地优先的轻量交互。
4. 以 [viiccwen/GPA-calculator](https://github.com/viiccwen/GPA-calculator) 参考 React + TypeScript + Vite + Tailwind/shadcn 的前端实现方式。

这些项目只作为结构和交互参考。深圳技术大学规则必须由本规范中的独立计算层实现，不得把其他学校的评分表直接移植进来。

## 1. 产品定位

### 1.1 目标用户

- 想申请留学、需要理解 GPA/成绩单口径的深圳技术大学本科生。
- 想刷绩点、评估重修或后续选课影响的学生。
- 想回答“我现在的成绩，接下来要达到什么水平”的学生。

### 1.2 产品承诺

产品不是只计算当前 GPA，而是提供：

> 当前成绩解释 → 目标 GPA 反推 → 单科成绩规划 → 学期/毕业情景模拟。

### 1.3 非目标

- 不冒充学校教务系统或官方成绩单。
- 不在没有官方依据时替用户推断正式重修的 GPA 覆盖规则。
- MVP 不接入教务系统账号，不要求用户上传密码或成绩到服务器。

### 1.4 产品原则

1. “成绩档案”“GPA 学分”“已获得学分”“培养方案毕业学分”必须分开显示。
2. 计算引擎保存每次考试/重修 attempt，不能只保留一条课程最终成绩。
3. 结果必须显示口径和警告，尤其是待确认的重修政策。
4. 使用原始分子、分母计算，不使用已经四舍五入的 GPA 反推内部结果。
5. 本地优先、隐私优先；默认数据保存在浏览器本地。

## 2. 规则状态与证据分级

- **官方明确**：深圳技术大学规章、教务部通知或官方课程考核文件直接写明。
- **成绩单实证**：由用户提供的教务系统成绩单案例交叉计算得到，能解释系统显示结果，但不等于已找到全校政策原文。
- **产品约定**：为了支持规划功能而采用的可配置默认值，不得描述为学校官方规则。
- **待确认**：目前证据不足，代码必须保留配置开关或明确提示。

## 3. 已确认的深圳技术大学规则

### 3.1 成绩记录与学分

根据《深圳技术大学普通高等教育本科生学籍管理规定》：

- 课程考核成绩记入成绩档案；合格取得相应学分，不参加考核或不合格不能取得学分，成绩记为 F。
- 学校采用 A+、A、B+、B、C+、C、D、F 等级制，或 P、NP 二级制。
- 二级制课程不计入平均学分绩点。
- 课外研学学分可折抵专业选修或普通选修学分，但不计入 GPA。
- 所有课程成绩如实记入成绩档案；同名课程已获学分时，毕业资格审核的学分不重复计算。

来源：[本科生学籍管理规定（官方 PDF，第 27—34 条）](https://www.sztu.edu.cn/documents/benkeshengxuejiguanliguiding.pdf)。

### 3.2 补考、重修与选课

- 学校实行重修补考制度。
- 必修课不合格必须重修；选修课可按培养方案要求重修或选择其他课程取得学分。
- 已合格课程不得申请重修。
- 在校学习期间重修次数不限，每次考核成绩均记入成绩档案。
- 最新教务部选课通知区分“重修原课程”和“重修替代课程”：原课程仍开设且课程编号、名称、学分均相同的，走重修报名选课；原课程不再开设的，按学院指引选择替代课程并在取得学分后认定。
- 相同课程号不能重复选课；已修读并取得学分的课程不能重复选课。

来源：[本科生学籍管理规定（官方 PDF，第 29—30 条）](https://www.sztu.edu.cn/documents/benkeshengxuejiguanliguiding.pdf)；[教务部 2026—2027 学年第一学期选课安排](https://jw.sztu.edu.cn/info/1007/3370.htm)。

### 3.3 GPA 公式

官方公式为：

```text
GPA = Σ（各课程总评成绩对应绩点 × 课程学分）/ Σ课程学分
```

但二级制 P/NP 课程不进入 GPA，因此实现中的分母应理解为“进入 GPA 的课程学分之和”，而不是简单的所有学分之和。

来源：[本科生学籍管理规定（官方 PDF，第 31—32 条）](https://www.sztu.edu.cn/documents/benkeshengxuejiguanliguiding.pdf)。

## 4. 成绩映射

官方《本科生课程考核办法（试行）》和官方 Diploma Supplement 给出以下等级、百分制区间与绩点：

| 百分制总评 | 等级 | 绩点 | 是否通过 | 默认 GPA 处理 |
|---:|:---:|---:|:---:|:---:|
| 93–100 | A+ | 4.5 | 是 | 计入 |
| 85–92 | A | 4.0 | 是 | 计入 |
| 80–84 | B+ | 3.5 | 是 | 计入 |
| 75–79 | B | 3.0 | 是 | 计入 |
| 70–74 | C+ | 2.5 | 是 | 计入 |
| 65–69 | C | 2.0 | 是 | 计入 |
| 60–64 | D | 1.0 | 是 | 计入 |
| 0–59 | F | 0.0 | 否 | 计入分母，贡献 0 分子 |

边界必须按闭区间实现，例如 92 属于 A，85 属于 A，84 属于 B+，60 属于 D，59 属于 F。

来源：[SZTU Undergraduate Course Assessment Methods (Trial)](https://utl.sztu.edu.cn/__local/8/F3/FF/6FD01ACD1F8B8E101A53D397E5B_A9E40804_188C4.pdf)；[SZTU Diploma Supplement](https://utl.sztu.edu.cn/__local/A/61/4F/81485EE9E5690C15C744AD2189C_C7A7A16C_8CFAC.pdf)。

## 5. F、补考、重修和 P/NP 处理

### 5.1 F / 挂科

```text
grade = F
gradePoint = 0
earnedCredit = 0
includedInGpa = true
gpaCredit = original course credits
```

这条“F 学分进入 GPA 分母”的结论已由用户真实成绩单案例验证：53 条课程记录、总学分 131，其中 1 学分 P/通过课程和 0 学分课程不进入 GPA，剩余 GPA 学分为 130；绩点×学分总和为 392，因此：

```text
392 / 130 = 3.015384... → 3.02
```

注意：官方公开规章明确了 F 的 0 绩点、未获学分和 GPA 公式，但没有找到一句单独写出“F 是否进入 GPA 分母”的完整算法句子。因此产品文案应称为“经成绩单实证确认的当前实现口径”，并保留校验入口。

### 5.2 补考

MVP 对已经验证的案例采用 attempt 级别处理：

```text
正常考试：53 / F / 0.0 / 4 学分
补考记录：64 / D / 1.0 / 4 学分
```

两条记录都保留，且两条都参与 GPA 加权。不能把补考 D 简化为覆盖原 F。数据层必须能表达：

```text
Course(IB00166, 微积分2)
  ├─ Attempt(normal, 53, F, 0.0, 4)
  └─ Attempt(makeup, 64, D, 1.0, 4)
```

严格边界：这个结论来自一份真实成绩单案例；“所有普通补考都统一封顶 64/D/1.0”仍不能仅凭该案例宣布为官方通用规则。补考成绩上限、补考与正式重修的累计 GPA 算法必须配置化。

### 5.3 正式重修

已确认：重修次数不限、每次考核成绩进入成绩档案、已合格课程不得申请重修。

待确认：正式重修后累计 GPA 究竟是：

- 原 F 与新成绩都计入；
- 新成绩覆盖原成绩；
- 取最高成绩；
- 或按某种课程/成绩认定规则处理。

MVP 实现要求：

1. 保留所有 attempt。
2. 将 `repeatGpaPolicy` 设为 `pending_verification`。
3. 在用户导入正式重修数据时显示“结果可能与官方累计 GPA 不一致”的提示。
4. 允许后续只替换策略函数，不迁移历史数据。

### 5.4 P / NP / 通过

```text
gradeType = PASS_FAIL
grade in [P, NP, 通过, 不通过]
includedInGpa = false
```

P/通过课程可以影响“已获得学分”，但不影响 GPA 分子和分母；NP/不通过通常不产生已获得学分。若某类“通过”课程的学分认定方式不明确，应允许用户手动修正 `earnedCredit`，并记录来源。

## 6. 学分口径

系统至少展示以下指标：

| 字段 | 定义 |
|---|---|
| `totalAttemptCredits` | 所有课程 attempt 的原始学分总和，可包含 F、补考和重修记录 |
| `gpaCredits` | 纳入 GPA 分母的学分总和 |
| `qualityPoints` | Σ（课程学分×绩点） |
| `earnedCredits` | 已通过并获得的学分，通常不包含 F/NP |
| `curriculumCredits` | 按培养方案完成/尚缺的毕业审核学分，不能用 GPA 学分替代 |
| `courseCount` | 成绩档案中的课程/attempt 数量，展示时须说明统计口径 |

避免使用含义不清的“已修学分”单一字段。

## 7. 核心公式

### 7.1 当前 GPA

```text
qualityPoints = Σ（attempt.credits × attempt.gradePoint）
gpaCredits = Σ（attempt.credits where attempt.includedInGpa）
currentGpa = qualityPoints / gpaCredits
```

当 `gpaCredits = 0` 时返回 `null`，不能显示 0.00 误导用户。

### 7.2 未来平均绩点反推

设：

- `Q_current`：当前质量分，即 `qualityPoints`
- `C_current`：当前 GPA 学分
- `C_future`：预计未来 GPA 学分
- `G_target`：目标累计 GPA
- `G_future`：未来课程平均 GPA

```text
G_target =（Q_current + G_future × C_future）/（C_current + C_future）

G_future_required =
  （G_target ×（C_current + C_future）- Q_current）/ C_future
```

若只有已四舍五入的当前 GPA，则 `Q_current = currentGpa × C_current` 只是近似值，UI 必须标注“基于输入 GPA 的估算”。

### 7.3 目标可行性

```text
if C_future <= 0:
  无法反推未来成绩
elif G_future_required <= 0:
  目标已达到或低于当前可维持水平
elif G_future_required > 4.5:
  数学上不可达
else:
  显示所需未来平均 GPA，并翻译为 A/B+/A+ 等级组合建议
```

### 7.4 单科总评成绩反推

设各考核项成绩为 `s_i`，占比为 `w_i`，目标总评为 `S_target`：

```text
finalScore = Σ（s_i × w_i）

unknownScore =
  （S_target - Σ（knownScore_i × weight_i））/ unknownWeight
```

要求所有权重之和为 100%，并支持多个未知考核项；当 `unknownScore > 100` 时提示目标不可达，当结果 `< 0` 时提示目标已由已知成绩保证。

## 8. 推荐数据结构

建议以 TypeScript 类型或等价 schema 表达，课程实体和考试 attempt 分离：

```ts
type GradeType = 'LETTER' | 'PASS_FAIL' | 'SCORE' | 'UNKNOWN'
type ExamType = 'NORMAL' | 'MAKEUP' | 'RETAKE' | 'DEFERRED' | 'TRANSFER'
type RepeatGpaPolicy = 'ATTEMPT_LEVEL' | 'LATEST_ONLY' | 'HIGHEST_ONLY' | 'PENDING_VERIFICATION'

interface Course {
  id: string
  courseCode?: string
  courseName: string
  semester: string
  credits: number
  courseCategory?: 'REQUIRED' | 'ELECTIVE' | 'GENERAL' | 'PRACTICE' | 'OTHER'
  attempts: CourseAttempt[]
  curriculumCreditEligible?: boolean
  notes?: string
}

interface CourseAttempt {
  id: string
  examType: ExamType
  score?: number
  grade?: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F' | 'P' | 'NP'
  gradePoint?: number
  gradeType: GradeType
  credits: number
  earnedCredit: number
  includedInGpa: boolean
  gpaCredit: number
  source?: 'MANUAL' | 'TRANSCRIPT_PASTE' | 'TRANSCRIPT_IMAGE' | 'OFFICIAL_RECORD'
  sourceNote?: string
}

interface CalculationPolicy {
  maxGpa: 4.5
  scoreScale: 'SZTU_100'
  repeatGpaPolicy: RepeatGpaPolicy
  makeupPolicy: 'ATTEMPT_LEVEL_VERIFIED_CASE' | 'PENDING_VERIFICATION'
  rounding: { displayDecimals: 2; mode: 'HALF_UP' }
}
```

设计要求：

- `gradePoint` 可由成绩映射得到，但导入官方记录时允许保存原始等级和原始绩点。
- `includedInGpa`、`gpaCredit`、`earnedCredit` 显式保存，不要通过前端显示文本猜测。
- `attempts` 是数组，补考和重修不能覆盖历史记录。
- 规则策略独立于 UI；同一计算函数必须被 Dashboard、规划器和测试复用。

## 9. MVP 页面

### 页面 1：首页 / Dashboard

- 当前 GPA / 4.5。
- 平均学分绩（若用户录入百分制成绩）。
- GPA 学分、已获得学分、课程数量。
- F、P/NP、补考/重修记录数量。
- 目标 GPA 快速入口。
- 当前数据是否包含“待确认重修政策”的醒目提示。

### 页面 2：我的课程 / 成绩单

- 按学期分组的课程表。
- 每门课程显示课程号、名称、学分、成绩、等级、绩点、是否计入 GPA、是否获得学分。
- 支持手动新增、编辑、删除。
- 支持同一课程展开查看多个 attempt。
- MVP 支持粘贴表格文本；截图 OCR 和教务系统自动登录导入放到后续版本。

### 页面 3：GPA 目标规划

- 输入目标 GPA 和预计未来 GPA 学分。
- 输出所需未来平均 GPA、可行性和等级解释。
- 提供 3.0 / 3.3 / 3.5 / 3.7 等快捷目标。
- 用 4.5 上限判断不可达目标。
- 支持“未来平均 3.5 / 4.0 / 4.5”情景对比。

### 页面 4：学期模拟器

- 新建未来学期。
- 添加课程、学分和目标等级。
- 实时计算学期 GPA 与累计 GPA。
- 修改任意一门课时即时显示累计 GPA 变化。
- 必须显示计算前提：是否按 attempt-level、是否包含 F、未来课程是否全部计入 GPA。

### 页面 5：单科成绩反推

- 自定义考核项目和权重。
- 输入已知成绩，选择目标总评等级或百分制分数。
- 反推剩余项目所需分数。
- 处理权重不足、权重超过 100%、目标不可达和已达成等情况。

## 10. 核心功能优先级

### P0：必须完成

- 深圳技术大学成绩映射。
- 课程与 attempt 录入。
- 当前 GPA、GPA 学分、已获得学分统计。
- F、P/NP、补考案例处理。
- GPA 目标反推。
- 本地保存、导入/导出 JSON。
- 单元测试和真实成绩单 fixture 校验。

### P1：紧接着完成

- 粘贴成绩单表格导入。
- 学期模拟器。
- 单科权重反推。
- 可解释的 GPA 变化明细。
- 中英文界面基础支持。

### P2：后续再做

- 图片 OCR。
- 培养方案课程树和毕业学分进度。
- 云端同步、账号和跨设备使用。
- 成绩单/留学申请分析。
- 多种海外 GPA 转换，但必须明确“换算估计”不等于目标院校官方换算。

## 11. 边界条件与错误处理

- 分数必须在 0–100；允许小数，但成绩区间映射按官方区间判断。
- 学分必须大于等于 0；计入 GPA 的课程学分不能为负数。
- GPA 输入必须在 0–4.5；目标 GPA 超过 4.5 直接报错。
- 未来学分为 0 时，不执行除法，显示“请先输入未来 GPA 学分”。
- GPA 分母为 0 时显示“当前没有可计算的 GPA 课程”。
- P/NP、通过、不通过、免修等非字母等级不能被静默转换成百分制。
- 0 学分课程可以保留在成绩档案中，但不应改变 GPA。
- 原始成绩、显示成绩和计算成绩分开保存，避免用户改动后无法追溯。
- 课程编号缺失时不得把同名课程自动合并；用户需要确认是否同一课程。
- 重修替代课程必须记录 `replacementForCourseId` 或等价关系，不能仅凭名称匹配。
- 四舍五入只在展示层执行；内部比较使用未四舍五入值。
- 结果页面须提示：这是规划估算，不是学校官方 GPA 证明。

## 12. 测试样例

### 12.1 成绩映射边界

| 输入 | 预期等级 | 预期绩点 |
|---:|:---:|---:|
| 100 | A+ | 4.5 |
| 93 | A+ | 4.5 |
| 92 | A | 4.0 |
| 85 | A | 4.0 |
| 84 | B+ | 3.5 |
| 80 | B+ | 3.5 |
| 79 | B | 3.0 |
| 60 | D | 1.0 |
| 59 | F | 0.0 |
| 0 | F | 0.0 |

### 12.2 真实成绩单回归 fixture

使用用户成绩单摘要：

```text
总课程/记录：53
总学分：131
P/通过课程：1 学分，不计 GPA
0 学分课程：不计 GPA
质量分：392
GPA 学分：130
```

预期：

```text
GPA = 392 / 130 = 3.015384...
显示 GPA = 3.02
```

该 fixture 必须作为回归测试保留。若未来算法改动导致 3.02 变化，必须解释原因。

### 12.3 F + 补考 attempt

```text
Attempt 1: 4 credits × 0.0 = 0.0; earnedCredit = 0
Attempt 2: 4 credits × 1.0 = 4.0; earnedCredit = 4
```

在当前已验证的 `ATTEMPT_LEVEL_VERIFIED_CASE` 策略下：

```text
gpaCredits += 8
qualityPoints += 4
earnedCredits += 4
```

### 12.4 目标 GPA 反推

输入：

```text
qualityPoints = 392
currentGpaCredits = 130
futureGpaCredits = 60
targetGpa = 3.30
```

预期：

```text
(3.30 × 190 - 392) / 60 = 3.916666...
显示：未来平均 GPA 至少约 3.92
```

目标 3.50 的预期为 4.55，超过 4.5，应标记为数学上不可达。不要沿用未经核算的 4.10 示例。

### 12.5 学期模拟

```text
消费者行为：3 学分，A   = 12.0
市场研究：3 学分，A     = 12.0
商务英语：2 学分，B+    =  7.0
运营管理：3 学分，A+    = 13.5
```

预期：

```text
学期质量分 = 44.5
学期学分 = 11
学期 GPA = 44.5 / 11 = 4.04545... → 4.05
累计 GPA = (392 + 44.5) / (130 + 11) = 3.09574... → 3.10
```

### 12.6 单科期末反推

```text
平时 20% = 88
项目 20% = 92
期中 20% = 84
期末 40% = x
目标总评 = 85
```

预期：

```text
88×0.2 + 92×0.2 + 84×0.2 + x×0.4 = 85
x = 80.5
```

## 13. 建议技术栈与工程结构

### 13.1 MVP 技术栈

- React + TypeScript：适合表单、可编辑成绩表和多页面交互。
- Vite：启动快，适合纯前端、本地优先工具。
- Tailwind CSS + shadcn/ui：快速搭建一致的响应式界面和可访问组件。
- React Router：组织 Dashboard、课程、规划、模拟和单科计算页面。
- Zustand 或轻量 React Context：管理课程数据与规划状态；不要在 MVP 引入复杂后端状态层。
- Zod：校验导入 JSON、表单和本地数据版本。
- Vitest + Testing Library：覆盖规则函数和关键交互。
- LocalStorage 起步，数据量扩大后迁移 IndexedDB；提供 JSON 导入/导出作为备份。
- GitHub Pages、Vercel 或同类静态托管：MVP 不需要服务器。

### 13.2 推荐目录

```text
src/
  domain/
    gradeScale.ts
    gpaCalculator.ts
    targetPlanner.ts
    courseScorePlanner.ts
    policies.ts
    types.ts
  data/
    fixtures/
    storage.ts
    importers/
  features/
    dashboard/
    courses/
    target-planner/
    semester-simulator/
    course-score-planner/
  components/
  routes/
  tests/
```

计算规则放在 `domain/`，不能散落在 React 组件或页面事件处理函数里。

### 13.3 数据隐私

默认不上传成绩；页面明确说明数据保存位置。以后若加入云同步，应先加入用户主动选择、删除和导出机制，不把教务系统登录信息交给第三方。

## 14. 开源项目调研与采用建议

以下 star、fork、提交数量和归档状态是 2026-09-07 的调研快照，GitHub 指标会变化。

| 项目 | Star / Fork | 技术栈与结构 | 许可证 | 活跃度与风险 | 可复用结论 |
|---|---:|---|---|---|---|
| [PkuCuipy/gpa-simulator](https://github.com/PkuCuipy/gpa-simulator) | 23 / 3 | React JSX；`src/App.js`、成绩导入器、成绩簿、Summary、工具函数；支持随机成绩、手动新增、粘贴 DOM 导入、成绩模拟 | MIT | 63 commits；页面记录最近更新约为 2025-01；规模小但领域贴合 | **首选结构参考**。借鉴按学期成绩簿、粘贴导入和可编辑课程；必须替换北大评分逻辑，并重做 attempt 模型 |
| [stonith404/gradely2](https://github.com/stonith404/gradely2) | 22 / 1 | Flutter 多端；Appwrite 后端；学期、科目、成绩、权重、Dream grade、统计、多语言 | GPL-3.0 | 已于 2022-10-19 归档，只读 | **功能参考，不建议直接作为底座**。GPL 会带来分发义务；归档状态也不适合直接 fork |
| [abhisheknaiidu/iiitdmj-gpa](https://github.com/abhisheknaiidu/iiitdmj-gpa) | 20 / 6 | Vue；PWA；成绩计算；测试目录/脚本；面向具体学校 | MIT | 68 commits；项目较早，学校规则耦合明显 | 参考“学校定制 GPA 工具 + PWA + 测试”的思路；不直接复用其规则 |
| [viiccwen/GPA-calculator](https://github.com/viiccwen/GPA-calculator) | 10 / 1 | React 18、TypeScript、Vite、Tailwind、shadcn/ui、Radix、Lucide；前端本地计算 | 仓库页面未显示 LICENSE 文件，需先向作者确认 | 38 commits；最近更新约为 2026-05；规模小、技术栈现代 | **首选 UI/工程风格参考**，但许可证不清晰时只看设计和目录，不复制代码 |
| [johenking/grade-planner](https://github.com/johenking/grade-planner) | 0 / 0 | React 18、CRA、Firebase Auth、Firestore、Framer Motion；按学期/课程/必修选修管理 | MIT | 8 commits；README 仍把测试、JSON 课程配置和 i18n 列为 roadmap | 参考课程进度、学期分组和未来可扩展的数据模型；不建议作为代码底座 |
| [5uhag/gpa-calculator](https://github.com/5uhag/gpa-calculator) | 0 / 1 | 原生 HTML/CSS/JavaScript；单页、无依赖、GitHub Pages | MIT | 16 commits；当前为单功能 v1.0；自述存在 10 分制、无持久化等限制 | **目标反推公式参考**。代码过于简单，且原项目假设 10 分制，不能直接移植 |

### 14.1 底层选择建议

如果必须选择一个仓库作为第一轮实验起点，优先选择 `PkuCuipy/gpa-simulator`：领域贴合度最高，MIT 清晰，已有按学期成绩簿、粘贴导入和成绩模拟的完整闭环，且代码规模适合阅读。

但产品正式实现仍建议新建自己的 React + TypeScript 工程，并只吸收它的交互和数据组织方式。原因是：

- 需要从“课程一条记录”升级为“课程 + 多次 attempt”。
- 需要将成绩规则、GPA 策略和重修策略配置化。
- 需要加入 P/NP、课外研学学分、已获得学分与 GPA 学分的严格区分。
- 需要可测试的纯函数，而不是把规则绑定在页面事件中。

## 15. 开发执行指令

后续实现代理/开发者必须遵守：

1. 开始编码前先阅读本文档，并确认当前 `CalculationPolicy`。
2. 先实现 `gradeScale`、`gpaCalculator`、`targetPlanner` 的纯函数和测试，再实现页面。
3. 不得把 F 过滤出 GPA 分母；不得把补考记录覆盖原始 F。
4. 不得把 P/NP 当作 0 分课程；P/NP 应从 GPA 分子和分母排除。
5. 不得在未确认正式重修政策时默认“最高成绩覆盖”或“最新成绩覆盖”。
6. 任何页面显示的 GPA 都必须能展开查看分子、分母和纳入/排除原因。
7. 使用真实成绩单摘要作为回归测试，必须得到 3.02。
8. 规则变更必须同步更新：类型、计算函数、测试、用户提示和本文档。
9. 不直接复制许可证不明或 GPL 项目的代码、图片、品牌和文案。
10. 完成 MVP 后再讨论视觉风格、OCR、登录和云端同步。

## 16. 待确认清单

按优先级继续核实：

1. 普通补考是否全校统一存在 64/D/1.0 的成绩上限。
2. 正式重修后的累计 GPA 采用哪一次成绩或哪种组合。
3. 重修替代课程认定后，原课程与替代课程在 GPA、毕业学分和成绩单上分别如何体现。
4. 各类实践课、体育、军事理论、毕业设计等课程在不同年级培养方案中的 GPA 口径。
5. 免修、跨校修读、交换课程的成绩如何进入 GPA。
6. 英文成绩单和留学申请材料如何展示补考、重修、历史 F 与 GPA。

在这些项目确认之前，产品可以计算“基于当前已知规则的规划值”，但必须把估算和官方结果区分开。

## 17. 研究来源

- [深圳技术大学普通高等教育本科生学籍管理规定（官方 PDF）](https://www.sztu.edu.cn/documents/benkeshengxuejiguanliguiding.pdf)
- [深圳技术大学教务部：关于公布 2026—2027 学年第一学期选课安排的通知](https://jw.sztu.edu.cn/info/1007/3370.htm)
- [SZTU Undergraduate Course Assessment Methods (Trial)](https://utl.sztu.edu.cn/__local/8/F3/FF/6FD01ACD1F8B8E101A53D397E5B_A9E40804_188C4.pdf)
- [SZTU Diploma Supplement](https://utl.sztu.edu.cn/__local/A/61/4F/81485EE9E5690C15C744AD2189C_C7A7A16C_8CFAC.pdf)
- [PkuCuipy/gpa-simulator](https://github.com/PkuCuipy/gpa-simulator)
- [stonith404/gradely2](https://github.com/stonith404/gradely2)
- [abhisheknaiidu/iiitdmj-gpa](https://github.com/abhisheknaiidu/iiitdmj-gpa)
- [viiccwen/GPA-calculator](https://github.com/viiccwen/GPA-calculator)
- [johenking/grade-planner](https://github.com/johenking/grade-planner)
- [5uhag/gpa-calculator](https://github.com/5uhag/gpa-calculator)

