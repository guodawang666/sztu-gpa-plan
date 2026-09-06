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

## 安全边界

当前后端不接收、不保存教务系统学号或密码。后续的截图导入应优先本地 OCR，并要求用户在导入前确认识别结果。
