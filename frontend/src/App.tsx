import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import {
  Calculator,
  ChevronRight,
  FileImage,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings,
  Target,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";

import {
  calculateGpa,
  calculateRequiredScore,
  planTargetGpa,
  type CourseAttempt,
  type CourseScorePlan,
  type GpaSummary,
  type TargetPlan,
} from "./lib/api";
import { recogniseTranscriptImage } from "./lib/ocr";
import {
  prepareTranscriptImages,
  selectTranscriptImages,
} from "./lib/image-import";
import {
  applyOcrConfidence,
  confirmImportableCandidates,
  deduplicateOcrCandidates,
  gradeFromScore,
  gradePointForUiGrade,
  isImportableOcrCandidate,
  parseTranscriptOcrText,
  UI_EXAM_TYPES,
  UI_LETTER_GRADES,
  UI_PASS_FAIL_GRADES,
  type OcrCandidate,
  type UiExamType,
  type UiGrade,
} from "./lib/ocr-parser";
import { createBackupText, parseBackupText } from "./lib/storage";
import {
  parseStructuredGradeFile,
  parseStructuredGradeText,
} from "./lib/structured-import";

type Page =
  | "dashboard"
  | "import"
  | "courses"
  | "target"
  | "simulator"
  | "course-score"
  | "rules";
type ImportMode = "APPEND" | "REPLACE";

const STORAGE_KEY = "sztu-gpa-planner-attempts-v1";
const emptySummary: GpaSummary = {
  attemptedCredits: 0,
  earnedCredits: 0,
  gpaCredits: 0,
  qualityPoints: 0,
  gpa: null,
  displayGpa: null,
  contributions: [],
  policyWarnings: [],
};

const gradeLabels: Record<UiGrade, string> = {
  "A+": "A+ · 4.5",
  A: "A · 4.0",
  "B+": "B+ · 3.5",
  B: "B · 3.0",
  "C+": "C+ · 2.5",
  C: "C · 2.0",
  D: "D · 1.0",
  F: "F · 0",
  P: "通过 P",
  NP: "不通过 NP",
};

const navItems: Array<{
  page: Page;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { page: "dashboard", label: "总览", icon: LayoutDashboard },
  { page: "import", label: "成绩导入", icon: FileImage },
  { page: "courses", label: "我的课程", icon: GraduationCap },
  { page: "target", label: "目标规划", icon: Target },
  { page: "simulator", label: "学期模拟", icon: WandSparkles },
  { page: "course-score", label: "单科计算", icon: Calculator },
  { page: "rules", label: "规则说明", icon: Settings },
];

const initialManual = {
  courseCode: "",
  courseName: "",
  semester: "2025-2026-1",
  credits: "3",
  score: "",
  grade: "",
  examType: "NORMAL",
};

function loadLocalAttempts(): { attempts: CourseAttempt[]; warning: string } {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { attempts: [], warning: "" };
  try {
    return { attempts: parseBackupText(stored), warning: "" };
  } catch {
    const recoveryKey = `${STORAGE_KEY}-recovery-${Date.now()}`;
    localStorage.setItem(recoveryKey, stored);
    return {
      attempts: [],
      warning: `检测到旧的本地数据已损坏，原文已保存在浏览器恢复副本 ${recoveryKey}，没有直接丢弃。`,
    };
  }
}

function newId(prefix = "attempt"): string {
  return typeof crypto?.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberOrUndefined(value: string): number | undefined {
  const number = Number(value);
  return value.trim() === "" || !Number.isFinite(number) ? undefined : number;
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "ACHIEVABLE"
      ? "可实现"
      : status === "IMPOSSIBLE"
        ? "暂不可达"
        : "已达到";
  return <span className={`pill pill-${status.toLowerCase()}`}>{label}</span>;
}

function App() {
  const [initialLoad] = useState(loadLocalAttempts);
  const [page, setPage] = useState<Page>("dashboard");
  const [importMode, setImportMode] = useState<ImportMode>("APPEND");
  const [attempts, setAttempts] = useState<CourseAttempt[]>(
    initialLoad.attempts,
  );
  const [summary, setSummary] = useState<GpaSummary>(emptySummary);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(
    initialLoad.attempts.length > 0,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, createBackupText(attempts));
    let ignore = false;
    if (attempts.length === 0) {
      setSummary(emptySummary);
      setSummaryError("");
      setSummaryLoading(false);
      return undefined;
    }
    setSummaryLoading(true);
    void calculateGpa(attempts)
      .then((result) => {
        if (!ignore) {
          setSummary(result);
          setSummaryError("");
          setSummaryLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setSummary(emptySummary);
          setSummaryError(
            error instanceof Error ? error.message : "无法连接计算服务。",
          );
          setSummaryLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [attempts]);

  const counters = useMemo(
    () => ({
      failures: attempts.filter((item) => {
        const grade =
          item.grade ??
          (item.score !== undefined ? gradeFromScore(item.score) : undefined);
        return grade === "F";
      }).length,
      passFail: attempts.filter(
        (item) => item.grade === "P" || item.grade === "NP",
      ).length,
      makeup: attempts.filter((item) => item.examType === "MAKEUP").length,
    }),
    [attempts],
  );
  const attemptedCredits = useMemo(
    () => attempts.reduce((total, item) => total + item.credits, 0),
    [attempts],
  );
  const updateAttempts = (update: SetStateAction<CourseAttempt[]>) => {
    setSummaryLoading(true);
    setAttempts(update);
  };

  const addAttempts = (records: CourseAttempt[]) => {
    updateAttempts((current) => [...current, ...records]);
    setPage("courses");
  };
  const openImport = (mode: ImportMode) => {
    setImportMode(mode);
    setPage("import");
  };
  const finishScreenshotImport = (records: CourseAttempt[]) => {
    updateAttempts((current) =>
      importMode === "REPLACE" ? records : [...current, ...records],
    );
    setPage("courses");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SZTU
            <br />
            <strong>GPA Planner</strong>
          </span>
        </div>
        <nav>
          {navItems.map(({ page: itemPage, label, icon: Icon }) => (
            <button
              className={page === itemPage ? "nav-item active" : "nav-item"}
              key={itemPage}
              onClick={() => {
                if (itemPage === "import") {
                  if (page !== "import") openImport("APPEND");
                  return;
                }
                setPage(itemPage);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          4.5 绩点制
          <br />
          数据默认仅保存在此浏览器
        </div>
      </aside>
      <main className="content">
        {initialLoad.warning && (
          <div className="notice warning">{initialLoad.warning}</div>
        )}
        {summaryError && (
          <div className="notice warning">计算服务提示：{summaryError}</div>
        )}
        {page === "dashboard" && (
          <Dashboard
            summary={summary}
            isSyncing={summaryLoading}
            attemptCount={attempts.length}
            attemptedCredits={attemptedCredits}
            counters={counters}
            onGo={setPage}
            onOpenImport={openImport}
          />
        )}
        {page === "import" && (
          <ImportPage mode={importMode} onImport={finishScreenshotImport} />
        )}
        {page === "courses" && (
          <CoursesPage
            attempts={attempts}
            summary={summary}
            isSyncing={summaryLoading}
            onAdd={addAttempts}
            onDelete={(id) =>
              updateAttempts((items) =>
                items.filter((item) => item.id !== id),
              )
            }
            onReplace={updateAttempts}
          />
        )}
        {page === "target" && <TargetPage summary={summary} />}
        {page === "simulator" && (
          <SimulatorPage attempts={attempts} summary={summary} />
        )}
        {page === "course-score" && <CourseScorePage />}
        {page === "rules" && <RulesPage />}
      </main>
    </div>
  );
}

function Dashboard({
  summary,
  isSyncing,
  attemptCount,
  attemptedCredits,
  counters,
  onGo,
  onOpenImport,
}: {
  summary: GpaSummary;
  isSyncing: boolean;
  attemptCount: number;
  attemptedCredits: number;
  counters: Record<string, number>;
  onGo: (page: Page) => void;
  onOpenImport: (mode: ImportMode) => void;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">学习规划工具</p>
          <h1>成绩总览</h1>
          <p>所有计算均保留原始分子、分母和考试记录。</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={() => onOpenImport("REPLACE")}>
            <RefreshCw size={17} />
            刷新全部成绩
          </button>
          <button className="primary" onClick={() => onOpenImport("APPEND")}>
            <Upload size={17} />
            导入成绩
          </button>
        </div>
      </header>
      {isSyncing && (
        <div className="notice refresh-notice" role="status">
          <RefreshCw size={16} />
          正在同步最新成绩…
        </div>
      )}
      <section className="hero-card">
        <div>
          <p className="eyebrow light">当前累计 GPA</p>
          <div className="gpa-number">
            {isSyncing ? "—" : (summary.displayGpa ?? "—")}
            <span>/ 4.50</span>
          </div>
          <p className="muted-light">
            {isSyncing
              ? "正在根据最新成绩重新计算"
              : `质量分 ${summary.qualityPoints.toFixed(2)} ÷ GPA 学分 ${summary.gpaCredits.toFixed(2)}`}
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-on-dark" onClick={() => onGo("target")}>
            设定 GPA 目标 <ChevronRight size={16} />
          </button>
          <button className="text-on-dark" onClick={() => onGo("courses")}>
            查看计算明细
          </button>
        </div>
      </section>
      <section className="metric-grid">
        <Metric
          label="已获得学分"
          value={isSyncing ? "—" : summary.earnedCredits.toFixed(1)}
        />
        <Metric
          label="GPA 计算学分"
          value={isSyncing ? "—" : summary.gpaCredits.toFixed(1)}
        />
        <Metric label="考试记录" value={String(attemptCount)} />
        <Metric label="所修总学分" value={attemptedCredits.toFixed(1)} />
      </section>
      <section className="two-column">
        <div className="panel">
          <div className="panel-title">
            <h2>成绩记录状态</h2>
            <button className="link-button" onClick={() => onGo("courses")}>
              管理课程
            </button>
          </div>
          <div className="state-list">
            <StateRow
              label="F / 挂科记录"
              value={counters.failures ?? 0}
              tone="red"
            />
            <StateRow
              label="P / NP 课程"
              value={counters.passFail ?? 0}
              tone="gray"
            />
            <StateRow
              label="补考记录"
              value={counters.makeup ?? 0}
              tone="purple"
            />
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>开始使用</h2>
          </div>
          <div className="flow">
            <button onClick={() => onOpenImport("APPEND")}>
              <span>1</span>复制粘贴或导入成绩单
              <ChevronRight size={16} />
            </button>
            <button onClick={() => onGo("courses")}>
              <span>2</span>核对并维护考试记录
              <ChevronRight size={16} />
            </button>
            <button onClick={() => onGo("target")}>
              <span>3</span>设置目标并模拟未来成绩
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {summary.policyWarnings.length > 0 && (
        <div className="notice warning">
          <strong>正式重修待确认：</strong>
          {summary.policyWarnings[0]?.message}
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function StateRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="state-row">
      <span className={`dot ${tone}`} />
      {label}
      <strong>{value}</strong>
    </div>
  );
}

function ImportPage({
  mode,
  onImport,
}: {
  mode: ImportMode;
  onImport: (records: CourseAttempt[]) => void;
}) {
  const [semester, setSemester] = useState("2025-2026-1");
  const [rawText, setRawText] = useState("");
  const [candidates, setCandidates] = useState<OcrCandidate[]>([]);
  const [ocrStatus, setOcrStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [structuredDragActive, setStructuredDragActive] = useState(false);
  const imageFileInput = useRef<HTMLInputElement>(null);
  const structuredFileInput = useRef<HTMLInputElement>(null);

  const parseText = () => {
    const structured = parseStructuredGradeText(rawText, semester);
    const parsed = deduplicateOcrCandidates(
      structured.length
        ? structured
        : parseTranscriptOcrText(rawText, semester),
    );
    setCandidates(parsed.unique);
    setOcrStatus(
      parsed.unique.length === 0
        ? "没有识别到课程。请从教务系统复制包含表头的完整成绩表，或改用 Excel/CSV 文件。"
        : parsed.duplicateCount
          ? `已${structured.length ? "按表格" : "按普通文本"}解析 ${parsed.unique.length} 条，并删除 ${parsed.duplicateCount} 条重复课程记录。`
          : `已${structured.length ? "按表格" : "按普通文本"}精确解析 ${parsed.unique.length} 条记录，请核对后导入。`,
    );
  };
  const receiveStructuredFiles = async (files: Iterable<File>) => {
    const selected = Array.from(files).filter((file) =>
      /\.(xlsx|xls|csv|tsv)$/i.test(file.name),
    );
    if (!selected.length) {
      setOcrStatus("请选择 XLS、XLSX、CSV 或 TSV 成绩单。");
      return;
    }
    setBusy(true);
    setOcrStatus("正在读取成绩表单元格…");
    try {
      const allCandidates: OcrCandidate[] = [];
      const sourceLabels: string[] = [];
      for (const [fileIndex, file] of selected.entries()) {
        const result = await parseStructuredGradeFile(file, semester);
        sourceLabels.push(result.sourceLabel);
        allCandidates.push(
          ...result.candidates.map((candidate) => ({
            ...candidate,
            id: `${candidate.id}-file-${fileIndex}`,
          })),
        );
      }
      const parsed = deduplicateOcrCandidates(allCandidates);
      setCandidates(parsed.unique);
      setOcrStatus(
        `已从 ${selected.length} 个文件精确读取 ${parsed.unique.length} 条记录${
          parsed.duplicateCount
            ? `，并删除 ${parsed.duplicateCount} 条重复课程记录`
            : ""
        }。来源：${sourceLabels.join("、")}。`,
      );
    } catch (error) {
      setOcrStatus(
        error instanceof Error ? `文件读取失败：${error.message}` : "文件读取失败。",
      );
    } finally {
      setBusy(false);
    }
  };
  const recogniseAndParseImages = async (
    files: File[],
    rejectedCount = 0,
    duplicateImageCount = 0,
  ) => {
    setBusy(true);
    setOcrStatus("正在初始化本地识别引擎…");
    try {
      const results: Array<{ text: string; confidence: number }> = [];
      for (const [index, file] of files.entries()) {
        setOcrStatus(`正在识别第 ${index + 1} / ${files.length} 张截图…`);
        results.push(
          await recogniseTranscriptImage(file, (progress) =>
            setOcrStatus(
              `第 ${index + 1} / ${files.length} 张：${progress.status} · ${progress.progress}%`,
            ),
          ),
        );
      }
      const combinedText = results.map((item) => item.text).join("\n");
      const averageConfidence =
        results.reduce((sum, item) => sum + item.confidence, 0) /
        results.length;
      const perImageCandidates = results.flatMap((item, imageIndex) =>
        applyOcrConfidence(
          parseTranscriptOcrText(item.text, semester),
          item.confidence,
        ).map((candidate) => ({
          ...candidate,
          id: `${candidate.id}-image-${imageIndex}`,
        })),
      );
      const parsed = deduplicateOcrCandidates(perImageCandidates);
      const lowConfidenceImages = results.filter(
        (item) => item.confidence < 70,
      ).length;
      setRawText(combinedText);
      setCandidates(parsed.unique);
      const rejectedMessage = rejectedCount
        ? `，已忽略 ${rejectedCount} 个不支持或超出限制的文件`
        : "";
      const duplicateImageMessage = duplicateImageCount
        ? `，已删除 ${duplicateImageCount} 张重复截图`
        : "";
      const duplicateRowMessage = parsed.duplicateCount
        ? `，并删除 ${parsed.duplicateCount} 条重复课程记录`
        : "";
      const confidenceMessage = lowConfidenceImages
        ? `，其中 ${lowConfidenceImages} 张清晰度偏低，相关行已标记复核`
        : "";
      setOcrStatus(
        `识别完成，共 ${results.length} 张${duplicateImageMessage}${rejectedMessage}${duplicateRowMessage}${confidenceMessage}，平均文本置信度 ${averageConfidence.toFixed(0)}%。请核对后导入。`,
      );
    } catch (error) {
      setOcrStatus(
        error instanceof Error
          ? `识别失败：${error.message}`
          : "识别失败，请尝试更清晰的图片。",
      );
    } finally {
      setBusy(false);
    }
  };
  const receiveFiles = async (files: Iterable<File>) => {
    const selected = selectTranscriptImages(files);
    if (selected.accepted.length === 0) {
      setOcrStatus(
        "没有可识别的图片。请使用 PNG、JPG、WEBP、BMP 或静态 GIF，并检查数量和大小限制。",
      );
      return;
    }
    setBusy(true);
    setOcrStatus("正在检查图片格式和重复内容…");
    try {
      const prepared = await prepareTranscriptImages(selected.accepted);
      const rejectedCount = selected.rejected.length + prepared.rejected.length;
      if (prepared.unique.length === 0) {
        setOcrStatus(
          prepared.duplicateCount
            ? `选择的图片均为重复截图，已自动删除 ${prepared.duplicateCount} 张。`
            : "没有通过格式检查的图片，请重新截图后上传。",
        );
        setBusy(false);
        return;
      }
      await recogniseAndParseImages(
        prepared.unique,
        rejectedCount,
        prepared.duplicateCount,
      );
    } catch (error) {
      setBusy(false);
      setOcrStatus(
        error instanceof Error
          ? `图片检查失败：${error.message}`
          : "图片检查失败，请重新选择。",
      );
    }
  };
  const update = (id: string, key: keyof OcrCandidate, value: string) =>
    setCandidates((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const editedItem = {
          ...item,
          issues: [],
          needsReview: true,
          confirmed: false,
        };
        if (key === "credits")
          return {
            ...editedItem,
            credits: value.trim() === "" ? -1 : Number(value),
          };
        if (key === "score") {
          if (value.trim() === "") {
            const { score: _removed, ...rest } = editedItem;
            return rest;
          }
          const score = Number(value);
          if (Number.isFinite(score) && score >= 0 && score <= 100) {
            const grade = gradeFromScore(score);
            return {
              ...editedItem,
              score,
              grade,
              gradePoint: gradePointForUiGrade(grade)!,
            };
          }
          return {
            ...editedItem,
            score,
          };
        }
        if (key === "gradePoint") {
          if (value.trim() === "") {
            const { gradePoint: _removed, ...rest } = editedItem;
            return rest;
          }
          return {
            ...editedItem,
            gradePoint: Number(value),
          };
        }
        if (key === "courseCode" && value.trim() === "") {
          const { courseCode: _removed, ...rest } = editedItem;
          return rest;
        }
        if (key === "grade" && value.trim() === "") {
          const { grade: _removed, gradePoint: _oldPoint, ...rest } = editedItem;
          return rest;
        }
        if (key === "grade") {
          const grade = value as UiGrade;
          if (grade === "P" || grade === "NP") {
            const {
              gradePoint: _oldPoint,
              score: _oldScore,
              ...rest
            } = editedItem;
            return { ...rest, grade };
          }
          const { gradePoint: _oldPoint, ...rest } = editedItem;
          const gradePoint = gradePointForUiGrade(grade);
          return {
            ...rest,
            grade,
            ...(gradePoint === undefined ? {} : { gradePoint }),
          };
        }
        return { ...editedItem, [key]: value };
      }),
    );
  const importRecords = () => {
    const invalid = candidates.some(
      (item) => !isImportableOcrCandidate(item) || !item.confirmed,
    );
    if (invalid) {
      setOcrStatus("每条记录都需要补全必填字段并勾选“已核对”后才能导入。");
      return;
    }
    onImport(
      candidates.map((item) => ({
        id: newId("import"),
        courseName: item.courseName,
        semester: item.semester,
        credits: item.credits,
        examType: item.examType,
        ...(item.courseCode === undefined
          ? {}
          : { courseCode: item.courseCode }),
        ...(item.score === undefined ? {} : { score: item.score }),
        ...(item.grade === undefined ? {} : { grade: item.grade }),
        ...(item.gradePoint === undefined
          ? {}
          : { gradePoint: item.gradePoint }),
      })),
    );
  };
  const importPreview = useMemo(() => {
    let importableRecords = 0;
    let gpaCredits = 0;
    let qualityPoints = 0;
    for (const item of candidates) {
      if (!isImportableOcrCandidate(item)) continue;
      importableRecords += 1;
      const grade =
        item.grade ??
        (item.score !== undefined ? gradeFromScore(item.score) : undefined);
      const gradePoint = gradePointForUiGrade(grade);
      if (
        gradePoint === undefined ||
        !Number.isFinite(item.credits) ||
        item.credits <= 0
      )
        continue;
      gpaCredits += item.credits;
      qualityPoints += item.credits * gradePoint;
    }
    return {
      importableRecords,
      gpaCredits,
      qualityPoints,
      gpa: gpaCredits > 0 ? qualityPoints / gpaCredits : null,
    };
  }, [candidates]);
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">本地高精度导入</p>
          <h1>复制成绩表，直接识别</h1>
          <p>
            推荐从教务系统复制整张成绩表并粘贴；也可拖入 Excel/CSV。无需密码、无需插件，文件解析只在当前浏览器完成。
          </p>
        </div>
      </header>
      {mode === "REPLACE" && (
        <div className="notice refresh-notice">
          <strong>刷新模式：</strong>
          旧成绩会一直保留，直到新的识别记录全部审核通过并完成导入；届时将整批替换旧数据。
        </div>
      )}
      <section className="panel import-panel">
        <div className="field-row">
          <label>
            未识别学期时的默认值
            <input
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
            />
          </label>
        </div>
        <div className="import-method-heading">
          <span className="method-number">1</span>
          <div>
            <strong>复制粘贴成绩表</strong>
            <p>最方便：在教务系统中选中整张表，复制后粘贴到这里。</p>
          </div>
          <span className="recommended-badge">推荐</span>
        </div>
        <label>
          直接粘贴教务系统成绩表（推荐）
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={"请连同表头一起复制，例如：\n学期　课程编号　课程名称　学分　成绩　等级　绩点　考试性质"}
            rows={7}
          />
        </label>
        <button className="primary compact-action" onClick={parseText} disabled={!rawText.trim()}>
          识别粘贴内容
        </button>
        <div className="divider">
          <span>或</span>
        </div>
        <div className="import-method-heading">
          <span className="method-number">2</span>
          <div>
            <strong>导入 Excel / CSV 成绩单</strong>
            <p>直接读取单元格，不经过图片识别。</p>
          </div>
        </div>
        <button
          className={`dropzone structured-dropzone ${structuredDragActive ? "drag-active" : ""}`}
          onClick={() => structuredFileInput.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy) setStructuredDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setStructuredDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setStructuredDragActive(false);
            if (!busy) void receiveStructuredFiles(event.dataTransfer.files);
          }}
          disabled={busy}
        >
          <FileUp size={31} />
          <strong>
            {structuredDragActive ? "松开鼠标，读取成绩单" : "拖入 Excel / CSV，或点击选择"}
          </strong>
          <span>支持 XLS、XLSX、CSV、TSV；电脑和手机浏览器均无需安装插件。</span>
        </button>
        <input
          className="hidden"
          ref={structuredFileInput}
          type="file"
          accept=".xls,.xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void receiveStructuredFiles(files);
            event.target.value = "";
          }}
        />
        <div className="divider">
          <span>截图识别（备用）</span>
        </div>
        <p className="fallback-note">只有无法复制或下载成绩单时才建议使用截图；截图结果必须人工核对。</p>
        <button
          className={`dropzone ${dragActive ? "drag-active" : ""}`}
          onClick={() => imageFileInput.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy) setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (!busy) void receiveFiles(event.dataTransfer.files);
          }}
          disabled={busy}
        >
          <FileUp size={31} />
          <strong>
            {busy
              ? "正在处理截图…"
              : dragActive
                ? "松开鼠标，开始识别"
                : "拖入成绩截图，或点击选择"}
          </strong>
          <span>
            最多 8 张、单张 12 MB、合计 60 MB；手机可从相册或文件中选择。
          </span>
        </button>
        <input
          className="hidden"
          ref={imageFileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void receiveFiles(files);
            event.target.value = "";
          }}
        />
        {ocrStatus && (
          <p className="ocr-status" aria-live="polite">
            {ocrStatus}
          </p>
        )}
      </section>
      {candidates.length > 0 && (
        <section className="panel candidate-panel">
          <div className="panel-title">
            <div>
              <h2>导入前核对</h2>
              <p>黄色提示请优先复查；完整记录可以一键通过审核。</p>
            </div>
            <div className="header-actions">
              <button
                className="secondary"
                onClick={() => {
                  const confirmed = confirmImportableCandidates(candidates);
                  setCandidates(confirmed);
                  const skipped = confirmed.filter(
                    (item) => !item.confirmed,
                  ).length;
                  setOcrStatus(
                    skipped
                      ? `已批量通过 ${confirmed.length - skipped} 条，另有 ${skipped} 条信息不完整或存在冲突，请单独核对。`
                      : `已批量通过全部 ${confirmed.length} 条记录。`,
                  );
                }}
              >
                一键全部通过审核
              </button>
              <button
                className="primary"
                onClick={importRecords}
                disabled={candidates.some((item) => !item.confirmed)}
              >
                {mode === "REPLACE" ? "替换旧数据并导入" : "确认导入"}{" "}
                {candidates.length} 条记录
              </button>
            </div>
          </div>
          <div className="import-preview">
            <span>可导入记录 <strong>{importPreview.importableRecords} / {candidates.length}</strong></span>
            <span>GPA 学分 <strong>{importPreview.gpaCredits.toFixed(1)}</strong></span>
            <span>质量分 <strong>{importPreview.qualityPoints.toFixed(1)}</strong></span>
            <span>预估 GPA <strong>{importPreview.gpa?.toFixed(2) ?? "—"}</strong></span>
          </div>
          <p className="formula-note">
            GPA = Σ（课程学分 × 课程绩点）÷ Σ计入 GPA 的课程学分；F 的学分计入分母，P/NP 不计入。
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>课程</th>
                  <th>学期</th>
                  <th>学分</th>
                  <th>成绩</th>
                  <th>等级</th>
                  <th>绩点</th>
                  <th>考试性质</th>
                  <th>状态</th>
                  <th>已核对</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        aria-label={`${item.id} 课程号`}
                        value={item.courseCode ?? ""}
                        placeholder="课程号"
                        onChange={(event) =>
                          update(item.id, "courseCode", event.target.value)
                        }
                      />
                      <input
                        aria-label={`${item.id} 课程名称`}
                        value={item.courseName}
                        onChange={(event) =>
                          update(item.id, "courseName", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${item.courseName} 学期`}
                        value={item.semester}
                        onChange={(event) =>
                          update(item.id, "semester", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${item.courseName} 学分`}
                        type="number"
                        min="0"
                        max="100"
                        value={item.credits < 0 ? "" : item.credits}
                        onChange={(event) =>
                          update(item.id, "credits", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${item.courseName} 成绩`}
                        type="number"
                        min="0"
                        max="100"
                        value={item.score ?? ""}
                        onChange={(event) =>
                          update(item.id, "score", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${item.courseName} 等级`}
                        value={item.grade ?? ""}
                        onChange={(event) =>
                          update(item.id, "grade", event.target.value)
                        }
                      >
                        <option value="">待确认</option>
                        {[...UI_LETTER_GRADES, ...UI_PASS_FAIL_GRADES].map(
                          (grade) => (
                            <option value={grade} key={grade}>
                              {grade}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${item.courseName} 绩点`}
                        type="number"
                        min="0"
                        max="4.5"
                        step="0.5"
                        value={item.gradePoint ?? ""}
                        onChange={(event) =>
                          update(item.id, "gradePoint", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${item.courseName} 考试性质`}
                        value={item.examType}
                        onChange={(event) =>
                          update(item.id, "examType", event.target.value)
                        }
                      >
                        {UI_EXAM_TYPES.map((type) => (
                          <option value={type} key={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {item.needsReview ? (
                        <>
                          <span className="review">需核对</span>
                          {item.issues.length > 0 && (
                            <small className="warning-text">
                              {item.issues.join("；")}
                            </small>
                          )}
                        </>
                      ) : (
                        <span className="verified">可导入</span>
                      )}
                    </td>
                    <td>
                      <input
                        aria-label={`${item.courseName} 已核对`}
                        type="checkbox"
                        checked={item.confirmed}
                        onChange={(event) =>
                          setCandidates((items) =>
                            items.map((candidate) =>
                              candidate.id === item.id
                                ? {
                                    ...candidate,
                                    confirmed: event.target.checked,
                                  }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`忽略 ${item.courseName}`}
                        onClick={() =>
                          setCandidates((items) =>
                            items.filter(
                              (candidate) => candidate.id !== item.id,
                            ),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function CoursesPage({
  attempts,
  summary,
  isSyncing,
  onAdd,
  onDelete,
  onReplace,
}: {
  attempts: CourseAttempt[];
  summary: GpaSummary;
  isSyncing: boolean;
  onAdd: (records: CourseAttempt[]) => void;
  onDelete: (id: string) => void;
  onReplace: (records: CourseAttempt[]) => void;
}) {
  const [manual, setManual] = useState(initialManual);
  const backupInput = useRef<HTMLInputElement>(null);
  const manualScore = numberOrUndefined(manual.score);
  const manualDerivedGrade =
    manualScore !== undefined && manualScore >= 0 && manualScore <= 100
      ? gradeFromScore(manualScore)
      : undefined;
  const manualDerivedGradePoint = gradePointForUiGrade(manualDerivedGrade);
  const addManual = (event: React.FormEvent) => {
    event.preventDefault();
    const credits = numberOrUndefined(manual.credits);
    const score = numberOrUndefined(manual.score);
    if (
      !manual.courseName.trim() ||
      credits === undefined ||
      (score === undefined && !manual.grade)
    )
      return;
    onAdd([
      {
        id: newId(),
        courseName: manual.courseName.trim(),
        semester: manual.semester.trim() || "未填写学期",
        credits,
        examType: manual.examType as UiExamType,
        ...(manual.courseCode.trim()
          ? { courseCode: manual.courseCode.trim() }
          : {}),
        ...(score === undefined ? {} : { score }),
        ...(manualDerivedGrade
          ? { grade: manualDerivedGrade }
          : manual.grade
            ? { grade: manual.grade as UiGrade }
            : {}),
      },
    ]);
    setManual(initialManual);
  };
  const exportBackup = () => {
    const href = URL.createObjectURL(
      new Blob([createBackupText(attempts)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "sztu-gpa-backup.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };
  const importBackup = async (file: File) => {
    try {
      const restored = parseBackupText(await file.text());
      const confirmed = window.confirm(
        `备份中有 ${restored.length} 条记录。继续将替换当前 ${attempts.length} 条记录，建议先导出当前 JSON。确定替换吗？`,
      );
      if (confirmed) onReplace(restored);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "这不是可识别的成绩备份文件。",
      );
    }
  };
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">成绩档案</p>
          <h1>我的课程</h1>
          <p>每一条考试记录独立保存；补考不会覆盖原始 F。</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={exportBackup}>
            导出 JSON
          </button>
          <button
            className="secondary"
            onClick={() => backupInput.current?.click()}
          >
            导入 JSON
          </button>
          <input
            className="hidden"
            ref={backupInput}
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>
      <section className="panel add-course">
        <h2>手动新增考试记录</h2>
        <form onSubmit={addManual}>
          <input
            placeholder="课程编号（可选）"
            value={manual.courseCode}
            onChange={(e) =>
              setManual({ ...manual, courseCode: e.target.value })
            }
          />
          <input
            placeholder="课程名称"
            required
            value={manual.courseName}
            onChange={(e) =>
              setManual({ ...manual, courseName: e.target.value })
            }
          />
          <input
            placeholder="学期"
            required
            value={manual.semester}
            onChange={(e) => setManual({ ...manual, semester: e.target.value })}
          />
          <input
            type="number"
            min="0"
            max="100"
            placeholder="学分"
            required
            value={manual.credits}
            onChange={(e) => setManual({ ...manual, credits: e.target.value })}
          />
          <input
            type="number"
            min="0"
            max="100"
            placeholder="成绩（可选）"
            value={manual.score}
            onChange={(e) => {
              const scoreText = e.target.value;
              const score = numberOrUndefined(scoreText);
              const derivedGrade =
                score !== undefined && score >= 0 && score <= 100
                  ? gradeFromScore(score)
                  : undefined;
              setManual({
                ...manual,
                score: scoreText,
                grade: derivedGrade ?? (scoreText ? manual.grade : ""),
              });
            }}
          />
          <select
            value={manual.grade}
            onChange={(e) => setManual({ ...manual, grade: e.target.value })}
            disabled={manualDerivedGrade !== undefined}
            aria-label="成绩等级"
          >
            <option value="">根据成绩 / 选择等级</option>
            {[...UI_LETTER_GRADES, ...UI_PASS_FAIL_GRADES].map((grade) => (
              <option key={grade} value={grade}>
                {gradeLabels[grade]}
              </option>
            ))}
          </select>
          <select
            value={manual.examType}
            onChange={(e) => setManual({ ...manual, examType: e.target.value })}
          >
            {UI_EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button className="primary" type="submit">
            <Plus size={16} />
            新增
          </button>
        </form>
        {manualDerivedGrade && manualDerivedGradePoint !== undefined && (
          <p className="grade-preview" aria-live="polite">
            自动换算：{manualScore} 分 → {manualDerivedGrade} → 绩点 {manualDerivedGradePoint.toFixed(1)}
          </p>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>已录入记录</h2>
            <p>
              {isSyncing
                ? "正在同步最新成绩…"
                : `质量分 ${summary.qualityPoints.toFixed(2)}，GPA 分母 ${summary.gpaCredits.toFixed(2)}`}
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学期 / 课程</th>
                <th>成绩</th>
                <th>等级 / 绩点</th>
                <th>学分</th>
                <th>考试性质</th>
                <th>GPA 贡献</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summary.contributions.length === 0 && attempts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    还没有课程记录。可以手动录入，或复制粘贴/导入成绩单。
                  </td>
                </tr>
              ) : isSyncing || summary.contributions.length === 0 ? (
                attempts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.courseName}</strong>
                      <small>
                        {item.courseCode ?? "未填写课程号"} · {item.semester}
                      </small>
                    </td>
                    <td>{item.score ?? "—"}</td>
                    <td>{item.grade ?? "待计算"}</td>
                    <td>{item.credits}</td>
                    <td>{item.examType}</td>
                    <td>
                      <small className="warning-text">
                        {isSyncing ? "正在重新计算" : "计算服务暂不可用"}
                      </small>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`删除 ${item.courseName}`}
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                summary.contributions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.courseName}</strong>
                      <small>
                        {item.courseCode ?? "未填写课程号"} · {item.semester}
                      </small>
                    </td>
                    <td>{item.score ?? "—"}</td>
                    <td>
                      <span
                        className={item.grade === "F" ? "grade bad" : "grade"}
                      >
                        {item.grade}
                      </span>{" "}
                      {item.gradePoint ?? "—"}
                    </td>
                    <td>{item.credits}</td>
                    <td>{item.examType}</td>
                    <td>
                      {item.includedInGpa
                        ? `${item.qualityPoints.toFixed(1)} / ${item.gpaCredits.toFixed(1)}`
                        : "不计入"}
                      {item.warnings?.length ? (
                        <small className="warning-text">需复核</small>
                      ) : null}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`删除 ${item.courseName}`}
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TargetPage({ summary }: { summary: GpaSummary }) {
  const [targetGpa, setTargetGpa] = useState("3.30");
  const [futureCredits, setFutureCredits] = useState("60");
  const [plan, setPlan] = useState<TargetPlan | null>(null);
  const [error, setError] = useState("");
  const calculate = async () => {
    if (summary.gpaCredits <= 0) {
      setPlan(null);
      setError("请先录入至少一门计入 GPA 的课程。");
      return;
    }
    try {
      setPlan(
        await planTargetGpa({
          currentQualityPoints: summary.qualityPoints,
          currentGpaCredits: summary.gpaCredits,
          futureGpaCredits: Number(futureCredits),
          targetGpa: Number(targetGpa),
        }),
      );
      setError("");
    } catch (reason) {
      setPlan(null);
      setError(reason instanceof Error ? reason.message : "无法计算目标。");
    }
  };
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">累计 GPA 反推</p>
          <h1>目标规划</h1>
          <p>使用未四舍五入的当前质量分；满绩点固定为 SZTU 的 4.5。</p>
        </div>
      </header>
      <section className="planner-card">
        <div className="planner-inputs">
          <label>
            目标累计 GPA
            <input
              type="number"
              min="0"
              max="4.5"
              step="0.01"
              value={targetGpa}
              onChange={(e) => {
                setTargetGpa(e.target.value);
                setPlan(null);
                setError("");
              }}
            />
          </label>
          <label>
            未来 GPA 学分
            <input
              type="number"
              min="0.1"
              max="100000"
              step="0.1"
              value={futureCredits}
              onChange={(e) => {
                setFutureCredits(e.target.value);
                setPlan(null);
                setError("");
              }}
            />
          </label>
          <button className="primary" onClick={() => void calculate()}>
            计算所需成绩
          </button>
        </div>
        {error && <div className="notice warning">{error}</div>}
        {plan && (
          <div className="plan-result">
            <StatusPill status={plan.status} />
            <p>
              为了达到 <strong>{plan.targetGpa.toFixed(2)}</strong>，未来{" "}
              <strong>{plan.futureGpaCredits}</strong> GPA 学分平均需要
            </p>
            <strong className="plan-number">
              {plan.status === "ALREADY_ACHIEVED"
                ? "0.00"
                : plan.displayRequiredFutureGpa}
            </strong>
            <p>
              理论最高可达累计 GPA：
              <strong>{plan.displayMaximumReachableGpa}</strong>
            </p>
            {plan.status === "IMPOSSIBLE" && (
              <p className="warning-text">
                该目标超过 4.5 满绩点下的理论上限，请调整目标或未来可计入 GPA
                的学分。
              </p>
            )}
          </div>
        )}
      </section>
      <section className="panel compact">
        <h2>当前计算基数</h2>
        <div className="mini-metrics">
          <Metric label="质量分" value={summary.qualityPoints.toFixed(2)} />
          <Metric label="当前 GPA" value={summary.displayGpa ?? "—"} />
          <Metric label="GPA 学分" value={summary.gpaCredits.toFixed(1)} />
        </div>
      </section>
    </>
  );
}

function SimulatorPage({
  attempts,
  summary,
}: {
  attempts: CourseAttempt[];
  summary: GpaSummary;
}) {
  const [courses, setCourses] = useState([
    {
      id: newId("plan"),
      name: "消费者行为",
      credits: "3",
      grade: "A" as UiGrade,
    },
    {
      id: newId("plan"),
      name: "市场研究",
      credits: "3",
      grade: "A" as UiGrade,
    },
    {
      id: newId("plan"),
      name: "商务英语",
      credits: "2",
      grade: "B+" as UiGrade,
    },
  ]);
  const [projected, setProjected] = useState<GpaSummary | null>(null);
  const [simulationError, setSimulationError] = useState("");
  useEffect(() => {
    let ignore = false;
    const future = courses.map((course) => ({
      id: course.id,
      courseName: course.name || "未命名规划课程",
      semester: "规划学期",
      credits: course.credits.trim() === "" ? 0 : Number(course.credits),
      grade: course.grade,
      examType: "NORMAL" as UiExamType,
    }));
    void calculateGpa([...attempts, ...future])
      .then((result) => {
        if (!ignore) {
          setProjected(result);
          setSimulationError("");
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setProjected(null);
          setSimulationError(
            error instanceof Error ? error.message : "模拟课程数据无法计算。",
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [attempts, courses]);
  const add = () =>
    setCourses((items) => [
      ...items,
      { id: newId("plan"), name: "新课程", credits: "3", grade: "A" },
    ]);
  const update = (
    id: string,
    key: "name" | "credits" | "grade",
    value: string,
  ) =>
    setCourses((items) =>
      items.map((course) =>
        course.id === id ? { ...course, [key]: value } : course,
      ),
    );
  const futureContributions =
    projected?.contributions.filter((item) => item.semester === "规划学期") ??
    [];
  const futureCredits = futureContributions.reduce(
    (sum, item) => sum + item.gpaCredits,
    0,
  );
  const futurePoints = futureContributions.reduce(
    (sum, item) => sum + item.qualityPoints,
    0,
  );
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">未来情景</p>
          <h1>学期模拟器</h1>
          <p>模拟成绩不会写入正式成绩档案。</p>
        </div>
      </header>
      {simulationError && (
        <div className="notice warning">{simulationError}</div>
      )}
      <section className="two-column">
        <div className="panel">
          <div className="panel-title">
            <h2>规划课程</h2>
            <button className="secondary" onClick={add}>
              <Plus size={16} />
              添加课程
            </button>
          </div>
          <div className="simulation-list">
            {courses.map((course) => (
              <div className="simulation-row" key={course.id}>
                <input
                  aria-label={`${course.name} 课程名称`}
                  value={course.name}
                  onChange={(e) => update(course.id, "name", e.target.value)}
                />
                <input
                  aria-label={`${course.name} 学分`}
                  type="number"
                  min="0"
                  max="100"
                  value={course.credits}
                  onChange={(e) => update(course.id, "credits", e.target.value)}
                />
                <select
                  aria-label={`${course.name} 目标等级`}
                  value={course.grade}
                  onChange={(e) => update(course.id, "grade", e.target.value)}
                >
                  {UI_LETTER_GRADES.map((grade) => (
                    <option value={grade} key={grade}>
                      {gradeLabels[grade]}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={`删除规划课程 ${course.name}`}
                  className="icon-button"
                  onClick={() =>
                    setCourses((items) =>
                      items.filter((item) => item.id !== course.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel simulation-summary">
          <p className="eyebrow">预测结果</p>
          <div className="gpa-number dark">
            {futureCredits ? (futurePoints / futureCredits).toFixed(2) : "—"}
          </div>
          <p>本学期预计 GPA</p>
          <div className="compare">
            <span>
              当前累计 GPA <strong>{summary.displayGpa ?? "—"}</strong>
            </span>
            <ChevronRight size={16} />
            <span>
              预计累计 GPA <strong>{projected?.displayGpa ?? "—"}</strong>
            </span>
          </div>
          <p className="muted">
            假设未来课程全部计入 GPA，且不影响既有考试记录。
          </p>
        </div>
      </section>
    </>
  );
}

function CourseScorePage() {
  const [targetScore, setTargetScore] = useState("85");
  const [components, setComponents] = useState([
    { name: "平时", weight: "20", score: "88" },
    { name: "项目", weight: "20", score: "92" },
    { name: "期中", weight: "20", score: "84" },
    { name: "期末", weight: "40", score: "" },
  ]);
  const [result, setResult] = useState<CourseScorePlan | null>(null);
  const [error, setError] = useState("");
  const calculate = async () => {
    try {
      setResult(
        await calculateRequiredScore({
          targetScore: Number(targetScore),
          components: components.map((item) => ({
            name: item.name,
            weight: Number(item.weight),
            ...(item.score === "" ? {} : { score: Number(item.score) }),
          })),
        }),
      );
      setError("");
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : "无法计算。");
    }
  };
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">单科反推</p>
          <h1>剩余考核需要多少分？</h1>
          <p>请保留一个未知成绩项，且所有权重合计必须为 100%。</p>
        </div>
      </header>
      <section className="panel">
        <div className="course-score-layout">
          <div>
            <label>
              目标总评
              <input
                type="number"
                min="0"
                max="100"
                value={targetScore}
                onChange={(e) => {
                  setTargetScore(e.target.value);
                  setResult(null);
                  setError("");
                }}
              />
            </label>
            <div className="component-list">
              {components.map((component, index) => (
                <div className="component-row" key={index}>
                  <input
                    aria-label={`考核项 ${index + 1} 名称`}
                    value={component.name}
                    onChange={(e) => {
                      setResult(null);
                      setError("");
                      setComponents((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: e.target.value }
                            : item,
                        ),
                      );
                    }}
                  />
                  <input
                    aria-label={`${component.name || `考核项 ${index + 1}`} 权重`}
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={component.weight}
                    onChange={(e) => {
                      setResult(null);
                      setError("");
                      setComponents((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, weight: e.target.value }
                            : item,
                        ),
                      );
                    }}
                  />
                  <input
                    aria-label={`${component.name || `考核项 ${index + 1}`} 成绩`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="未知"
                    value={component.score}
                    onChange={(e) => {
                      setResult(null);
                      setError("");
                      setComponents((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, score: e.target.value }
                            : item,
                        ),
                      );
                    }}
                  />
                  <button
                    aria-label={`删除考核项 ${component.name || index + 1}`}
                    className="icon-button"
                    onClick={() => {
                      setResult(null);
                      setError("");
                      setComponents((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="header-actions">
              <button
                className="secondary"
                onClick={() => {
                  setResult(null);
                  setError("");
                  setComponents((items) => [
                    ...items,
                    { name: "新考核项", weight: "10", score: "" },
                  ]);
                }}
              >
                <Plus size={16} />
                添加考核项
              </button>
              <button className="primary" onClick={() => void calculate()}>
                反推成绩
              </button>
            </div>
          </div>
          <div className="course-score-result">
            {error && <div className="notice warning">{error}</div>}
            {result ? (
              <>
                <StatusPill status={result.status} />
                <p>
                  在 <strong>{result.unknownComponent}</strong> 中至少需要
                </p>
                <strong className="plan-number">
                  {result.status === "ALREADY_ACHIEVED"
                    ? "0.00"
                    : result.displayRequiredScore}
                </strong>
                <p>已获得加权分：{result.knownWeightedScore.toFixed(2)}</p>
              </>
            ) : (
              <p className="muted">输入项目后开始计算。</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function RulesPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SZTU 规则口径</p>
          <h1>计算说明</h1>
          <p>用于学习规划与估算，不替代学校正式成绩单。</p>
        </div>
      </header>
      <section className="panel rules">
        <h2>累计 GPA 公式</h2>
        <div className="grade-map">
          GPA = Σ（课程学分 × 课程绩点）÷ Σ计入 GPA 的课程学分
        </div>
        <p>例如一门 3 学分、82 分的课程：82 → B+ → 3.5，贡献质量分 3 × 3.5 = 10.5。</p>
        <h2>成绩映射</h2>
        <div className="grade-map">
          93–100 A+ / 4.5 · 85–92 A / 4.0 · 80–84 B+ / 3.5 · 75–79 B / 3.0 ·
          70–74 C+ / 2.5 · 65–69 C / 2.0 · 60–64 D / 1.0 · 0–59 F / 0
        </div>
        <h2>已确认的处理方式</h2>
        <ul>
          <li>F 的绩点为 0，但原课程学分仍进入 GPA 分母。</li>
          <li>P/NP 不进入 GPA；P 可以获得学分，NP 不获得学分。</li>
          <li>正常考试 F 与补考 D 作为两条 attempt 分别计算，不能互相覆盖。</li>
          <li>正式重修的最终累计 GPA 规则尚未完全确认；系统会显示提示。</li>
        </ul>
      </section>
    </>
  );
}

export default App;
