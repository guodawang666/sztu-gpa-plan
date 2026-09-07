import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";

import {
  parseStructuredGradeFile,
  parseStructuredGradeRows,
  parseStructuredGradeText,
} from "../src/lib/structured-import";
import { confirmImportableCandidates } from "../src/lib/ocr-parser";

describe("structured grade import", () => {
  it("imports exact SZTU values from a worked spreadsheet example", () => {
    const rows = [
      ["学期", "课程编号", "课程名称", "学分", "成绩", "等级", "绩点", "考试性质"],
      ["2023-2024-2", "IB00166", "微积分2", 4, 53, "F", 0, "正常考试"],
      ["2024-2025-2", "IB00166", "微积分2", 4, 64, "D", 1, "补考"],
      ["2024-2025-1", "ML001", "Machine Learning in Finance", 1, "通过", "P", "", "正常考试"],
    ];

    const result = parseStructuredGradeRows(rows, "2025-2026-1");

    expect(result).toEqual([
      expect.objectContaining({
        semester: "2023-2024-2",
        courseCode: "IB00166",
        courseName: "微积分2",
        credits: 4,
        score: 53,
        grade: "F",
        gradePoint: 0,
        examType: "NORMAL",
        needsReview: false,
      }),
      expect.objectContaining({
        semester: "2024-2025-2",
        score: 64,
        grade: "D",
        gradePoint: 1,
        examType: "MAKEUP",
        needsReview: false,
      }),
      expect.objectContaining({
        courseCode: "ML001",
        courseName: "Machine Learning in Finance",
        credits: 1,
        grade: "P",
        needsReview: false,
      }),
    ]);
    expect(result[2]).not.toHaveProperty("score");
    expect(result[2]).not.toHaveProperty("gradePoint");
  });

  it("recognises a copied grade table with a title row and common header aliases", () => {
    const pasted = [
      "深圳技术大学学生成绩明细",
      "开课学期\t课程代码\t课程名\t课程学分\t总评成绩\t成绩等级\t课程绩点\t考核性质",
      "2024-2025-1\tBS00298\tPython 数据科学基础（英文课程）\t3\t70\tC+\t2.5\t正常考试",
    ].join("\n");

    const result = parseStructuredGradeText(pasted, "2025-2026-1");

    expect(result).toEqual([
      expect.objectContaining({
        semester: "2024-2025-1",
        courseCode: "BS00298",
        courseName: "Python 数据科学基础（英文课程）",
        credits: 3,
        score: 70,
        grade: "C+",
        gradePoint: 2.5,
        examType: "NORMAL",
        needsReview: false,
      }),
    ]);
  });

  it("reads an xlsx file directly in the browser-facing file interface", async () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["课程代码", "课程名称", "学分", "成绩", "成绩等级", "考试性质"],
      ["IB00166", "微积分2", 4, 64, "D", "补考"],
    ]);
    utils.book_append_sheet(workbook, sheet, "成绩");
    const bytes = write(workbook, { bookType: "xlsx", type: "array" });
    const file = new File([bytes], "学生成绩单.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseStructuredGradeFile(file, "2024-2025-2");

    expect(result.sourceLabel).toBe("成绩");
    expect(result.candidates).toEqual([
      expect.objectContaining({
        courseCode: "IB00166",
        courseName: "微积分2",
        credits: 4,
        score: 64,
        grade: "D",
        gradePoint: 1,
        examType: "MAKEUP",
      }),
    ]);
  });

  it("merges every worksheet containing a grade table", async () => {
    const workbook = utils.book_new();
    for (const [sheetName, semester, code] of [
      ["第一学期", "2024-2025-1", "BS001"],
      ["第二学期", "2024-2025-2", "BS002"],
    ]) {
      utils.book_append_sheet(
        workbook,
        utils.aoa_to_sheet([
          ["学期", "课程代码", "课程名称", "学分", "成绩"],
          [semester, code, `${sheetName}课程`, 3, 85],
        ]),
        sheetName,
      );
    }
    const file = new File(
      [write(workbook, { bookType: "xlsx", type: "array" })],
      "多学期成绩单.xlsx",
    );

    const result = await parseStructuredGradeFile(file, "2025-2026-1");

    expect(result.candidates.map((item) => item.courseCode)).toEqual([
      "BS001",
      "BS002",
    ]);
    expect(result.sourceLabel).toBe("第一学期、第二学期");
  });

  it("does not bulk-approve a grade-point conflict from a structured source", () => {
    const candidates = parseStructuredGradeRows(
      [
        ["课程名称", "学分", "成绩", "等级", "绩点"],
        ["数据分析", 3, 70, "C+", 3],
      ],
      "2024-2025-1",
    );

    expect(candidates[0]).toMatchObject({
      grade: "C+",
      gradePoint: 3,
      needsReview: true,
    });
    expect(confirmImportableCandidates(candidates)[0]?.confirmed).toBe(false);
  });

  it("does not bulk-approve a score outside the 0 to 100 range", () => {
    const candidates = parseStructuredGradeRows(
      [
        ["课程名称", "学分", "成绩", "等级"],
        ["异常成绩", 3, 101, "A+"],
      ],
      "2024-2025-1",
    );

    expect(candidates[0]?.issues).toContain("成绩必须在 0 到 100 之间");
    expect(confirmImportableCandidates(candidates)[0]?.confirmed).toBe(false);
  });
});
