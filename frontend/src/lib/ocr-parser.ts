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

const codePattern = /^[A-Z1L]{1,5}\d{4,10}$/i;
const numericToken = /^\d+(?:\.\d+)?$/;
const letterGradeToken = /^(A\+|B\+|C\+|A|B|C|D|F|P|NP)$/i;

function examTypeFromLine(line: string): UiExamType {
  const compactLine = line.replace(/\s+/g, '');
  if (/补考/.test(compactLine)) return 'MAKEUP';
  if (/重修/.test(compactLine)) return 'RETAKE';
  if (/缓考/.test(compactLine)) return 'DEFERRED';
  if (/转学分|认定|替代/.test(compactLine)) return 'TRANSFER';
  return 'NORMAL';
}

function gradePositionFromLine(tokens: string[], line: string): { grade?: UiGrade; index: number } {
  const compactLine = line.replace(/\s+/g, '');
  if (/不通过|\bNP\b/i.test(compactLine)) {
    return { grade: 'NP', index: tokens.findIndex((token) => /^(不通过|通过|NP)$/i.test(token)) };
  }
  if (/通过|\bPASS\b/i.test(compactLine)) {
    return { grade: 'P', index: tokens.findIndex((token) => /^(通过|PASS)$/i.test(token)) };
  }

  const index = tokens.findIndex((value, tokenIndex) => {
    const previousToken = tokens[tokenIndex - 1];
    return letterGradeToken.test(value)
      && previousToken !== undefined
      && numericToken.test(previousToken)
      && Number(previousToken) <= 100;
  });
  if (index < 0) return { index: -1 };
  return { grade: tokens[index]!.toUpperCase() as UiGrade, index };
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

function normaliseCourseCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.toUpperCase().replace(/^[1L]B(?=\d)/, 'IB');
}

function normaliseCourseName(tokens: string[]): string {
  return tokens
    .join(' ')
    .replace(/\(\s*/g, '（')
    .replace(/\s*\)/g, '）')
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}\d）])/gu, '$1')
    .replace(/\s*（\s*/g, '（')
    .replace(/\s+）/g, '）')
    .trim();
}

function parseLine(rawLine: string, index: number, semester: string): OcrCandidate | undefined {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;

  const tokens = line.split(' ');
  const recognisedSemester = tokens.find((token) => /^20\d{2}-20\d{2}-[12]$/.test(token));
  const codeIndex = tokens.findIndex((token) => codePattern.test(token));
  const courseCode = normaliseCourseCode(codeIndex >= 0 ? tokens[codeIndex] : undefined);
  const { grade, index: gradeIndex } = gradePositionFromLine(tokens, line);

  if (gradeIndex < 0 && !courseCode) return undefined;

  const numbersAfterGrade = tokens
    .slice(gradeIndex + 1)
    .filter((token) => numericToken.test(token))
    .map(Number);
  const hasSztuTableOrder = gradeIndex >= 0 && numbersAfterGrade.length >= 2;
  const scoreToken = tokens[gradeIndex - 1];
  const score = !isPassFail(grade) && scoreToken !== undefined && numericToken.test(scoreToken)
    ? Number(scoreToken)
    : undefined;
  const legacyCreditsIndex = isPassFail(grade) ? gradeIndex - 1 : gradeIndex - 2;
  const legacyCreditsToken = tokens[legacyCreditsIndex];
  const credits = hasSztuTableOrder
    ? numbersAfterGrade[0]
    : legacyCreditsToken !== undefined && numericToken.test(legacyCreditsToken)
      ? Number(legacyCreditsToken)
      : undefined;
  const recognisedGradePoint = isPassFail(grade)
    ? undefined
    : hasSztuTableOrder
      ? numbersAfterGrade[2]
      : numbersAfterGrade[0];
  const gradePoint = grade === undefined || isPassFail(grade) ? undefined : gradePoints[grade];

  let nameStart = codeIndex >= 0 ? codeIndex + 1 : 0;
  while (nameStart < gradeIndex) {
    const nameToken = tokens[nameStart];
    if (nameToken === undefined || (!/^\d+$/.test(nameToken) && !/^20\d{2}-20\d{2}-[12]$/.test(nameToken))) break;
    nameStart += 1;
  }
  const nameEnd = hasSztuTableOrder
    ? gradeIndex - (isPassFail(grade) ? 0 : 1)
    : Math.max(nameStart, legacyCreditsIndex);
  const courseName = normaliseCourseName(tokens.slice(nameStart, nameEnd));

  if (!courseName && credits === undefined && grade === undefined) return undefined;

  const issues: string[] = [];
  if (!courseCode) issues.push('未识别到课程编号');
  if (!courseName) issues.push('未识别到课程名称');
  if (credits === undefined) issues.push('未识别到学分');
  if (!grade) issues.push('未识别到成绩等级');
  if (score !== undefined && grade !== undefined && !isPassFail(grade) && gradeFromScore(score) !== grade) {
    issues.push('分数与等级不符合 SZTU 映射');
  }
  if (recognisedGradePoint !== undefined && gradePoint !== undefined && recognisedGradePoint !== gradePoint) {
    issues.push(`OCR 绩点 ${recognisedGradePoint} 已按 SZTU 映射纠正为 ${gradePoint}`);
  }

  return {
    id: `ocr-${index + 1}`,
    semester: recognisedSemester ?? semester,
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
  if (confidence >= 70) return candidates;
  const issue = `OCR 置信度较低（${Math.round(confidence)}%）`;
  return candidates.map((candidate) => ({
    ...candidate,
    needsReview: true,
    issues: candidate.issues.includes(issue) ? candidate.issues : [...candidate.issues, issue],
  }));
}

export function isImportableOcrCandidate(candidate: OcrCandidate): boolean {
  return candidate.courseName.trim().length > 0
    && (candidate.grade !== undefined || candidate.score !== undefined)
    && Number.isFinite(candidate.credits)
    && candidate.credits >= 0;
}

export function confirmImportableCandidates(candidates: OcrCandidate[]): OcrCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    confirmed: isImportableOcrCandidate(candidate),
  }));
}

export function parseTranscriptOcrText(text: string, semester: string): OcrCandidate[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index, semester))
    .filter((candidate): candidate is OcrCandidate => candidate !== undefined);
}
