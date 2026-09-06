import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator, ChevronRight, FileImage, FileUp, GraduationCap, LayoutDashboard,
  Plus, Settings, Target, Trash2, Upload, WandSparkles,
} from 'lucide-react';

import {
  calculateGpa, calculateRequiredScore, planTargetGpa,
  type CourseAttempt, type CourseScorePlan, type GpaSummary, type TargetPlan,
} from './lib/api';
import { recogniseTranscriptImage } from './lib/ocr';
import {
  applyOcrConfidence, parseTranscriptOcrText, UI_EXAM_TYPES, UI_LETTER_GRADES, UI_PASS_FAIL_GRADES,
  type OcrCandidate, type UiExamType, type UiGrade,
} from './lib/ocr-parser';
import { createBackupText, parseBackupText, readStoredAttempts } from './lib/storage';

type Page = 'dashboard' | 'import' | 'courses' | 'target' | 'simulator' | 'course-score' | 'rules';

const STORAGE_KEY = 'sztu-gpa-planner-attempts-v1';
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
  'A+': 'A+ · 4.5', A: 'A · 4.0', 'B+': 'B+ · 3.5', B: 'B · 3.0',
  'C+': 'C+ · 2.5', C: 'C · 2.0', D: 'D · 1.0', F: 'F · 0', P: '通过 P', NP: '不通过 NP',
};

const navItems: Array<{ page: Page; label: string; icon: typeof LayoutDashboard }> = [
  { page: 'dashboard', label: '总览', icon: LayoutDashboard },
  { page: 'import', label: '成绩导入', icon: FileImage },
  { page: 'courses', label: '我的课程', icon: GraduationCap },
  { page: 'target', label: '目标规划', icon: Target },
  { page: 'simulator', label: '学期模拟', icon: WandSparkles },
  { page: 'course-score', label: '单科计算', icon: Calculator },
  { page: 'rules', label: '规则说明', icon: Settings },
];

const initialManual = {
  courseCode: '', courseName: '', semester: '2025-2026-1', credits: '3', score: '', grade: '', examType: 'NORMAL',
};

function localAttempts(): CourseAttempt[] {
  return readStoredAttempts(localStorage.getItem(STORAGE_KEY));
}

function newId(prefix = 'attempt'): string {
  return typeof crypto?.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberOrUndefined(value: string): number | undefined {
  const number = Number(value);
  return value.trim() === '' || !Number.isFinite(number) ? undefined : number;
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'ACHIEVABLE' ? '可实现' : status === 'IMPOSSIBLE' ? '暂不可达' : '已达到';
  return <span className={`pill pill-${status.toLowerCase()}`}>{label}</span>;
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [attempts, setAttempts] = useState<CourseAttempt[]>(localAttempts);
  const [summary, setSummary] = useState<GpaSummary>(emptySummary);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, createBackupText(attempts));
    let ignore = false;
    if (attempts.length === 0) {
      setSummary(emptySummary);
      return undefined;
    }
    void calculateGpa(attempts)
      .then((result) => { if (!ignore) { setSummary(result); setSummaryError(''); } })
      .catch((error: unknown) => { if (!ignore) setSummaryError(error instanceof Error ? error.message : '无法连接计算服务。'); });
    return () => { ignore = true; };
  }, [attempts]);

  const counters = useMemo(() => ({
    failures: summary.contributions.filter((item) => item.grade === 'F').length,
    passFail: summary.contributions.filter((item) => item.grade === 'P' || item.grade === 'NP').length,
    makeup: summary.contributions.filter((item) => item.examType === 'MAKEUP').length,
  }), [summary]);

  const addAttempts = (records: CourseAttempt[]) => {
    setAttempts((current) => [...current, ...records]);
    setPage('courses');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>SZTU<br /><strong>GPA Planner</strong></span></div>
        <nav>{navItems.map(({ page: itemPage, label, icon: Icon }) => (
          <button className={page === itemPage ? 'nav-item active' : 'nav-item'} key={itemPage} onClick={() => setPage(itemPage)}>
            <Icon size={18} />{label}
          </button>
        ))}</nav>
        <div className="sidebar-note">4.5 绩点制<br />数据默认仅保存在此浏览器</div>
      </aside>
      <main className="content">
        {summaryError && <div className="notice warning">计算服务提示：{summaryError}</div>}
        {page === 'dashboard' && <Dashboard summary={summary} counters={counters} onGo={setPage} />}
        {page === 'import' && <ImportPage onImport={addAttempts} />}
        {page === 'courses' && <CoursesPage attempts={attempts} summary={summary} onAdd={addAttempts} onDelete={(id) => setAttempts((items) => items.filter((item) => item.id !== id))} onReplace={setAttempts} />}
        {page === 'target' && <TargetPage summary={summary} />}
        {page === 'simulator' && <SimulatorPage attempts={attempts} summary={summary} />}
        {page === 'course-score' && <CourseScorePage />}
        {page === 'rules' && <RulesPage />}
      </main>
    </div>
  );
}

function Dashboard({ summary, counters, onGo }: { summary: GpaSummary; counters: Record<string, number>; onGo: (page: Page) => void }) {
  return <>
    <header className="page-header"><div><p className="eyebrow">学习规划工具</p><h1>成绩总览</h1><p>所有计算均保留原始分子、分母和考试记录。</p></div><button className="primary" onClick={() => onGo('import')}><Upload size={17} />导入成绩截图</button></header>
    <section className="hero-card">
      <div><p className="eyebrow light">当前累计 GPA</p><div className="gpa-number">{summary.displayGpa ?? '—'}<span>/ 4.50</span></div><p className="muted-light">质量分 {summary.qualityPoints.toFixed(2)} ÷ GPA 学分 {summary.gpaCredits.toFixed(2)}</p></div>
      <div className="hero-actions"><button className="secondary-on-dark" onClick={() => onGo('target')}>设定 GPA 目标 <ChevronRight size={16} /></button><button className="text-on-dark" onClick={() => onGo('courses')}>查看计算明细</button></div>
    </section>
    <section className="metric-grid">
      <Metric label="已获得学分" value={summary.earnedCredits.toFixed(1)} /><Metric label="GPA 计算学分" value={summary.gpaCredits.toFixed(1)} /><Metric label="考试记录" value={String(summary.contributions.length)} /><Metric label="所修总学分" value={summary.attemptedCredits.toFixed(1)} />
    </section>
    <section className="two-column">
      <div className="panel"><div className="panel-title"><h2>成绩记录状态</h2><button className="link-button" onClick={() => onGo('courses')}>管理课程</button></div><div className="state-list"><StateRow label="F / 挂科记录" value={counters.failures ?? 0} tone="red" /><StateRow label="P / NP 课程" value={counters.passFail ?? 0} tone="gray" /><StateRow label="补考记录" value={counters.makeup ?? 0} tone="purple" /></div></div>
      <div className="panel"><div className="panel-title"><h2>开始使用</h2></div><div className="flow"><button onClick={() => onGo('import')}><span>1</span>上传截图或粘贴 OCR 文本<ChevronRight size={16} /></button><button onClick={() => onGo('courses')}><span>2</span>核对并维护考试记录<ChevronRight size={16} /></button><button onClick={() => onGo('target')}><span>3</span>设置目标并模拟未来成绩<ChevronRight size={16} /></button></div></div>
    </section>
    {summary.policyWarnings.length > 0 && <div className="notice warning"><strong>正式重修待确认：</strong>{summary.policyWarnings[0]?.message}</div>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function StateRow({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="state-row"><span className={`dot ${tone}`} />{label}<strong>{value}</strong></div>; }

function ImportPage({ onImport }: { onImport: (records: CourseAttempt[]) => void }) {
  const [semester, setSemester] = useState('2025-2026-1');
  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<OcrCandidate[]>([]);
  const [ocrStatus, setOcrStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const parseText = () => setCandidates(parseTranscriptOcrText(rawText, semester));
  const chooseImages = async (files: File[]) => {
    setBusy(true); setOcrStatus('正在初始化本地识别引擎…');
    try {
      const results: Array<{ text: string; confidence: number }> = [];
      for (const [index, file] of files.entries()) {
        setOcrStatus(`正在识别第 ${index + 1} / ${files.length} 张截图…`);
        results.push(await recogniseTranscriptImage(file, (progress) => setOcrStatus(`第 ${index + 1} / ${files.length} 张：${progress.status} · ${progress.progress}%`)));
      }
      const combinedText = results.map((item) => item.text).join('\n');
      const averageConfidence = results.reduce((sum, item) => sum + item.confidence, 0) / results.length;
      setRawText(combinedText); setCandidates(applyOcrConfidence(parseTranscriptOcrText(combinedText, semester), averageConfidence));
      setOcrStatus(`识别完成，共 ${results.length} 张，平均文本置信度 ${averageConfidence.toFixed(0)}%。请逐条核对。`);
    } catch (error) { setOcrStatus(error instanceof Error ? `识别失败：${error.message}` : '识别失败，请尝试更清晰的图片。'); } finally { setBusy(false); }
  };
  const update = (id: string, key: keyof OcrCandidate, value: string) => setCandidates((items) => items.map((item) => {
    if (item.id !== id) return item;
    if (key === 'credits') return { ...item, credits: Number(value), needsReview: true };
    if (key === 'score' || key === 'gradePoint') {
      if (value.trim() === '') { const { [key]: _removed, ...rest } = item; return { ...rest, needsReview: true, confirmed: false }; }
      return { ...item, [key]: Number(value), needsReview: true, confirmed: false };
    }
    if (key === 'courseCode' && value.trim() === '') { const { courseCode: _removed, ...rest } = item; return { ...rest, needsReview: true, confirmed: false }; }
    return { ...item, [key]: value, needsReview: true, confirmed: false };
  }));
  const importRecords = () => {
    const invalid = candidates.some((item) => !item.courseName || (!item.grade && item.score === undefined) || item.credits < 0 || !item.confirmed);
    if (invalid) { setOcrStatus('每条记录都需要补全必填字段并勾选“已核对”后才能导入。'); return; }
    onImport(candidates.map((item) => ({
      id: newId('import'), courseName: item.courseName, semester: item.semester, credits: item.credits, examType: item.examType,
      ...(item.courseCode === undefined ? {} : { courseCode: item.courseCode }), ...(item.score === undefined ? {} : { score: item.score }),
      ...(item.grade === undefined ? {} : { grade: item.grade }), ...(item.gradePoint === undefined ? {} : { gradePoint: item.gradePoint }),
    })));
  };
  return <>
    <header className="page-header"><div><p className="eyebrow">本地 OCR 导入</p><h1>从成绩截图开始</h1><p>图片在当前浏览器内识别；系统不会向你索要教务密码，也不会自动提交识别结果。</p></div></header>
    <section className="panel import-panel"><div className="field-row"><label>成绩所属学期<input value={semester} onChange={(event) => setSemester(event.target.value)} /></label></div><button className="dropzone" onClick={() => fileInput.current?.click()} disabled={busy}><FileUp size={31} /><strong>{busy ? '正在识别截图…' : '上传教务系统成绩截图'}</strong><span>支持多张 JPG、PNG。初次识别会下载中文识别模型。</span></button><input className="hidden" ref={fileInput} type="file" accept="image/png,image/jpeg" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void chooseImages(files); event.target.value = ''; }} />{ocrStatus && <p className="ocr-status" aria-live="polite">{ocrStatus}</p>}<div className="divider"><span>或</span></div><label>粘贴识别出的表格文字<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：IB00166 微积分2 4 53 F 0 正常考试" rows={6} /></label><button className="secondary" onClick={parseText}>解析文本</button></section>
    {candidates.length > 0 && <section className="panel candidate-panel"><div className="panel-title"><div><h2>导入前核对</h2><p>每条记录必须勾选“已核对”才能导入。黄色提示请优先复查。</p></div><button className="primary" onClick={importRecords} disabled={candidates.some((item) => !item.confirmed)}>确认导入 {candidates.length} 条记录</button></div><div className="table-wrap"><table><thead><tr><th>课程</th><th>学分</th><th>成绩</th><th>等级</th><th>考试性质</th><th>状态</th><th>已核对</th></tr></thead><tbody>{candidates.map((item) => <tr key={item.id}><td><input aria-label={`${item.id} 课程号`} value={item.courseCode ?? ''} placeholder="课程号" onChange={(event) => update(item.id, 'courseCode', event.target.value)} /><input aria-label={`${item.id} 课程名称`} value={item.courseName} onChange={(event) => update(item.id, 'courseName', event.target.value)} /></td><td><input aria-label={`${item.courseName} 学分`} type="number" min="0" max="100" value={item.credits} onChange={(event) => update(item.id, 'credits', event.target.value)} /></td><td><input aria-label={`${item.courseName} 成绩`} type="number" min="0" max="100" value={item.score ?? ''} onChange={(event) => update(item.id, 'score', event.target.value)} /></td><td><select aria-label={`${item.courseName} 等级`} value={item.grade ?? ''} onChange={(event) => update(item.id, 'grade', event.target.value)}><option value="">待确认</option>{[...UI_LETTER_GRADES, ...UI_PASS_FAIL_GRADES].map((grade) => <option value={grade} key={grade}>{grade}</option>)}</select></td><td><select aria-label={`${item.courseName} 考试性质`} value={item.examType} onChange={(event) => update(item.id, 'examType', event.target.value)}>{UI_EXAM_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></td><td title={item.issues.join('。')}>{item.needsReview ? <span className="review">需核对</span> : <span className="verified">可导入</span>}</td><td><input aria-label={`${item.courseName} 已核对`} type="checkbox" checked={item.confirmed} onChange={(event) => setCandidates((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, confirmed: event.target.checked } : candidate))} /></td></tr>)}</tbody></table></div></section>}
  </>;
}

function CoursesPage({ attempts, summary, onAdd, onDelete, onReplace }: { attempts: CourseAttempt[]; summary: GpaSummary; onAdd: (records: CourseAttempt[]) => void; onDelete: (id: string) => void; onReplace: (records: CourseAttempt[]) => void }) {
  const [manual, setManual] = useState(initialManual);
  const backupInput = useRef<HTMLInputElement>(null);
  const addManual = (event: React.FormEvent) => { event.preventDefault(); const credits = numberOrUndefined(manual.credits); const score = numberOrUndefined(manual.score); if (!manual.courseName.trim() || credits === undefined || (score === undefined && !manual.grade)) return; onAdd([{ id: newId(), courseName: manual.courseName.trim(), semester: manual.semester.trim() || '未填写学期', credits, examType: manual.examType as UiExamType, ...(manual.courseCode.trim() ? { courseCode: manual.courseCode.trim() } : {}), ...(score === undefined ? {} : { score }), ...(manual.grade ? { grade: manual.grade as UiGrade } : {}) }]); setManual(initialManual); };
  const exportBackup = () => { const href = URL.createObjectURL(new Blob([createBackupText(attempts)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'sztu-gpa-backup.json'; anchor.click(); URL.revokeObjectURL(href); };
  const importBackup = async (file: File) => { try { onReplace(parseBackupText(await file.text())); } catch (error) { window.alert(error instanceof Error ? error.message : '这不是可识别的成绩备份文件。'); } };
  return <><header className="page-header"><div><p className="eyebrow">成绩档案</p><h1>我的课程</h1><p>每一条考试记录独立保存；补考不会覆盖原始 F。</p></div><div className="header-actions"><button className="secondary" onClick={exportBackup}>导出 JSON</button><button className="secondary" onClick={() => backupInput.current?.click()}>导入 JSON</button><input className="hidden" ref={backupInput} type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ''; }} /></div></header><section className="panel add-course"><h2>手动新增考试记录</h2><form onSubmit={addManual}><input placeholder="课程编号（可选）" value={manual.courseCode} onChange={(e) => setManual({ ...manual, courseCode: e.target.value })} /><input placeholder="课程名称" required value={manual.courseName} onChange={(e) => setManual({ ...manual, courseName: e.target.value })} /><input placeholder="学期" required value={manual.semester} onChange={(e) => setManual({ ...manual, semester: e.target.value })} /><input type="number" min="0" max="100" placeholder="学分" required value={manual.credits} onChange={(e) => setManual({ ...manual, credits: e.target.value })} /><input type="number" min="0" max="100" placeholder="成绩（可选）" value={manual.score} onChange={(e) => setManual({ ...manual, score: e.target.value })} /><select value={manual.grade} onChange={(e) => setManual({ ...manual, grade: e.target.value })}><option value="">根据成绩 / 选择等级</option>{[...UI_LETTER_GRADES, ...UI_PASS_FAIL_GRADES].map((grade) => <option key={grade} value={grade}>{gradeLabels[grade]}</option>)}</select><select value={manual.examType} onChange={(e) => setManual({ ...manual, examType: e.target.value })}>{UI_EXAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select><button className="primary" type="submit"><Plus size={16} />新增</button></form></section><section className="panel"><div className="panel-title"><div><h2>已录入记录</h2><p>质量分 {summary.qualityPoints.toFixed(2)}，GPA 分母 {summary.gpaCredits.toFixed(2)}</p></div></div><div className="table-wrap"><table><thead><tr><th>学期 / 课程</th><th>成绩</th><th>等级 / 绩点</th><th>学分</th><th>考试性质</th><th>GPA 贡献</th><th /></tr></thead><tbody>{summary.contributions.length === 0 ? <tr><td colSpan={7} className="empty-cell">还没有课程记录。可以手动录入，或从成绩截图导入。</td></tr> : summary.contributions.map((item) => <tr key={item.id}><td><strong>{item.courseName}</strong><small>{item.courseCode ?? '未填写课程号'} · {item.semester}</small></td><td>{item.score ?? '—'}</td><td><span className={item.grade === 'F' ? 'grade bad' : 'grade'}>{item.grade}</span> {item.gradePoint ?? '—'}</td><td>{item.credits}</td><td>{item.examType}</td><td>{item.includedInGpa ? `${item.qualityPoints.toFixed(1)} / ${item.gpaCredits.toFixed(1)}` : '不计入'}{item.warnings?.length ? <small className="warning-text">需复核</small> : null}</td><td><button className="icon-button" aria-label={`删除 ${item.courseName}`} onClick={() => onDelete(item.id)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div></section></>;
}

function TargetPage({ summary }: { summary: GpaSummary }) {
  const [targetGpa, setTargetGpa] = useState('3.30'); const [futureCredits, setFutureCredits] = useState('60'); const [plan, setPlan] = useState<TargetPlan | null>(null); const [error, setError] = useState('');
  const calculate = async () => { if (summary.gpaCredits <= 0) { setError('请先录入至少一门计入 GPA 的课程。'); return; } try { setPlan(await planTargetGpa({ currentQualityPoints: summary.qualityPoints, currentGpaCredits: summary.gpaCredits, futureGpaCredits: Number(futureCredits), targetGpa: Number(targetGpa) })); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '无法计算目标。'); } };
  return <><header className="page-header"><div><p className="eyebrow">累计 GPA 反推</p><h1>目标规划</h1><p>使用未四舍五入的当前质量分；满绩点固定为 SZTU 的 4.5。</p></div></header><section className="planner-card"><div className="planner-inputs"><label>目标累计 GPA<input type="number" min="0" max="4.5" step="0.01" value={targetGpa} onChange={(e) => setTargetGpa(e.target.value)} /></label><label>未来 GPA 学分<input type="number" min="0.1" max="100000" step="0.1" value={futureCredits} onChange={(e) => setFutureCredits(e.target.value)} /></label><button className="primary" onClick={() => void calculate()}>计算所需成绩</button></div>{error && <div className="notice warning">{error}</div>}{plan && <div className="plan-result"><StatusPill status={plan.status} /><p>为了达到 <strong>{plan.targetGpa.toFixed(2)}</strong>，未来 <strong>{plan.futureGpaCredits}</strong> GPA 学分平均需要</p><strong className="plan-number">{plan.displayRequiredFutureGpa}</strong><p>理论最高可达累计 GPA：<strong>{plan.displayMaximumReachableGpa}</strong></p>{plan.status === 'IMPOSSIBLE' && <p className="warning-text">该目标超过 4.5 满绩点下的理论上限，请调整目标或未来可计入 GPA 的学分。</p>}</div>}</section><section className="panel compact"><h2>当前计算基数</h2><div className="mini-metrics"><Metric label="质量分" value={summary.qualityPoints.toFixed(2)} /><Metric label="当前 GPA" value={summary.displayGpa ?? '—'} /><Metric label="GPA 学分" value={summary.gpaCredits.toFixed(1)} /></div></section></>;
}

function SimulatorPage({ attempts, summary }: { attempts: CourseAttempt[]; summary: GpaSummary }) {
  const [courses, setCourses] = useState([{ id: newId('plan'), name: '消费者行为', credits: '3', grade: 'A' as UiGrade }, { id: newId('plan'), name: '市场研究', credits: '3', grade: 'A' as UiGrade }, { id: newId('plan'), name: '商务英语', credits: '2', grade: 'B+' as UiGrade }]); const [projected, setProjected] = useState<GpaSummary | null>(null);
  useEffect(() => { let ignore = false; const future = courses.map((course) => ({ id: course.id, courseName: course.name || '未命名规划课程', semester: '规划学期', credits: Number(course.credits) || 0, grade: course.grade, examType: 'NORMAL' as UiExamType })); void calculateGpa([...attempts, ...future]).then((result) => { if (!ignore) setProjected(result); }).catch(() => { if (!ignore) setProjected(null); }); return () => { ignore = true; }; }, [attempts, courses]);
  const add = () => setCourses((items) => [...items, { id: newId('plan'), name: '新课程', credits: '3', grade: 'A' }]);
  const update = (id: string, key: 'name' | 'credits' | 'grade', value: string) => setCourses((items) => items.map((course) => course.id === id ? { ...course, [key]: value } : course));
  const futureContributions = projected?.contributions.filter((item) => item.semester === '规划学期') ?? []; const futureCredits = futureContributions.reduce((sum, item) => sum + item.gpaCredits, 0); const futurePoints = futureContributions.reduce((sum, item) => sum + item.qualityPoints, 0);
  return <><header className="page-header"><div><p className="eyebrow">未来情景</p><h1>学期模拟器</h1><p>模拟成绩不会写入正式成绩档案。</p></div></header><section className="two-column"><div className="panel"><div className="panel-title"><h2>规划课程</h2><button className="secondary" onClick={add}><Plus size={16} />添加课程</button></div><div className="simulation-list">{courses.map((course) => <div className="simulation-row" key={course.id}><input value={course.name} onChange={(e) => update(course.id, 'name', e.target.value)} /><input type="number" min="0" max="100" value={course.credits} onChange={(e) => update(course.id, 'credits', e.target.value)} /><select value={course.grade} onChange={(e) => update(course.id, 'grade', e.target.value)}>{UI_LETTER_GRADES.map((grade) => <option value={grade} key={grade}>{gradeLabels[grade]}</option>)}</select><button className="icon-button" onClick={() => setCourses((items) => items.filter((item) => item.id !== course.id))}><Trash2 size={16} /></button></div>)}</div></div><div className="panel simulation-summary"><p className="eyebrow">预测结果</p><div className="gpa-number dark">{futureCredits ? (futurePoints / futureCredits).toFixed(2) : '—'}</div><p>本学期预计 GPA</p><div className="compare"><span>当前累计 GPA <strong>{summary.displayGpa ?? '—'}</strong></span><ChevronRight size={16} /><span>预计累计 GPA <strong>{projected?.displayGpa ?? '—'}</strong></span></div><p className="muted">假设未来课程全部计入 GPA，且不影响既有考试记录。</p></div></section></>;
}

function CourseScorePage() {
  const [targetScore, setTargetScore] = useState('85'); const [components, setComponents] = useState([{ name: '平时', weight: '20', score: '88' }, { name: '项目', weight: '20', score: '92' }, { name: '期中', weight: '20', score: '84' }, { name: '期末', weight: '40', score: '' }]); const [result, setResult] = useState<CourseScorePlan | null>(null); const [error, setError] = useState('');
  const calculate = async () => { try { setResult(await calculateRequiredScore({ targetScore: Number(targetScore), components: components.map((item) => ({ name: item.name, weight: Number(item.weight), ...(item.score === '' ? {} : { score: Number(item.score) }) })) })); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '无法计算。'); } };
  return <><header className="page-header"><div><p className="eyebrow">单科反推</p><h1>剩余考核需要多少分？</h1><p>请保留一个未知成绩项，且所有权重合计必须为 100%。</p></div></header><section className="panel"><div className="course-score-layout"><div><label>目标总评<input type="number" min="0" max="100" value={targetScore} onChange={(e) => setTargetScore(e.target.value)} /></label><div className="component-list">{components.map((component, index) => <div className="component-row" key={`${component.name}-${index}`}><input value={component.name} onChange={(e) => setComponents((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} /><input type="number" value={component.weight} onChange={(e) => setComponents((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, weight: e.target.value } : item))} /><input type="number" placeholder="未知" value={component.score} onChange={(e) => setComponents((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, score: e.target.value } : item))} /></div>)}</div><button className="primary" onClick={() => void calculate()}>反推成绩</button></div><div className="course-score-result">{error && <div className="notice warning">{error}</div>}{result ? <><StatusPill status={result.status} /><p>在 <strong>{result.unknownComponent}</strong> 中至少需要</p><strong className="plan-number">{result.displayRequiredScore}</strong><p>已获得加权分：{result.knownWeightedScore.toFixed(2)}</p></> : <p className="muted">输入项目后开始计算。</p>}</div></div></section></>;
}

function RulesPage() { return <><header className="page-header"><div><p className="eyebrow">SZTU 规则口径</p><h1>计算说明</h1><p>用于学习规划与估算，不替代学校正式成绩单。</p></div></header><section className="panel rules"><h2>成绩映射</h2><div className="grade-map">93–100 A+ / 4.5 · 85–92 A / 4.0 · 80–84 B+ / 3.5 · 75–79 B / 3.0 · 70–74 C+ / 2.5 · 65–69 C / 2.0 · 60–64 D / 1.0 · 0–59 F / 0</div><h2>已确认的处理方式</h2><ul><li>F 的绩点为 0，但原课程学分仍进入 GPA 分母。</li><li>P/NP 不进入 GPA；P 可以获得学分，NP 不获得学分。</li><li>正常考试 F 与补考 D 作为两条 attempt 分别计算，不能互相覆盖。</li><li>正式重修的最终累计 GPA 规则尚未完全确认；系统会显示提示。</li></ul></section></>;
}

export default App;
