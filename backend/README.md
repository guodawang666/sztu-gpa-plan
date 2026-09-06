# SZTU GPA Planner Backend

## 接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/health` | 服务状态和规则版本 |
| `GET` | `/api/v1/rules` | 成绩映射与规则开关 |
| `POST` | `/api/v1/grade/convert` | 数字成绩转等级和绩点 |
| `POST` | `/api/v1/gpa/calculate` | 按考试记录汇总 GPA |
| `POST` | `/api/v1/gpa/target` | 反推未来平均 GPA |
| `POST` | `/api/v1/course-score/required` | 反推单个未知考核项成绩 |

## GPA 计算示例

```json
POST /api/v1/gpa/calculate
{
  "attempts": [
    {
      "id": "calculus-normal",
      "courseCode": "IB00166",
      "courseName": "微积分2",
      "semester": "2023-2024-2",
      "credits": 4,
      "score": 53,
      "grade": "F",
      "examType": "NORMAL"
    },
    {
      "id": "calculus-makeup",
      "courseCode": "IB00166",
      "courseName": "微积分2",
      "semester": "2024-2025-2",
      "credits": 4,
      "score": 64,
      "grade": "D",
      "examType": "MAKEUP"
    }
  ]
}
```

返回结果会保留两次考试记录，并显示每条记录对 GPA 分子、分母和已获得学分的贡献。

规则约束：

- F 强制计入 GPA 分母，且已获得学分强制为 0。
- NP 的已获得学分强制为 0；P/NP 不进入 GPA。
- MAKEUP 与原始考试作为两条记录计算。
- RETAKE 会返回 `RETAKE_POLICY_UNCONFIRMED` 警告，直到正式重修口径得到确认。
- 导入绩点与成绩映射不一致时，同时返回计算绩点、`reportedGradePoint` 和复核警告，不会静默覆盖原始值。

## 目标 GPA 示例

```json
POST /api/v1/gpa/target
{
  "currentQualityPoints": 392,
  "currentGpaCredits": 130,
  "futureGpaCredits": 60,
  "targetGpa": 3.30
}
```

结果中 `requiredFutureGpa` 是未四舍五入的计算值，`displayRequiredFutureGpa` 是给前端显示的两位小数。
满绩点由服务端固定为深圳技术大学的 `4.5`，请求无法修改。

## 安全边界

当前后端不接收、不保存教务系统学号或密码。后续的截图导入应优先本地 OCR，并要求用户在导入前确认识别结果。
