export const UI_LETTER_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'] as const;
export const UI_PASS_FAIL_GRADES = ['P', 'NP'] as const;
export const UI_EXAM_TYPES = ['NORMAL', 'MAKEUP', 'RETAKE', 'DEFERRED', 'TRANSFER'] as const;

export type UiLetterGrade = (typeof UI_LETTER_GRADES)[number];
export type UiPassFailGrade = (typeof UI_PASS_FAIL_GRADES)[number];
export type UiGrade = UiLetterGrade | UiPassFailGrade;
export type UiExamType = (typeof UI_EXAM_TYPES)[number];

export interface OcrCandidate {
  id: string;
  semester: string;
  confirmed: boolean;
  courseCode?: string;
  courseName: string;
  credits: number;
  score?: number;
  grade?: UiGrade;
  gradePoint?: number;
  examType: UiExamType;
  needsReview: boolean;
  issues: string[];
  rawLine: string;
}

const gradePoints: Record<UiLetterGrade, number> = {
  'A+': 4.5,
  A: 4,
  'B+': 3.5,
  B: 3,
  'C+': 2.5,
  C: 2,
  D: 1,
  F: 0,
};

const codePattern = /\b[A-Z]{1,5}\d{4,10}\b/i;
const numericToken = /^\d+(?:\.\d+)?$/;
const letterGradeToken = /^(A\+|B\+|C\+|A|B|C|D|F|P|NP)$/i;

function examTypeFromLine(line: string): UiExamType {
  if (/补考/.test(line)) return 'MAKEUP';
  if (/重修/.test(line)) return 'RETAKE';
  if (/缓考/.test(line)) return 'DEFERRED';
  if (/转学分|认定|替代/.test(line)) return 'TRANSFER';
  return 'NORMAL';
}

function gradeFromLine(tokens: string[], line: string): UiGrade | undefined {
  if (/不通过|\bNP\b/i.test(line)) return 'NP';
  if (/通过|\bPASS\b/i.test(line)) return 'P';
  const token = tokens.find((value) => letterGradeToken.test(value));
  return token?.toUpperCase() as UiGrade | undefined;
}

function gradeFromScore(score: number): UiLetterGrade {
  if (score >= 93) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  if (score >= 65) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function isPassFail(grade: UiGrade | undefined): grade is UiPassFailGrade {
  return grade === 'P' || grade === 'NP';
}

function parseLine(rawLine: string, index: number, semester: string): OcrCandidate | undefined {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;

  const courseCode = line.match(codePattern)?.[0]?.toUpperCase();
  const tokens = line.split(' ');
  const grade = gradeFromLine(tokens, line);
  const numberTokens = tokens
    .filter((token) => numericToken.test(token))
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const credits = numberTokens.find((value) => value >= 0 && value <= 30);
  const numericPosition = credits === undefined ? -1 : numberTokens.indexOf(credits);
  const score = isPassFail(grade)
    ? undefined
    : numberTokens.slice(numericPosition + 1).find((value) => value >= 0 && value <= 100);
  const gradePoint = isPassFail(grade)
    ? undefined
    : numberTokens.slice(numericPosition + 2).find((value) => value >= 0 && value <= 4.5);

  const ignoredTokens = new Set<string>([
    courseCode ?? '',
    ...(numberTokens.map(String)),
    ...(grade === undefined ? [] : [grade]),
    '正常考试', '补考', '重修', '缓考', '转学分', '认定', '替代', '通过', '不通过', 'PASS', 'NP',
  ]);
  const courseName = tokens
    .filter((token) => !ignoredTokens.has(token.toUpperCase()) && !ignoredTokens.has(token))
    .join(' ')
    .trim();

  if (!courseName && credits === undefined && grade === undefined) return undefined;

  const issues: string[] = [];
  if (!courseCode) issues.push('未识别到课程编号');
  if (!courseName) issues.push('未识别到课程名称');
  if (credits === undefined) issues.push('未识别到学分');
  if (!grade) issues.push('未识别到成绩等级');
  if (score !== undefined && grade !== undefined && !isPassFail(grade) && gradeFromScore(score) !== grade) {
    issues.push('分数与等级不符合 SZTU 映射');
  }
  if (
    gradePoint !== undefined
    && grade !== undefined
    && !isPassFail(grade)
    && gradePoints[grade] !== gradePoint
  ) {
    issues.push('导入绩点与 SZTU 映射不一致');
  }

  return {
    id: `ocr-${index + 1}`,
    semester,
    confirmed: false,
    ...(courseCode === undefined ? {} : { courseCode }),
    courseName: courseName || '待确认课程',
    credits: credits ?? 0,
    ...(score === undefined ? {} : { score }),
    ...(grade === undefined ? {} : { grade }),
    ...(gradePoint === undefined ? {} : { gradePoint }),
    examType: examTypeFromLine(line),
    needsReview: issues.length > 0,
    issues,
    rawLine: line,
  };
}

export function applyOcrConfidence(candidates: OcrCandidate[], confidence: number): OcrCandidate[] {
  if (confidence >= 82) return candidates;
  const issue = `OCR 置信度较低（${Math.round(confidence)}%）`;
  return candidates.map((candidate) => ({
    ...candidate,
    needsReview: true,
    issues: candidate.issues.includes(issue) ? candidate.issues : [...candidate.issues, issue],
  }));
}

export function parseTranscriptOcrText(text: string, semester: string): OcrCandidate[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index, semester))
    .filter((candidate): candidate is OcrCandidate => candidate !== undefined);
}
