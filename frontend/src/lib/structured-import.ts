import Papa from "papaparse";

import type {
  OcrCandidate,
  UiExamType,
  UiGrade,
} from "./ocr-parser";
import { gradeFromScore, gradePointForUiGrade } from "./ocr-parser";

type Cell = unknown;

export interface StructuredGradeFileResult {
  candidates: OcrCandidate[];
  sourceLabel: string;
}

const aliases = {
  semester: ["学期", "学年学期", "开课学期", "修读学期"],
  courseCode: ["课程编号", "课程代码", "课程号"],
  courseName: ["课程名称", "课程名"],
  credits: ["学分", "课程学分"],
  score: ["成绩", "总评成绩", "最终成绩", "百分制成绩"],
  grade: ["等级", "等级成绩", "成绩等级"],
  gradePoint: ["绩点", "课程绩点"],
  examType: ["考试性质", "考核性质", "修读性质"],
} as const;

type Field = keyof typeof aliases;
type HeaderMap = Partial<Record<Field, number>>;

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normaliseHeader(value: Cell): string {
  return text(value).replace(/[\s：:()（）]/g, "").toLowerCase();
}

function locateHeaders(rows: Cell[][]): { rowIndex: number; columns: HeaderMap } | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const columns: HeaderMap = {};
    rows[rowIndex]!.forEach((cell, columnIndex) => {
      const header = normaliseHeader(cell);
      for (const [field, names] of Object.entries(aliases) as Array<
        [Field, readonly string[]]
      >) {
        if (names.some((name) => normaliseHeader(name) === header)) {
          columns[field] = columnIndex;
        }
      }
    });
    if (columns.courseName !== undefined && columns.credits !== undefined) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function numeric(value: Cell): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = text(value).replace(/分$/, "");
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return undefined;
  const result = Number(raw);
  return Number.isFinite(result) ? result : undefined;
}

function parseGrade(value: Cell, scoreValue: Cell): UiGrade | undefined {
  const raw = text(value || scoreValue).toUpperCase().replace(/\s+/g, "");
  if (raw === "通过" || raw === "合格" || raw === "PASS") return "P";
  if (raw === "不通过" || raw === "不合格" || raw === "FAIL") return "NP";
  if (["A+", "A", "B+", "B", "C+", "C", "D", "F", "P", "NP"].includes(raw)) {
    return raw as UiGrade;
  }
  const score = numeric(scoreValue);
  if (score === undefined || score < 0 || score > 100) return undefined;
  return gradeFromScore(score);
}

function parseExamType(value: Cell): UiExamType {
  const raw = text(value).replace(/\s+/g, "");
  if (raw.includes("补考")) return "MAKEUP";
  if (raw.includes("重修")) return "RETAKE";
  if (raw.includes("缓考")) return "DEFERRED";
  if (/转学分|认定|替代/.test(raw)) return "TRANSFER";
  return "NORMAL";
}

function cell(row: Cell[], columns: HeaderMap, field: Field): Cell {
  const index = columns[field];
  return index === undefined ? undefined : row[index];
}

export function parseStructuredGradeRows(
  rows: Cell[][],
  defaultSemester: string,
): OcrCandidate[] {
  const header = locateHeaders(rows);
  if (!header) return [];

  return rows
    .slice(header.rowIndex + 1)
    .map((row, index): OcrCandidate | null => {
      const courseName = text(cell(row, header.columns, "courseName"));
      const courseCode = text(cell(row, header.columns, "courseCode"));
      const credits = numeric(cell(row, header.columns, "credits"));
      const scoreCell = cell(row, header.columns, "score");
      const score = numeric(scoreCell);
      const grade = parseGrade(cell(row, header.columns, "grade"), scoreCell);
      const sourceGradePoint = numeric(cell(row, header.columns, "gradePoint"));
      if (!courseName && !courseCode && credits === undefined && !grade) return null;

      const issues: string[] = [];
      if (!courseName) issues.push("未识别到课程名称");
      if (credits === undefined) issues.push("未识别到学分");
      if (!grade) issues.push("未识别到成绩等级或分数");
      if (score !== undefined && (score < 0 || score > 100)) {
        issues.push("成绩必须在 0 到 100 之间");
      }
      if (
        score !== undefined &&
        grade !== undefined &&
        grade !== "P" &&
        grade !== "NP" &&
        gradeFromScore(score) !== grade
      ) {
        issues.push(`分数 ${score} 与成绩等级 ${grade} 不符合 SZTU 映射`);
      }
      const mappedGradePoint = gradePointForUiGrade(grade);
      const gradePoint =
        mappedGradePoint === undefined
          ? undefined
          : sourceGradePoint ?? mappedGradePoint;
      if (
        sourceGradePoint !== undefined &&
        mappedGradePoint !== undefined &&
        sourceGradePoint !== mappedGradePoint
      ) {
        issues.push(`成绩单绩点 ${sourceGradePoint} 与 SZTU 映射 ${mappedGradePoint} 不一致`);
      }

      const semester = text(cell(row, header.columns, "semester")) || defaultSemester;
      return {
        id: `sheet-${index + 1}`,
        semester,
        confirmed: false,
        ...(courseCode ? { courseCode: courseCode.toUpperCase() } : {}),
        courseName: courseName || "待确认课程",
        credits: credits ?? -1,
        ...(score === undefined ? {} : { score }),
        ...(grade === undefined ? {} : { grade }),
        ...(gradePoint === undefined ? {} : { gradePoint }),
        examType: parseExamType(cell(row, header.columns, "examType")),
        needsReview: issues.length > 0,
        issues,
        rawLine: row.map(text).join(" | "),
      };
    })
    .filter((candidate): candidate is OcrCandidate => candidate !== null);
}

export function parseStructuredGradeText(
  value: string,
  defaultSemester: string,
): OcrCandidate[] {
  const normalised = value.replace(/^\uFEFF/, "").trim();
  if (!normalised) return [];
  const delimiter = normalised.includes("\t") ? "\t" : undefined;
  const parsed = Papa.parse<Cell[]>(normalised, {
    ...(delimiter ? { delimiter } : {}),
    skipEmptyLines: "greedy",
  });
  return parseStructuredGradeRows(parsed.data, defaultSemester);
}

export async function parseStructuredGradeFile(
  file: File,
  defaultSemester: string,
): Promise<StructuredGradeFileResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "tsv" || file.type === "text/csv") {
    const candidates = parseStructuredGradeText(await file.text(), defaultSemester);
    if (!candidates.length) throw new Error("未找到可识别的成绩表头或课程记录");
    return { candidates, sourceLabel: file.name };
  }
  if (extension !== "xlsx" && extension !== "xls") {
    throw new Error("目前支持复制粘贴、CSV、TSV、XLS 和 XLSX");
  }

  const bytes = await file.arrayBuffer();
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false });

  const candidates: OcrCandidate[] = [];
  const sourceLabels: string[] = [];
  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const sheetCandidates = parseStructuredGradeRows(rows, defaultSemester);
    if (!sheetCandidates.length) continue;
    sourceLabels.push(sheetName);
    candidates.push(
      ...sheetCandidates.map((candidate) => ({
        ...candidate,
        id: `${candidate.id}-sheet-${sheetIndex}`,
      })),
    );
  }

  if (!candidates.length) {
    throw new Error("工作簿中未找到可识别的成绩表头或课程记录");
  }
  return { candidates, sourceLabel: sourceLabels.join("、") };
}
