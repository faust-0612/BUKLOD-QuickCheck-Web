import { useEffect, useMemo, useRef, useState } from 'react';
import { api, hasQuickCheckSession, setQuickCheckBearerToken, setQuickCheckSession } from './apiCompat';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileCheck2,
  Flag,
  FolderOpen,
  KeyRound,
  Loader2,
  Pencil,
  ScanLine,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { prepareLocalFile, type LocalInputFrame } from './localImport';
import QuickCheckEconomyPanel from './QuickCheckEconomyPanel';

type TempFrame = LocalInputFrame;
type ExtractedPage = {
  source: string;
  studentName: string;
  studentId?: string;
  assessmentTitle?: string;
  assessmentKind?: string;
  assessmentGroup?: string;
  resolvedStudentName?: string;
  resolvedStudentId?: string;
  pageNumber?: number | null;
  sequence?: number | null;
  totalPages?: number | null;
  questions: { number: string; question: string; answer: string }[];
  questionSignature?: string;
  handwritingProfile?: string;
  imageQuality?: 'clear' | 'usable' | 'poor';
  needsRescan?: boolean;
  rosterUserId?: string;
  rosterMatchStatus?: 'matched' | 'possible' | 'not_in_roster' | 'unidentified';
  rosterMatchConfidence?: number;
  confidence: number;
  flags: string[];
};
type RosterStudent = { userId: string; fullName: string; username?: string | null; studentNumber?: string | null; programLabel?: string | null; yearLevel?: string | null };
type BuklodClassroom = { id: string; name: string; subject_code?: string | null; section_name?: string | null; school_year?: string | null; term?: string | null; status?: string };
type StudentGrade = {
  assessmentId?: string;
  assessmentTitle?: string;
  assessmentKind?: string;
  studentName: string;
  studentId?: string;
  score: number;
  maxScore: number;
  percent: number;
  confidence: number;
  feedback: string;
  flags: string[];
  gradeId?: string;
  reviewStatus?: 'looks_correct' | 'needs_review' | 'critical_review';
  approvalStatus?: 'pending' | 'approved';
  approvedAt?: string;
  items: {
    number: string;
    correct: boolean;
    points: number;
    maxPoints: number;
    note: string;
  }[];
};
type AnswerKeyItem = {
  assessmentId?: string;
  assessmentTitle?: string;
  assessmentKind?: string;
  number: string;
  question: string;
  expectedAnswer: string;
  maxPoints: number;
  notes?: string;
};
type AssessmentSummary = {
  id: string;
  title: string;
  kind: string;
  pageCount: number;
  studentCount: number;
  confidence: number;
  flags: string[];
};
type InspectionRow = { title: string; meta?: string; detail?: string; status?: string; gradeId?: string };
type ReportInspection = { title: string; value: string; why: string; action: string; rows: InspectionRow[] };

const BUKLOD_SUPABASE_URL = 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const BUKLOD_PUBLISHABLE_KEY = 'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';
const BUKLOD_ROSTER_FUNCTION = `${BUKLOD_SUPABASE_URL}/functions/v1/quickcheck-classroom-roster`;
const BUKLOD_HANDOFF_REDEEM_FUNCTION = `${BUKLOD_SUPABASE_URL}/functions/v1/quickcheck-handoff-redeem-v2`;

const demoPages: ExtractedPage[] = [
  {
    source: 'demo-1',
    studentName: 'Maria Santos',
    studentId: '2026-001',
    assessmentTitle: 'Logic Activity',
    pageNumber: 1,
    totalPages: 2,
    confidence: 0.97,
    flags: [],
    questions: [
      { number: '1', question: 'What is a proposition?', answer: 'A declarative statement that is either true or false.' },
      { number: '2', question: 'Give one example of a proposition.', answer: 'Manila is in the Philippines.' },
    ],
  },
  {
    source: 'demo-2',
    studentName: 'Juan Dela Cruz',
    studentId: '2026-002',
    assessmentTitle: 'Logic Activity',
    pageNumber: 1,
    totalPages: 1,
    confidence: 0.94,
    flags: [],
    questions: [
      { number: '1', question: 'What is a proposition?', answer: 'A sentence that can be judged true or false.' },
      { number: '2', question: 'Give one example of a proposition.', answer: 'Close the door.' },
    ],
  },
  {
    source: 'demo-3',
    studentName: 'Maria Santos',
    studentId: '2026-001',
    assessmentTitle: 'Logic Activity',
    pageNumber: 2,
    totalPages: 2,
    confidence: 0.96,
    flags: [],
    questions: [
      { number: '3', question: 'Is a command a proposition? Explain.', answer: 'No, because a command has no truth value.' },
    ],
  },
];

function fingerprint(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = 32;
  const height = 24;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 16) {
    values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }
  return values;
}

function difference(a: number[] | null, b: number[] | null) {
  if (!a || !b || a.length !== b.length) return 999;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

function captureFrame(video: HTMLVideoElement, sequence: number): TempFrame {
  const max = 1152;
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to capture scan.');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    name: `scan-${String(sequence).padStart(4, '0')}.jpg`,
    dataUrl: canvas.toDataURL('image/jpeg', 0.62),
    retries: 0,
  };
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const previousFingerprintRef = useRef<number[] | null>(null);
  const lastCapturedFingerprintRef = useRef<number[] | null>(null);
  const stableTicksRef = useRef(0);
  const armedRef = useRef(true);
  const queueRef = useRef<TempFrame[]>([]);
  const failedFramesRef = useRef<TempFrame[]>([]);
  const paperPreviewRef = useRef<Record<string, TempFrame>>({});
  const activeWorkersRef = useRef(0);
  const processingPagesRef = useRef(0);
  const finishingRef = useRef(false);
  const scanCountRef = useRef(0);
  const reportRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const rubricInputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedFrames, setFailedFrames] = useState<TempFrame[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [lastCapture, setLastCapture] = useState('No page captured yet.');
  const [scanStatus, setScanStatus] = useState('Ready to start continuous scanning.');
  const [extracted, setExtracted] = useState<ExtractedPage[]>([]);
  const [answerKey, setAnswerKey] = useState<AnswerKeyItem[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [released, setReleased] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncFaculty, setSyncFaculty] = useState('');
  const [syncClass, setSyncClass] = useState('');
  const [syncPeriod, setSyncPeriod] = useState('');
  const [syncType, setSyncType] = useState('Quiz');
  const [syncAssessment, setSyncAssessment] = useState('');
  const [batchId, setBatchId] = useState('');
  const [batchHistory, setBatchHistory] = useState<{ id: string; createdAt: string; status: string; pageCount: number; assessmentCount: number; studentCount: number }[]>([]);
  const [buklodEmail, setBuklodEmail] = useState('');
  const [buklodPassword, setBuklodPassword] = useState('');
  const [buklodToken, setBuklodToken] = useState('');
  const [buklodHandoffConnected, setBuklodHandoffConnected] = useState(() => hasQuickCheckSession());
  const [buklodClassrooms, setBuklodClassrooms] = useState<BuklodClassroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterClassroom, setRosterClassroom] = useState<BuklodClassroom | null>(null);
  const [rosterSyncedAt, setRosterSyncedAt] = useState('');
  const [rosterBusy, setRosterBusy] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [localImportSummary, setLocalImportSummary] = useState('No local files selected.');
  const [rubricText, setRubricText] = useState('');
  const [rubricSource, setRubricSource] = useState('');
  const [rubricBusy, setRubricBusy] = useState('');
  const [reportInspect, setReportInspect] = useState('');
  const [paperReviewId, setPaperReviewId] = useState('');
  const [editGradeId, setEditGradeId] = useState('');
  const [editScore, setEditScore] = useState('');
  const [editFeedback, setEditFeedback] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedPage[]>();
    extracted.forEach(page => {
      const studentKey = page.resolvedStudentId?.trim() || page.studentId?.trim() || page.resolvedStudentName?.trim() || page.studentName.trim() || page.rosterUserId?.trim() || 'Unidentified';
      const key = `${page.assessmentGroup || 'UNSORTED'}::${studentKey}`;
      map.set(key, [...(map.get(key) || []), page]);
    });
    return [...map.entries()].map(([key, values]) => ({
      key,
      name: values[0]?.resolvedStudentName || values[0]?.studentName || 'Unidentified',
      pages: values,
    }));
  }, [extracted]);

  const uniqueStudentCount = useMemo(() => {
    const identities = new Set(extracted.map(page => (page.resolvedStudentId || page.studentId || page.resolvedStudentName || page.studentName || page.rosterUserId || '').trim().toLowerCase()).filter(Boolean));
    return identities.size;
  }, [extracted]);

  const flags = useMemo(() => {
    const pageFlags = extracted.reduce((n, p) => n + p.flags.length + (p.confidence < 0.8 ? 1 : 0), 0);
    const gradeFlags = grades.reduce((n, g) => n + g.flags.length + (g.confidence < 0.8 ? 1 : 0), 0);
    return pageFlags + gradeFlags;
  }, [extracted, grades]);

  const gradeReview = useMemo(() => {
    const correct = grades.filter(g => g.reviewStatus === 'looks_correct').length;
    const review = grades.filter(g => g.reviewStatus === 'needs_review').length;
    const critical = grades.filter(g => g.reviewStatus === 'critical_review').length;
    const approved = grades.filter(g => g.approvalStatus === 'approved').length;
    return { correct, review, critical, approved, pending: grades.length - approved };
  }, [grades]);

  const visibleGrades = useMemo(() => reviewOnly ? grades.filter(g => g.reviewStatus !== 'looks_correct') : grades, [grades, reviewOnly]);
  const paperReviewGrade = useMemo(() => grades.find(grade => grade.gradeId === paperReviewId) || null, [grades, paperReviewId]);
  const paperReviewPages = useMemo(() => {
    if (!paperReviewGrade) return [];
    const gradeIdentity = (paperReviewGrade.studentId || paperReviewGrade.studentName || '').trim().toLowerCase();
    return extracted.filter(page => {
      const sameAssessment = !paperReviewGrade.assessmentId || page.assessmentGroup === paperReviewGrade.assessmentId;
      const pageIdentity = (page.resolvedStudentId || page.studentId || page.resolvedStudentName || page.studentName || '').trim().toLowerCase();
      return sameAssessment && !!gradeIdentity && pageIdentity === gradeIdentity;
    }).sort((a, b) => (a.sequence || a.pageNumber || 999) - (b.sequence || b.pageNumber || 999));
  }, [paperReviewGrade, extracted]);
  const editGrade = useMemo(() => grades.find(grade => grade.gradeId === editGradeId) || null, [grades, editGradeId]);

  const reportInspection = useMemo<ReportInspection | null>(() => {
    if (!reportInspect) return null;
    const pageName = (page: ExtractedPage) => page.resolvedStudentName || page.studentName || 'Unidentified';
    const pageMeta = (page: ExtractedPage) => `${page.assessmentKind || 'Assessment'} · ${page.assessmentTitle || page.assessmentGroup || 'Unsorted'} · ${Math.round((page.confidence || 0) * 100)}% confidence`;
    const pageDetail = (page: ExtractedPage) => [page.imageQuality ? `quality ${page.imageQuality}` : '', page.rosterMatchStatus ? `roster ${page.rosterMatchStatus.replace(/_/g, ' ')}` : '', ...(page.flags || [])].filter(Boolean).join(' · ') || 'No review flags.';
    const acceptedRows: InspectionRow[] = extracted.map(page => ({ title: page.source, meta: `${pageName(page)} · ${pageMeta(page)}`, detail: pageDetail(page), status: page.needsRescan ? 'Needs rescan' : 'Accepted' }));
    const failedRows: InspectionRow[] = failedFrames.map(frame => ({ title: frame.name, meta: 'Rejected / retained page', detail: frame.failureReason || 'Processing or quality check failed.', status: 'Needs action' }));
    const gradeRows: InspectionRow[] = grades.map(grade => ({ title: grade.studentName, meta: `${grade.assessmentKind || 'Assessment'} · ${grade.assessmentTitle || grade.assessmentId || 'Detected set'} · ${grade.score}/${grade.maxScore} (${grade.percent}%)`, detail: [...(grade.flags || []), grade.feedback].filter(Boolean).join(' · ') || 'No grade flags.', status: `${(grade.reviewStatus || 'pending').replace(/_/g, ' ')} · ${grade.approvalStatus || 'pending'}`, gradeId: grade.gradeId }));
    const studentRows: InspectionRow[] = grouped.map(group => {
      const confidence = Math.round(Math.min(...group.pages.map(page => page.confidence || 0)) * 100);
      const first = group.pages[0];
      const localFlags = group.pages.flatMap(page => page.flags || []);
      return { title: group.name, meta: `${first?.assessmentKind || 'Assessment'} · ${first?.assessmentTitle || first?.assessmentGroup || 'Unsorted'} · ${group.pages.length} page(s) · ${confidence}% match`, detail: [`sequence ${group.pages.map(page => page.sequence || page.pageNumber || '?').join('→')}`, first?.rosterMatchStatus ? `roster ${first.rosterMatchStatus.replace(/_/g, ' ')}` : '', ...localFlags].filter(Boolean).join(' · '), status: localFlags.length ? 'Review flags' : 'Matched' };
    });
    const assessmentRows: InspectionRow[] = assessments.map(assessment => ({ title: assessment.title, meta: `${assessment.kind} · ${assessment.pageCount} page(s) · ${assessment.studentCount} student(s)`, detail: assessment.flags.length ? assessment.flags.join(' · ') : 'No assessment-level flags.', status: `${Math.round(assessment.confidence * 100)}% match` }));
    const pageFlagRows: InspectionRow[] = extracted.filter(page => (page.flags || []).length || page.confidence < 0.8).map(page => ({ title: `${pageName(page)} · ${page.source}`, meta: pageMeta(page), detail: [...(page.flags || []), ...(page.confidence < 0.8 ? [`Low confidence ${Math.round(page.confidence * 100)}%`] : [])].join(' · '), status: 'Page flag' }));
    const gradeFlagRows: InspectionRow[] = grades.filter(grade => (grade.flags || []).length || grade.confidence < 0.8).map(grade => ({ title: grade.studentName, meta: `${grade.assessmentTitle || grade.assessmentId || 'Assessment'} · ${Math.round(grade.confidence * 100)}% confidence`, detail: [...(grade.flags || []), ...(grade.confidence < 0.8 ? ['Low grading confidence'] : [])].join(' · '), status: 'Grade flag', gradeId: grade.gradeId }));
    const finalBlockers: InspectionRow[] = [
      ...(failedCount > 0 ? [{ title: `${failedCount} failed page(s)`, meta: 'Quality blocker', detail: 'Resolve or retry these pages before grading/release.', status: 'BLOCKING' }] : []),
      ...(queuedCount > 0 || processingCount > 0 ? [{ title: `${queuedCount} waiting · ${processingCount} processing`, meta: 'Processing blocker', detail: 'Wait until the batch finishes processing.', status: 'BLOCKING' }] : []),
      ...(!grades.length ? [{ title: 'No suggested grades yet', meta: 'Checking not complete', detail: failedCount > 0 ? 'Failed pages currently prevent Auto-Sort & Suggest Grades.' : 'Run Auto-Sort & Suggest Grades before approval.', status: 'PENDING' }] : []),
      ...(grades.length && gradeReview.pending > 0 ? [{ title: `${gradeReview.pending} grade(s) not approved`, meta: 'Approval blocker', detail: `${gradeReview.review} Needs Review · ${gradeReview.critical} Critical Review`, status: 'BLOCKING' }] : []),
    ];

    if (reportInspect.startsWith('assessment:')) {
      const id = reportInspect.slice('assessment:'.length);
      const assessment = assessments.find(item => item.id === id);
      const pages = extracted.filter(page => page.assessmentGroup === id);
      const localGrades = grades.filter(grade => grade.assessmentId === id);
      if (!assessment) return { title: 'Assessment detail', value: 'Not found', why: 'This assessment is no longer present in the current report.', action: 'Re-run sorting if the report changed.', rows: [] };
      return { title: `${assessment.kind}: ${assessment.title}`, value: `${assessment.pageCount} page(s) · ${assessment.studentCount} student(s)`, why: `This group was created from matching question set/layout evidence at ${Math.round(assessment.confidence * 100)}% confidence.`, action: assessment.flags.length ? 'Review the assessment flags before finalizing.' : 'Open the student rows below to confirm page grouping before finalizing.', rows: [...pages.map(page => ({ title: pageName(page), meta: `${page.source} · sequence ${page.sequence || page.pageNumber || '?'}`, detail: pageDetail(page), status: `${Math.round(page.confidence * 100)}% match` })), ...localGrades.map(grade => ({ title: `Grade: ${grade.studentName}`, meta: `${grade.score}/${grade.maxScore} (${grade.percent}%)`, detail: grade.feedback, status: grade.approvalStatus || 'pending', gradeId: grade.gradeId }))] };
    }
    if (reportInspect.startsWith('student:')) {
      const key = reportInspect.slice('student:'.length);
      const group = grouped.find(item => item.key === key);
      if (!group) return { title: 'Student record detail', value: 'Not found', why: 'This student grouping is no longer present in the current report.', action: 'Re-run sorting if the report changed.', rows: [] };
      const first = group.pages[0];
      const groupAssessmentId = first?.assessmentGroup || '';
      const groupIdentity = (first?.resolvedStudentId || first?.studentId || first?.resolvedStudentName || first?.studentName || '').trim().toLowerCase();
      const localGrades = grades.filter(grade => {
        const gradeIdentity = (grade.studentId || grade.studentName || '').trim().toLowerCase();
        const sameAssessment = !groupAssessmentId || grade.assessmentId === groupAssessmentId;
        return sameAssessment && !!groupIdentity && gradeIdentity === groupIdentity;
      });
      return { title: group.name, value: `${group.pages.length} page(s) · this student only`, why: `This view is restricted to ${group.name}'s pages inside this exact assessment only. Other students and other assessments are excluded.`, action: 'Confirm only this student’s name, page sequence, answers, flags, match details, and grade before finalizing.', rows: [...group.pages.map(page => ({ title: page.source, meta: `sequence ${page.sequence || page.pageNumber || '?'} · ${pageMeta(page)}`, detail: pageDetail(page), status: `${Math.round(page.confidence * 100)}% match` })), ...localGrades.map(grade => ({ title: `Suggested grade · ${group.name}`, meta: `${grade.score}/${grade.maxScore} (${grade.percent}%)`, detail: grade.feedback, status: `${grade.reviewStatus || 'pending'} · ${grade.approvalStatus || 'pending'}`, gradeId: grade.gradeId }))] };
    }

    switch (reportInspect) {
      case 'captured': return { title: 'Captured pages', value: `${scannedCount} captured`, why: `Captured includes every page accepted into this batch before quality disposition: ${processedCount} processed/accepted and ${failedCount} failed/retained.`, action: failedCount ? 'Inspect the failed rows and resolve them before final checking.' : 'Confirm the source/page list matches the papers you intended to include.', rows: [...acceptedRows, ...failedRows] };
      case 'processed': return { title: 'Processed pages', value: `${processedCount} processed`, why: 'Processed pages passed extraction sufficiently to enter the report. Low-confidence or flagged pages may still require teacher review.', action: 'Check names, assessment grouping, confidence, and any flags below.', rows: acceptedRows };
      case 'assessments': return { title: 'Detected assessments', value: `${assessments.length || (extracted.length ? 1 : 0)} assessment(s)`, why: 'Assessments are separated primarily by repeated question set, headings, instructions, numbering, and layout.', action: 'Confirm different activities were not accidentally merged and one activity was not split incorrectly.', rows: assessmentRows.length ? assessmentRows : [{ title: 'Assessment not reconciled yet', detail: 'Run Auto-Sort & Suggest Grades to finalize assessment grouping.', status: 'Pending' }] };
      case 'students': return { title: 'Students', value: `${uniqueStudentCount} unique student(s)`, why: `${grouped.length} student-assessment record(s) are present. Unique students are counted once across assessments, using resolved explicit ID/name first and roster user ID only as fallback.`, action: 'Confirm every named student appears separately. If two different names ever appear in one record, re-sort/recheck because that is an identity conflict.', rows: studentRows };
      case 'failed': return { title: 'Failed / Needs Rescan', value: `${failedCount} failed`, why: failedCount ? 'These pages did not pass quality/extraction after retry or were retained because reliable checking was not possible.' : 'No pages are currently blocked by the quality gate.', action: failedCount ? 'Retry or rescan every listed page before grading/release.' : 'No quality action is required.', rows: failedRows };
      case 'graded': return { title: 'Suggested grades', value: `${grades.length} graded`, why: grades.length ? `QuickCheck produced ${grades.length} suggested grade record(s); teacher approval remains separate.` : 'No grading record has been created yet.', action: grades.length ? 'Review flags, confidence, rubric/key basis, and approval state before release.' : (failedCount ? 'Resolve failed pages first, then run Auto-Sort & Suggest Grades.' : 'Run Auto-Sort & Suggest Grades when the batch is ready.'), rows: gradeRows };
      case 'flags': return { title: 'Review flags', value: `${flags} flag(s)`, why: 'The flag total includes explicit page/grade flags plus low-confidence page or grade conditions counted by the report.', action: flags ? 'Review every flagged row before approval/release.' : 'No report flags currently require action.', rows: [...pageFlagRows, ...gradeFlagRows] };
      case 'released': return { title: 'Release status', value: released ? 'Released' : 'Not released', why: released ? 'All required teacher approvals were completed and the batch was explicitly released.' : 'Release remains locked until quality blockers are resolved and every suggested grade is teacher-approved.', action: released ? 'You can still inspect the final record below.' : 'Resolve all blocking items below before release.', rows: finalBlockers };
      case 'scan_quality': return { title: 'Scan & Quality', value: `${processedCount}/${scannedCount} accepted pages`, why: failedCount ? `${failedCount} page(s) are excluded from grading until resolved because their quality/extraction was not reliable enough.` : 'All captured pages currently passed the quality gate.', action: failedCount ? 'Open each failed row and retry/rescan it before final checking.' : 'Confirm accepted pages and proceed to identity/sorting review.', rows: [...failedRows, ...acceptedRows] };
      case 'sorting_identity': return { title: 'Sorting & Identity', value: `${assessments.length || (extracted.length ? 1 : 0)} assessment(s) · ${uniqueStudentCount} unique student(s) · ${grouped.length} record(s)`, why: 'QuickCheck now treats explicit student names/IDs as hard boundaries. Page continuity and handwriting can only attach an unnamed continuation page; they cannot override a different visible name.', action: 'Review corrected identity-conflict flags and confirm every expected student is listed separately.', rows: studentRows };
      case 'grade_record': return { title: 'Grade & Record', value: grades.length ? `${grades.length} suggested grade(s)` : 'Not graded yet', why: grades.length ? `A grading record ${batchId ? 'has been saved' : 'is available'} but final release still depends on teacher approval.` : 'No grading record exists yet for this batch.', action: finalBlockers.length ? 'Resolve the blockers listed below before finalization.' : 'Review the suggested grades and approval state before release.', rows: gradeRows.length ? gradeRows : finalBlockers };
      case 'step_scan': return { title: 'Step 1 · Scan', value: reportReady ? 'Complete' : 'In progress', why: reportReady ? `Batch capture/import finished with ${scannedCount} captured item(s).` : `${queuedCount} waiting and ${processingCount} processing remain.`, action: reportReady ? 'Review Quality next.' : 'Wait for processing to finish or finish the scan batch.', rows: [...acceptedRows, ...failedRows] };
      case 'step_quality': return { title: 'Step 2 · Quality', value: failedCount ? 'Needs action' : 'Passed', why: failedCount ? `${failedCount} page(s) failed the quality/extraction gate.` : 'No retained failed pages remain.', action: failedCount ? 'Retry/rescan all failed pages; grading remains blocked until they are resolved.' : 'Proceed to Check.', rows: failedRows.length ? failedRows : acceptedRows };
      case 'step_check': return { title: 'Step 3 · Check', value: grades.length ? 'Suggested' : 'Pending', why: grades.length ? `${grades.length} suggested grade record(s) were created.` : (failedCount ? `Check is pending because ${failedCount} failed page(s) must be resolved first.` : 'The batch is ready but Auto-Sort & Suggest Grades has not been run yet.'), action: grades.length ? 'Review every suggested grade and its flags before approval.' : (failedCount ? 'Resolve Quality blockers first.' : 'Run Auto-Sort & Suggest Grades.'), rows: gradeRows.length ? gradeRows : finalBlockers };
      case 'step_approval': return { title: 'Step 4 · Approval', value: released ? 'Approved / Released' : 'Pending', why: released ? 'Teacher approval and explicit release are complete.' : grades.length ? `${gradeReview.pending} of ${grades.length} grade(s) still require approval or final release.` : 'Approval cannot begin until suggested grades exist.', action: released ? 'Final record is complete; inspect any row for audit.' : 'Review exceptions, approve grades, then release only when all blockers are clear.', rows: gradeRows.length ? gradeRows : finalBlockers };
      case 'overall_grade': return { title: 'Overall grade summary', value: grades.length ? `${Math.round(grades.reduce((sum, grade) => sum + grade.percent, 0) / grades.length)}% class average` : 'No grades', why: grades.length ? `${gradeReview.correct} Looks Correct · ${gradeReview.review} Needs Review · ${gradeReview.critical} Critical Review · ${gradeReview.approved}/${grades.length} approved.` : 'The class average is unavailable until grading is run.', action: 'Inspect individual rows; an average never overrides a flagged or critical student record.', rows: gradeRows };
      default: return null;
    }
  }, [reportInspect, extracted, failedFrames, grades, grouped, assessments, scannedCount, processedCount, failedCount, queuedCount, processingCount, flags, released, reportReady, batchId, gradeReview, uniqueStudentCount]);

  const stopCamera = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const finishIfDone = () => {
    if (!finishingRef.current) return;
    if (queueRef.current.length > 0 || activeWorkersRef.current > 0) return;
    finishingRef.current = false;
    setBusy('');
    setReportReady(true);

    const blocked = failedFramesRef.current.length;
    if (blocked > 0) {
      setScanStatus(`Batch complete with ${blocked} failed / needs-rescan page(s).`);
      setMessage(`Batch finished with ${blocked} blocked page(s). Resolve Failed / Needs Rescan before grading or release. No blocked page was silently included.`);
    } else {
      setScanStatus('Batch processing complete. Final Report is ready.');
      setMessage('Batch finished. Final Report / Summary is ready below.');
    }

    window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const pumpQueue = (force = false) => {
    while (
      activeWorkersRef.current < 4 &&
      queueRef.current.length > 0 &&
      (force || queueRef.current.length >= 1)
    ) {
      const chunk = queueRef.current.splice(0, 1);
      activeWorkersRef.current += 1;
      processingPagesRef.current += chunk.length;
      setQueuedCount(queueRef.current.length);
      setProcessingCount(processingPagesRef.current);

      void api.post('/api/analyze', { pages: chunk }).then(response => {
        if (response.data?.ok === false || response.data?.error) {
          throw new Error(response.data.error || 'AI analysis failed.');
        }
        const results = response.data.pages as ExtractedPage[];
        const qualityRejected = results.find(page => page.needsRescan || page.imageQuality === 'poor');
        if (qualityRejected) {
          const reason = qualityRejected.flags?.join(' · ') || 'Image quality is too poor for reliable checking.';
          if ((chunk[0]?.retries || 0) < 1) {
            const retryFrame = { ...chunk[0], retries: 1, failureReason: reason };
            queueRef.current.push(retryFrame);
            setRetryCount(prev => prev + 1);
            setQueuedCount(queueRef.current.length);
            setScanStatus(`Blur/quality check failed — retrying ${chunk[0].name} once…`);
            setMessage(`Quality retry: ${reason}`);
            return;
          }
          const retained = { ...chunk[0], failureReason: `Needs rescan: ${reason}` };
          failedFramesRef.current.push(retained);
          setFailedFrames([...failedFramesRef.current]);
          setFailedCount(failedFramesRef.current.length);
          setScanStatus('NEEDS RESCAN — blurred/cut-off page was not accepted.');
          setMessage(`Needs rescan: ${reason}. This page was NOT included in grading.`);
          return;
        }
        setExtracted(prev => [...prev, ...results]);
        setProcessedCount(prev => prev + results.length);
      }).catch(err => {
        const detail = err instanceof Error ? err.message : 'AI processing failed';
        const retained = chunk.map(frame => ({
          ...frame,
          failureReason: `AI error: ${detail}`,
        }));
        failedFramesRef.current.push(...retained);
        setFailedFrames([...failedFramesRef.current]);
        setFailedCount(failedFramesRef.current.length);
        setScanStatus(`AI ERROR — ${detail.slice(0, 220)}`);
        setMessage(`AI ERROR: ${detail}. Scan retained in Failed Pages and excluded from grading.`);
      }).finally(() => {
        activeWorkersRef.current -= 1;
        processingPagesRef.current -= chunk.length;
        setQueuedCount(queueRef.current.length);
        setProcessingCount(processingPagesRef.current);
        pumpQueue(finishingRef.current);
        finishIfDone();
      });
    }
    finishIfDone();
  };

  const autoCapture = () => {
    const video = videoRef.current;
    const motionCanvas = motionCanvasRef.current;
    if (!video || !motionCanvas || video.readyState < 2 || !video.videoWidth) return;
    const current = fingerprint(video, motionCanvas);
    const frameDiff = difference(current, previousFingerprintRef.current);
    previousFingerprintRef.current = current;

    if (!armedRef.current) {
      const changed = difference(current, lastCapturedFingerprintRef.current);
      if (changed > 16) {
        armedRef.current = true;
        stableTicksRef.current = 0;
        setScanStatus('New page detected. Hold it steady…');
      }
      return;
    }

    if (frameDiff < 5.5) stableTicksRef.current += 1;
    else stableTicksRef.current = 0;

    if (stableTicksRef.current < 3) {
      setScanStatus('Hold paper steady inside the frame…');
      return;
    }

    try {
      scanCountRef.current += 1;
      const frame = captureFrame(video, scanCountRef.current);
      paperPreviewRef.current[frame.name] = frame;
      queueRef.current.push(frame);
      setScannedCount(scanCountRef.current);
      setQueuedCount(queueRef.current.length);
      setLastCapture(`Page ${scanCountRef.current} captured successfully.`);
      lastCapturedFingerprintRef.current = current;
      armedRef.current = false;
      stableTicksRef.current = 0;
      setScanStatus(`Page ${scanCountRef.current} captured. Replace with the next page.`);
      pumpQueue(false);
    } catch (err) {
      setScanStatus(err instanceof Error ? err.message : 'Could not capture page.');
    }
  };

  const startScanning = async () => {
    setMessage('');
    setAnswerKey([]);
    setGrades([]);
    setAssessments([]);
    setReleased(false);
    setReportReady(false);
    setBusy('Checking AI connection…');
    let aiWarning = '';
    try {
      const probe = await api.get('/api/_gemini_probe');
      if (!probe.data?.ok) {
        aiWarning = `AI warning: ${probe.data?.error || 'Gemini connection is unavailable.'} Scanning can continue, but pages may remain queued/failed until AI is available.`;
      }
    } catch (probeErr) {
      aiWarning = `AI warning: ${probeErr instanceof Error ? probeErr.message : 'Gemini preflight could not be reached.'} Scanning can continue, but pages may remain queued/failed until AI is available.`;
    }
    setBusy('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      previousFingerprintRef.current = null;
      lastCapturedFingerprintRef.current = null;
      stableTicksRef.current = 0;
      armedRef.current = true;
      setScanning(true);
      setScanStatus(aiWarning ? 'Camera ready. AI warning detected — scanning may continue.' : 'Camera ready. Place the first page and hold it steady.');
      if (aiWarning) setMessage(aiWarning);
      timerRef.current = window.setInterval(autoCapture, 500);
    } catch (err) {
      setMessage(`Camera could not start: ${err instanceof Error ? err.message : 'permission denied'}. Use HTTPS and allow camera access.`);
    }
  };

  const finishBatch = () => {
    stopCamera();
    finishingRef.current = true;
    setBusy('Finishing remaining temporary scans…');
    setScanStatus('Finishing batch — processing continues until Waiting and Processing both reach 0.');
    pumpQueue(true);
    finishIfDone();
  };

  const importLocalFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    stopCamera();
    setAnswerKey([]);
    setGrades([]);
    setAssessments([]);
    setReleased(false);
    setReportReady(false);
    setBatchId('');
    setBusy('Reading selected files locally…');
    setScanStatus('Preparing local PDF / Word / image files…');
    const selected = Array.from(files);
    const skipped: string[] = [];
    let added = 0;

    for (const file of selected) {
      try {
        setBusy(`Preparing ${file.name} locally…`);
        const frames = await prepareLocalFile(file);
        for (const frame of frames) {
          paperPreviewRef.current[frame.name] = frame;
          queueRef.current.push(frame);
          scanCountRef.current += 1;
          added += 1;
        }
        setScannedCount(scanCountRef.current);
        setQueuedCount(queueRef.current.length);
        pumpQueue(false);
      } catch (err) {
        skipped.push(`${file.name}: ${err instanceof Error ? err.message : 'could not read file'}`);
      }
    }

    if (!added) {
      setBusy('');
      setScanStatus('No supported local pages were added.');
      setLocalImportSummary(skipped.length ? skipped.join(' · ') : 'No supported files were found.');
      setMessage('Nothing was imported. Use PDF, Word .docx, or browser-readable image files.');
      return;
    }

    finishingRef.current = true;
    setBusy('Processing imported pages with AI…');
    setScanStatus(`Imported ${added} page/segment(s). Finishing AI extraction…`);
    setLastCapture(`${selected.length} local file(s) read. Original files were not saved to cloud storage.`);
    setLocalImportSummary(`${selected.length - skipped.length}/${selected.length} file(s) accepted · ${added} page/segment(s) prepared locally.${skipped.length ? ` Skipped: ${skipped.join(' · ')}` : ''}`);
    setMessage('Local-first import active: source files stay on your device. Only temporary prepared page/text content is sent for AI checking; permanent storage keeps structured results only.');
    pumpQueue(true);
    finishIfDone();
  };

  const clearBatch = () => {
    stopCamera();
    queueRef.current = [];
    failedFramesRef.current = [];
    paperPreviewRef.current = {};
    activeWorkersRef.current = 0;
    processingPagesRef.current = 0;
    finishingRef.current = false;
    scanCountRef.current = 0;
    setScannedCount(0);
    setProcessedCount(0);
    setQueuedCount(0);
    setProcessingCount(0);
    setFailedCount(0);
    setFailedFrames([]);
    setRetryCount(0);
    setLastCapture('No page captured yet.');
    setExtracted([]);
    setAnswerKey([]);
    setGrades([]);
    setAssessments([]);
    setReleased(false);
    setReportReady(false);
    setSyncOpen(false);
    setSyncFaculty('');
    setSyncClass('');
    setSyncPeriod('');
    setSyncType('Quiz');
    setSyncAssessment('');
    setBatchId('');
    setReviewOnly(false);
    setLocalImportSummary('No local files selected.');
    setRubricText('');
    setRubricSource('');
    setRubricBusy('');
    setReportInspect('');
    setPaperReviewId('');
    setEditGradeId('');
    setEditScore('');
    setEditFeedback('');
    setEditBusy(false);
    setBusy('');
    setScanStatus('Ready to scan or import local files.');
    setMessage('Batch cleared.');
  };

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
    void api.get('/api/batches').then(response => setBatchHistory(response.data?.batches || [])).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get('handoff');
    if (handoff) {
      params.delete('handoff');
      const cleanQuery = params.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`);
      setRosterBusy('Connecting securely from BUKLOD…');
      void fetch(BUKLOD_HANDOFF_REDEEM_FUNCTION, { method: 'POST', headers: { apikey: BUKLOD_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: handoff }) })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'QuickCheck handoff failed.');
          setQuickCheckSession(String(data.quickcheckSession || ''));
          setQuickCheckBearerToken('');
          setBuklodHandoffConnected(true);
          setSelectedClassroomId(data.classroom?.id || '');
          setRosterStudents(data.students || []);
          setRosterClassroom(data.classroom || null);
          setRosterSyncedAt(data.syncedAt || new Date().toISOString());
          const profileAccessory = data.launchContext === 'profile-accessory';
          setMessage(profileAccessory
            ? 'Quick Check opened securely from BUKLOD Profile — no additional sign-in required.'
            : `Connected from BUKLOD Classroom — no additional sign-in required. ${data.students?.length || 0} ACTIVE enrolled student(s) loaded.`);
          void api.get('/api/batches').then(response => setBatchHistory(response.data?.batches || [])).catch(() => undefined);
        })
        .catch(err => {
          setBuklodHandoffConnected(false);
          setMessage(`BUKLOD handoff expired or could not be used: ${err instanceof Error ? err.message : 'unknown error'}. You can still use the manual connection below.`);
        })
        .finally(() => setRosterBusy(''));
    }
    return () => stopCamera();
  }, []);

  const loadDemo = () => {
    stopCamera();
    setExtracted(demoPages);
    setScannedCount(3);
    setProcessedCount(3);
    setQueuedCount(0);
    setProcessingCount(0);
    setFailedCount(0);
    setFailedFrames([]);
    setRetryCount(0);
    setLastCapture('Demo: Page 3 captured successfully.');
    setAnswerKey([]);
    setGrades([]);
    setAssessments([]);
    setReleased(false);
    setReportReady(true);
    setSyncOpen(false);
    setMessage('Demo mixed papers loaded. Final Report / Summary is ready below.');
    window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const retryFailed = () => {
    if (!failedFramesRef.current.length) return;
    const retryPages = failedFramesRef.current.map(frame => ({ ...frame, retries: 0, failureReason: undefined }));
    failedFramesRef.current = [];
    setFailedFrames([]);
    setFailedCount(0);
    queueRef.current.push(...retryPages);
    setQueuedCount(queueRef.current.length);
    setMessage(`${retryPages.length} failed page(s) returned to the processing queue. No rescan needed.`);
    setReportReady(false);
    finishingRef.current = true;
    setBusy('Retrying retained failed pages…');
    pumpQueue(true);
  };

  const rosterContext = rosterStudents.length ? { classroom: rosterClassroom || undefined, syncedAt: rosterSyncedAt, students: rosterStudents } : undefined;

  const applyRubric = (nextText: string, source: string) => {
    setRubricText(nextText);
    setRubricSource(nextText.trim() ? source : '');
    if (grades.length || answerKey.length || released) {
      setGrades([]);
      setAnswerKey([]);
      setReleased(false);
      setBatchId('');
      setMessage('Rubric changed. Previous suggested grades were cleared so the batch must be checked again using the current grading basis.');
    }
  };

  const importRubricFile = async (file: File | undefined) => {
    if (!file) return;
    setRubricBusy(`Reading ${file.name} locally…`);
    try {
      const inputs = await prepareLocalFile(file);
      if (inputs.length > 12) throw new Error('Rubric is over 12 prepared pages/segments. Use a shorter rubric file or split it.');
      setRubricBusy('Extracting rubric criteria…');
      const response = await api.post('/api/rubric-extract', { inputs });
      const normalized = String(response.data.rubricText || '').trim();
      if (!normalized) throw new Error('No usable rubric criteria were detected.');
      applyRubric(normalized, file.name);
      setMessage(`Rubric ON: ${response.data.title || file.name}. AI checking will use this teacher rubric as the primary grading authority.`);
    } catch (err) {
      setMessage(`Rubric could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}. You can paste the rubric text instead.`);
    } finally {
      setRubricBusy('');
    }
  };

  const connectBuklodClassroom = async () => {
    if (!buklodEmail.trim() || !buklodPassword) return setMessage('Enter your BUKLOD email and password to sync Classroom roster.');
    setRosterBusy('Signing in to BUKLOD…');
    try {
      const authResponse = await fetch(`${BUKLOD_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: BUKLOD_PUBLISHABLE_KEY }, body: JSON.stringify({ email: buklodEmail.trim(), password: buklodPassword }) });
      const auth = await authResponse.json();
      if (!authResponse.ok || !auth.access_token) throw new Error(auth.error_description || auth.msg || auth.error || 'BUKLOD sign-in failed.');
      setBuklodToken(auth.access_token);
      setQuickCheckBearerToken(auth.access_token);
      setQuickCheckSession('');
      setBuklodPassword('');
      const classroomResponse = await fetch(BUKLOD_ROSTER_FUNCTION, { headers: { Authorization: `Bearer ${auth.access_token}`, apikey: BUKLOD_PUBLISHABLE_KEY } });
      const classroomData = await classroomResponse.json();
      if (!classroomResponse.ok) throw new Error(classroomData.error || 'Could not load faculty classrooms.');
      const list = (classroomData.classrooms || []) as BuklodClassroom[];
      setBuklodClassrooms(list);
      if (list.length === 1) setSelectedClassroomId(list[0].id);
      setMessage(`BUKLOD connected. ${list.length} faculty classroom(s) available.`);
    } catch (err) {
      setBuklodToken('');
      setMessage(`BUKLOD Classroom connection failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRosterBusy('');
    }
  };

  const syncBuklodRoster = async () => {
    if (!buklodToken || !selectedClassroomId) return setMessage('Connect BUKLOD and select a classroom first.');
    setRosterBusy('Syncing enrolled students…');
    try {
      const response = await fetch(BUKLOD_ROSTER_FUNCTION, { method: 'POST', headers: { Authorization: `Bearer ${buklodToken}`, apikey: BUKLOD_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ classroomId: selectedClassroomId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Roster sync failed.');
      setRosterStudents(data.students || []);
      setRosterClassroom(data.classroom || null);
      setRosterSyncedAt(data.syncedAt || new Date().toISOString());
      setMessage(`${data.students?.length || 0} ACTIVE enrolled student(s) synced from ${data.classroom?.name || 'BUKLOD Classroom'}. QuickCheck will use this roster as the primary identity reference.`);
    } catch (err) {
      setMessage(`Roster sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRosterBusy('');
    }
  };

  const disconnectBuklod = () => {
    setBuklodToken('');
    setQuickCheckBearerToken('');
    setQuickCheckSession('');
    setBuklodHandoffConnected(false);
    setBuklodClassrooms([]);
    setSelectedClassroomId('');
    setRosterStudents([]);
    setRosterClassroom(null);
    setRosterSyncedAt('');
    setMessage('BUKLOD Classroom disconnected. QuickCheck remains available in standalone mode.');
  };

  const checkAll = async () => {
    if (!extracted.length) return setMessage('Finish scanning papers first, import local files, or load Demo Data.');
    setBusy('Auto-sorting mixed papers, matching page sequences, and separating activities…');
    setMessage('');
    try {
      const reconciled = await api.post('/api/reconcile', { pages: extracted, rosterContext });
      const sortedPages = reconciled.data.pages as ExtractedPage[];
      setExtracted(sortedPages);
      setAssessments((reconciled.data.assessments || []) as AssessmentSummary[]);
      setBusy(rubricText.trim() ? 'Applying teacher rubric and building suggested grades…' : 'Building suggested answer keys and grades by assessment…');
      const response = await api.post('/api/grade', { pages: sortedPages, rosterContext, rubricText: rubricText.trim(), rubricSource });
      setAnswerKey(response.data.answerKey as AnswerKeyItem[]);
      setGrades(response.data.grades as StudentGrade[]);
      if (Array.isArray(response.data.pages)) setExtracted(response.data.pages as ExtractedPage[]);
      if (Array.isArray(response.data.assessments)) setAssessments(response.data.assessments as AssessmentSummary[]);
      if (response.data.batchId) setBatchId(String(response.data.batchId));
      if (typeof response.data.rubricText === 'string') setRubricText(response.data.rubricText);
      if (typeof response.data.rubricSource === 'string') setRubricSource(response.data.rubricSource);
      setReleased(false);
      if (response.data.persisted) {
        const history = await api.get('/api/batches');
        setBatchHistory(history.data?.batches || []);
      }
      const gradingBasis = rubricText.trim() ? ` Teacher rubric applied${rubricSource ? ` (${rubricSource})` : ''}.` : ' No rubric supplied; suggested answer-key mode used.';
      setMessage(response.data.persisted ? `Mixed papers sorted and SAVED as a permanent Batch Record.${gradingBasis} Suggested grades are ready for teacher approval.` : `Mixed papers sorted.${gradingBasis} Suggested grades are ready for teacher approval.`);
    } catch (err) {
      setMessage(`Checking failed: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy('');
    }
  };

  const exportCsv = () => {
    if (!grades.length) return;
    if (!released) return setMessage('Release all grades first. CSV export is locked until every suggested grade is teacher-approved.');
    const rows = [
      ['Student ID', 'Student Name', 'Score', 'Max Score', 'Percent', 'Confidence', 'Review Status', 'Approval Status', 'Flags', 'Feedback'],
      ...grades.map(g => [g.studentId || '', g.studentName, String(g.score), String(g.maxScore), String(g.percent), `${Math.round(g.confidence * 100)}%`, g.reviewStatus || '', g.approvalStatus || 'pending', g.flags.join('; '), g.feedback]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quickcheck-grades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBuklodSync = () => {
    if (!grades.length) return setMessage('Check the batch first.');
    if (!released) return setMessage('Release all grades first. BUKLOD Classroom handoff only uses fully teacher-approved results.');
    if (!syncClass.trim() || !syncAssessment.trim() || !syncType.trim()) {
      return setMessage('For BUKLOD sync, enter the Class/Classroom, Record Type, and Assessment title.');
    }
    const rows = [
      ['Faculty/Owner', 'Class/Classroom', 'Grading Period', 'Record Type', 'Assessment', 'Student ID', 'Student Name', 'Score', 'Max Score', 'Percent', 'Confidence', 'Flags', 'Feedback'],
      ...grades.map(g => [syncFaculty.trim(), syncClass.trim(), syncPeriod.trim(), syncType.trim(), syncAssessment.trim(), g.studentId || '', g.studentName, String(g.score), String(g.maxScore), String(g.percent), `${Math.round(g.confidence * 100)}%`, g.flags.join('; '), g.feedback]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quickcheck-buklod-sync.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`BUKLOD sync package prepared for ${syncClass.trim()} → ${syncType.trim()} → ${syncAssessment.trim()}. Nothing was posted automatically.`);
  };

  const applyApproval = async (action: 'approve_correct' | 'approve_grade' | 'approve_remaining' | 'release', gradeId?: string, confirmCritical = false) => {
    if (!grades.length) return setMessage('Check the batch first.');
    if (!batchId) return setMessage('This batch has no permanent record yet. Run AUTO-SORT & SUGGEST GRADES first.');
    try {
      const response = await api.put(`/api/batches/${batchId}/approval`, { action, gradeId, confirmCritical });
      if (Array.isArray(response.data.grades)) setGrades(response.data.grades as StudentGrade[]);
      setReleased(response.data.status === 'released');
      const history = await api.get('/api/batches');
      setBatchHistory(history.data?.batches || []);
      if (action === 'approve_correct') setMessage('All Looks Correct grades were approved. Needs Review and Critical Review remain untouched.');
      if (action === 'approve_grade') setMessage('Reviewed grade approved and saved to the permanent Batch Record.');
      if (action === 'approve_remaining') setMessage('Remaining reviewed grades approved. You can now RELEASE ALL GRADES.');
      if (action === 'release') setMessage('ALL GRADES RELEASED. The permanent Batch Record, CSV export, and BUKLOD Classroom handoff are synchronized to the final teacher-approved state.');
    } catch (err) {
      setMessage(`Approval failed: ${err instanceof Error ? err.message : 'unknown error'}.`);
    }
  };

  const approveAllCorrect = async () => {
    const pendingCorrect = grades.filter(g => g.reviewStatus === 'looks_correct' && g.approvalStatus !== 'approved').length;
    if (!pendingCorrect) return setMessage('No Looks Correct grades are waiting for bulk approval.');
    await applyApproval('approve_correct');
  };

  const approveOne = async (gradeId?: string) => {
    if (!gradeId) return setMessage('This grade is missing its permanent grade ID. Recheck the batch first.');
    await applyApproval('approve_grade', gradeId);
  };

  const openGradeEditor = (grade: StudentGrade) => {
    if (!grade.gradeId) return setMessage('This grade is missing its permanent grade ID. Recheck the batch first.');
    if (released) return setMessage('Released grades are locked and cannot be edited in place.');
    setEditGradeId(grade.gradeId);
    setEditScore(String(grade.score));
    setEditFeedback(grade.feedback || '');
  };

  const saveTeacherGrade = async () => {
    if (!editGrade || !batchId) return;
    const score = Number(editScore);
    if (!Number.isFinite(score) || score < 0 || score > editGrade.maxScore) return setMessage(`Enter a score from 0 to ${editGrade.maxScore}.`);
    setEditBusy(true);
    try {
      const response = await api.put(`/api/batches/${batchId}/grade`, { gradeId: editGrade.gradeId, score, feedback: editFeedback });
      if (Array.isArray(response.data.grades)) setGrades(response.data.grades as StudentGrade[]);
      setReleased(false);
      const history = await api.get('/api/batches');
      setBatchHistory(history.data?.batches || []);
      setEditGradeId('');
      setMessage('Teacher-adjusted grade saved. Approval for this student is Pending again so you can review and approve the final score.');
    } catch (err) {
      setMessage(`Grade adjustment failed: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setEditBusy(false);
    }
  };

  const approveRemaining = async () => {
    if (!gradeReview.pending) return setMessage('All grades are already approved.');
    const criticalPending = grades.filter(g => g.approvalStatus !== 'approved' && g.reviewStatus === 'critical_review').length;
    const prompt = criticalPending > 0 ? `${gradeReview.pending} grade(s) remain, including ${criticalPending} CRITICAL REVIEW item(s). Approve them only if you personally reviewed and accept them. Continue?` : `${gradeReview.pending} reviewed grade(s) remain. Approve all remaining?`;
    if (!window.confirm(prompt)) return;
    await applyApproval('approve_remaining', undefined, criticalPending > 0);
  };

  const releaseAll = async () => {
    if (failedCount > 0) return setMessage('Resolve all Failed / Needs Rescan pages before release.');
    if (gradeReview.pending > 0) return setMessage(`${gradeReview.pending} grade(s) still need teacher approval before release.`);
    if (!window.confirm(`Release ${grades.length} fully approved grade(s) as final?`)) return;
    await applyApproval('release');
  };

  const loadSavedBatch = async (id: string) => {
    setBusy('Loading saved batch record…');
    try {
      const response = await api.get(`/api/batches/${id}`);
      setBatchId(id);
      setExtracted(response.data.pages || []);
      setAssessments(response.data.assessments || []);
      setAnswerKey(response.data.answerKey || []);
      setGrades(response.data.grades || []);
      setRubricText(response.data.rubricText || '');
      setRubricSource(response.data.rubricSource || '');
      setScannedCount(response.data.pageCount || response.data.pages?.length || 0);
      setProcessedCount(response.data.pageCount || response.data.pages?.length || 0);
      setFailedCount(0);
      setFailedFrames([]);
      setReleased(response.data.status === 'released');
      setReportReady(true);
      setMessage('Saved Batch Record loaded. You can review it or reprocess with the latest sorting rules.');
      window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (err) {
      setMessage(`Could not load batch record: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy('');
    }
  };

  const reprocessSavedBatch = async (id: string) => {
    setBusy('Reprocessing saved batch with the latest sorting rules…');
    try {
      const response = await api.post(`/api/batches/${id}/reprocess`);
      setExtracted(response.data.pages || []);
      setAssessments(response.data.assessments || []);
      setBatchId(id);
      setRubricText(response.data.rubricText || '');
      setRubricSource(response.data.rubricSource || '');
      setGrades([]);
      setAnswerKey([]);
      setReleased(false);
      setReportReady(true);
      setMessage('Saved batch re-sorted. Click AUTO-SORT & SUGGEST GRADES to create a fresh suggested grading record.');
    } catch (err) {
      setMessage(`Reprocess failed: ${err instanceof Error ? err.message : 'unknown error'}.`);
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <ScanLine size={14} /> QuickCheck Web App
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">QuickCheck</h1>
            <p className="mt-2 max-w-2xl text-slate-400">Scan with the camera or read a user-selected local PDF, Word file, image, or folder; reject unreadable pages, auto-sort assessments, suggest grades, approve results, and reopen permanent batch records later.</p>
          </div>
          <button onClick={loadDemo} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800">Load Demo Data</button>
        </header>

        <QuickCheckEconomyPanel connected={!!buklodToken || buklodHandoffConnected} />

        <section className="mb-6 rounded-3xl border border-cyan-400/25 bg-slate-900 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Optional identity authority</div><h2 className="mt-1 text-xl font-black">BUKLOD Classroom Roster Sync</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">Open QuickCheck from Profile &gt; Accessory Apps for secure access with no second sign-in. Classroom roster sync is optional and remains available when you want enrolled students to be the identity authority.</p></div>{(buklodToken || buklodHandoffConnected) && <button onClick={disconnectBuklod} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold">DISCONNECT</button>}</div>
          {buklodHandoffConnected ? <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4"><div className="font-black text-emerald-300">✓ Connected securely from BUKLOD — no additional sign-in required</div><div className="mt-1 text-xs text-slate-400">QuickCheck opened from your existing BUKLOD session. Classroom roster matching is optional.</div></div> : !buklodToken ? <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input type="email" value={buklodEmail} onChange={e => setBuklodEmail(e.target.value)} placeholder="BUKLOD email" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-400" /><input type="password" value={buklodPassword} onChange={e => setBuklodPassword(e.target.value)} placeholder="BUKLOD password" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-400" /><button disabled={!!rosterBusy} onClick={() => void connectBuklodClassroom()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40">CONNECT BUKLOD</button></div> : <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><select value={selectedClassroomId} onChange={e => setSelectedClassroomId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">Select faculty classroom…</option>{buklodClassrooms.map(item => <option key={item.id} value={item.id}>{item.name}{item.section_name ? ` — ${item.section_name}` : ''}{item.subject_code ? ` (${item.subject_code})` : ''}</option>)}</select><button disabled={!selectedClassroomId || !!rosterBusy} onClick={() => void syncBuklodRoster()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40">SYNC ENROLLED STUDENTS</button></div>}
          {rosterStudents.length > 0 && <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4"><div className="font-black text-emerald-300">✓ {rosterStudents.length} enrolled students synced</div><div className="mt-1 text-xs text-slate-400">{rosterClassroom?.name}{rosterClassroom?.section_name ? ` · ${rosterClassroom.section_name}` : ''} · synced {rosterSyncedAt ? new Date(rosterSyncedAt).toLocaleString() : 'now'}</div><div className="mt-3 flex max-h-28 flex-wrap gap-1 overflow-auto">{rosterStudents.map(student => <span key={student.userId} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300">{student.fullName}{student.studentNumber ? ` · ${student.studentNumber}` : ''}</span>)}</div></div>}
          {rosterBusy && <div className="mt-3 text-xs font-bold text-cyan-300">{rosterBusy}</div>}
        </section>

        <section className="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Permanent records</div><h2 className="mt-1 text-xl font-black">Batch Records / History</h2><p className="mt-1 text-xs text-slate-500">Structured results are saved; raw camera frames and imported source files are not stored as permanent cloud files. Saved batches can be reopened or reprocessed from their structured extraction results.</p></div>
          {batchHistory.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-2">{batchHistory.slice(0, 10).map(batch => <div key={batch.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-bold">{new Date(batch.createdAt).toLocaleString()}</div><div className="mt-1 text-xs text-slate-500">{batch.pageCount} pages · {batch.studentCount} students · {batch.assessmentCount} assessment(s)</div></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${batch.status === 'approved' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-violet-400/10 text-violet-300'}`}>{batch.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => void loadSavedBatch(batch.id)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800">OPEN RECORD</button><button onClick={() => void reprocessSavedBatch(batch.id)} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-200">REPROCESS</button></div></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-sm text-slate-500">No saved batches yet. Finish a scan and run AUTO-SORT &amp; SUGGEST GRADES to create the first permanent record.</div>}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ['Scanned', scannedCount, <Camera key="a" />, 'captured'],
            ['Processed', processedCount, <FileCheck2 key="b" />, 'processed'],
            ['Flags', flags, <Flag key="c" />, 'flags'],
            ['Released', released ? 'Yes' : 'No', <CheckCircle2 key="d" />, 'released'],
          ].map(([label, value, icon, inspectKey]) => (
            <button type="button" onClick={() => setReportInspect(String(inspectKey))} key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
              <div className="mb-3 text-cyan-300">{icon}</div>
              <div className="text-3xl font-black">{value}</div>
              <div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>{label}</span><span className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">View</span></div>
            </button>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-bold">1. Scan or Import</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">Use the camera, select individual files, or grant access to one local folder. PDF pages and images are prepared/compressed locally; Word .docx text is extracted locally. Original files are not permanently uploaded or stored.</p>
            </div>
            <button onClick={clearBatch} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 font-semibold hover:bg-slate-800"><Trash2 size={18} /> Clear</button>
          </div>

          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={e => { void importLocalFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
          <input ref={folderInputRef} type="file" multiple accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={e => { void importLocalFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
          <div className="mt-5 rounded-2xl border border-violet-400/25 bg-violet-400/5 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Local-first file access</div>
                <div className="mt-1 font-black">PDF · Word .docx · Pictures · Folder</div>
                <p className="mt-1 max-w-3xl text-xs text-slate-400">QuickCheck reads only files/folders you choose. Local preparation reduces transfer size and avoids source-file cloud storage. AI checking still uses internet data because prepared page/text content is sent temporarily for extraction.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[330px]">
                <button disabled={!!busy || scanning} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><Upload size={18} /> SELECT FILES</button>
                <button disabled={!!busy || scanning} onClick={() => folderInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/40 px-4 py-3 text-sm font-black text-violet-200 disabled:opacity-40"><FolderOpen size={18} /> SELECT FOLDER</button>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">{localImportSummary}</div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-700 bg-black">
            <div className="relative aspect-[3/4] max-h-[68vh] w-full sm:aspect-video">
              <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${scanning ? 'block' : 'hidden'}`} />
              {!scanning && (
                <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
                  <Camera size={44} className="mb-4 text-cyan-300" />
                  <div className="text-lg font-bold">Camera is off</div>
                  <div className="mt-1 text-sm text-slate-500">Start the camera for paper scanning, or use Select Files / Select Folder above for documents already on this device.</div>
                </div>
              )}
              {scanning && (
                <>
                  <div className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.10)]" />
                  <div className="pointer-events-none absolute left-3 right-3 top-3 rounded-2xl border border-white/10 bg-black/25 p-3 sm:left-5 sm:right-5 sm:top-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Live Scan</div>
                    <div className="mt-1 text-sm font-black text-white sm:text-lg">{scanStatus}</div>
                    <div className="mt-1 truncate text-xs font-semibold text-emerald-300">✓ {lastCapture}</div>
                  </div>
                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-black/30 p-2 sm:bottom-5 sm:left-5 sm:right-5 sm:gap-2 sm:p-3">
                    {[['Captured', scannedCount], ['Waiting', queuedCount], ['Processing', processingCount], ['Processed', processedCount], ['Failed', failedCount]].map(([label, value]) => (
                      <div key={String(label)} className="min-w-0 text-center">
                        <div className={`text-base font-black sm:text-2xl ${label === 'Failed' && Number(value) > 0 ? 'text-rose-300' : label === 'Processed' ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
                        <div className="truncate text-[8px] font-semibold uppercase tracking-tight text-slate-300 sm:text-[10px]">{label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <canvas ref={motionCanvasRef} className="hidden" />

          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">What to do now</div>
                <div className="mt-1 text-lg font-black text-cyan-300">{scanStatus}</div>
                <div className="mt-2 text-sm font-semibold text-emerald-300">✓ {lastCapture}</div>
              </div>
              {scanning && <span className="mt-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"><div className="text-2xl font-black">{scannedCount}</div><div className="text-xs text-slate-500">Captured</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"><div className="text-2xl font-black">{queuedCount}</div><div className="text-xs text-slate-500">Waiting</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"><div className="text-2xl font-black">{processingCount}</div><div className="text-xs text-slate-500">Processing</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"><div className="text-2xl font-black text-emerald-300">{processedCount}</div><div className="text-xs text-slate-500">Processed</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"><div className="text-2xl font-black text-rose-300">{failedCount}</div><div className="text-xs text-slate-500">Failed</div></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">The live counters stay on the camera. A blurred/cut-off page is retried once automatically; if still unreliable, it is rejected into Needs Rescan and never silently included in grading. Quality retries so far: {retryCount}.</p>
          </div>

          {failedFrames.length > 0 && (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-black text-rose-300">Failed / Needs Rescan pages</div>
                  <div className="mt-1 text-xs text-slate-400">{failedFrames.map(frame => `${frame.name.replace('.jpg', '')}${frame.failureReason ? ` — ${frame.failureReason}` : ''}`).join(' · ')}</div>
                </div>
                <button onClick={retryFailed} className="rounded-xl bg-rose-300 px-4 py-2.5 text-sm font-black text-slate-950">RETRY FAILED</button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {!scanning ? (
              <button disabled={!!busy} onClick={() => void startScanning()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-40"><Camera size={18} /> START CONTINUOUS SCAN</button>
            ) : (
              <button onClick={() => void finishBatch()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950"><Square size={18} /> FINISH BATCH</button>
            )}
            <div className="flex items-center justify-center rounded-xl border border-slate-800 px-4 py-3 text-center text-xs text-slate-500">Auto-capture occurs only after the page is steady. It re-arms after you replace the page, helping prevent duplicate captures.</div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-amber-400/25 bg-slate-900 p-5 sm:p-6">
          <input ref={rubricInputRef} type="file" accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={e => { void importRubricFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Optional grading basis</div>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-black"><ClipboardCheck size={21} /> 2. Teacher Rubric</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">Optional. Paste a rubric or select a local PDF, Word .docx, or picture. When a rubric is present, QuickCheck uses it as the primary AI grading authority instead of relying only on an inferred answer key.</p>
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-xs font-black ${rubricText.trim() ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{rubricText.trim() ? `✓ RUBRIC ON${rubricSource ? ` · ${rubricSource}` : ''}` : 'RUBRIC OFF · OPTIONAL'}</div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <textarea value={rubricText} onChange={e => applyRubric(e.target.value, e.target.value.trim() ? 'Pasted / edited rubric' : '')} placeholder="Paste grading criteria here — e.g. Accuracy 40%, Completeness 30%, Explanation 20%, Format 10%..." className="min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-amber-300" />
            <div className="grid content-start gap-2 lg:w-56">
              <button disabled={!!rubricBusy || !!busy} onClick={() => rubricInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><Upload size={17} /> SELECT RUBRIC FILE</button>
              <button disabled={!rubricText && !rubricSource} onClick={() => applyRubric('', '')} className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 disabled:opacity-40">CLEAR RUBRIC</button>
              {rubricBusy && <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs font-bold text-amber-200"><Loader2 size={14} className="animate-spin" /> {rubricBusy}</div>}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Rubric files follow the same local-first rule: the original file is not stored as a cloud asset. Only normalized rubric text is retained with the structured Batch Record so the grading basis can be reviewed later.</p>
        </section>

        {reportReady && (extracted.length > 0 || failedFrames.length > 0) && (
          <section ref={reportRef} className="mt-6 scroll-mt-4 rounded-3xl border border-emerald-400/30 bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Batch complete</div>
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">END-TO-END BATCH REPORT</h2>
                <p className="mt-1 text-sm text-slate-400">One complete record of this batch: scan quality, detected assessments, matched students/pages, Classroom-roster matching when synced, grading status, review flags, approval state, and permanent-record status.</p>
                {rosterStudents.length > 0 && <div className="mt-2 text-xs font-bold text-cyan-300">Roster authority: {rosterClassroom?.name || 'BUKLOD Classroom'} · {extracted.filter(p => p.rosterMatchStatus === 'matched').length} matched · {extracted.filter(p => p.rosterMatchStatus === 'not_in_roster').length} possible wrong class · {extracted.filter(p => p.rosterMatchStatus === 'unidentified' || p.rosterMatchStatus === 'possible').length} needs identity review</div>}
                {rubricText.trim() && <div className="mt-2 text-xs font-black text-amber-300">✓ Teacher Rubric ON · {rubricSource || 'Pasted rubric'} · rubric criteria control AI grading</div>}
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300">{failedCount === 0 ? '✓ Scan batch complete' : `⚑ ${failedCount} failed page(s) retained`}</div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Captured', scannedCount, 'captured'],
                ['Processed', processedCount, 'processed'],
                ['Assessments', assessments.length || (extracted.length ? 1 : 0), 'assessments'],
                ['Students', uniqueStudentCount, 'students'],
                ['Failed', failedCount, 'failed'],
                ['Graded', grades.length, 'graded'],
              ].map(([label, value, inspectKey]) => (
                <button type="button" onClick={() => setReportInspect(String(inspectKey))} key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-center transition hover:border-cyan-400/50 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
                  <div className={`text-2xl font-black ${label === 'Failed' && Number(value) > 0 ? 'text-rose-300' : label === 'Processed' ? 'text-emerald-300' : ''}`}>{value}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label} · <span className="text-cyan-300">View</span></div>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <button type="button" onClick={() => setReportInspect('scan_quality')} className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-left transition hover:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"><div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wide text-cyan-300">Scan & Quality</div><span className="text-[10px] font-black uppercase text-cyan-300">View details</span></div><div className="mt-2 text-sm font-bold">{processedCount}/{scannedCount} accepted pages</div><div className="mt-1 text-xs text-slate-400">{failedCount === 0 ? 'All captured pages passed the quality gate.' : `${failedCount} page(s) rejected or retained for retry/rescan.`} Blur/cut-off pages are never silently graded.</div></button>
              <button type="button" onClick={() => setReportInspect('sorting_identity')} className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 text-left transition hover:border-violet-300/60 focus:outline-none focus:ring-2 focus:ring-violet-400/40"><div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wide text-violet-300">Sorting & Identity</div><span className="text-[10px] font-black uppercase text-violet-300">View details</span></div><div className="mt-2 text-sm font-bold">{assessments.length || (extracted.length ? 1 : 0)} assessment(s) · {uniqueStudentCount} unique student(s) · {grouped.length} student-assessment record(s)</div><div className="mt-1 text-xs text-slate-400">Explicit names/IDs are hard identity boundaries. Different named students are never merged merely because page sequence, handwriting, or activity looks continuous.</div></button>
              <button type="button" onClick={() => setReportInspect('grade_record')} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-left transition hover:border-emerald-300/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"><div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wide text-emerald-300">Grade & Record</div><span className="text-[10px] font-black uppercase text-emerald-300">View details</span></div><div className="mt-2 text-sm font-bold">{grades.length ? `${grades.length} suggested grade(s)` : 'Not graded yet'} · {released ? 'Teacher approved' : 'Awaiting teacher approval'}</div><div className="mt-1 text-xs text-slate-400">{batchId ? `Permanent Batch Record saved (${batchId.slice(0, 8)}…).` : 'Permanent grading record is created when Auto-Sort & Suggest Grades completes.'}</div></button>
            </div>

            {assessments.length > 0 && <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Detected Assessment Breakdown · click to inspect</div><div className="mt-3 grid gap-2 md:grid-cols-2">{assessments.map(a => { const assessmentGrades = grades.filter(g => g.assessmentId === a.id); const avg = assessmentGrades.length ? Math.round(assessmentGrades.reduce((sum, g) => sum + g.percent, 0) / assessmentGrades.length) : null; return <button type="button" onClick={() => setReportInspect(`assessment:${a.id}`)} key={a.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-400/40"><div className="flex items-start justify-between gap-2"><div><div className="font-bold">{a.title}</div><div className="text-xs text-violet-300">{a.kind}</div></div><span className="text-xs font-bold text-slate-300">{Math.round(a.confidence * 100)}% match</span></div><div className="mt-2 text-xs text-slate-400">{a.pageCount} page(s) · {a.studentCount} student(s){avg === null ? '' : ` · ${avg}% average`}</div>{a.flags.length > 0 && <div className="mt-2 text-xs text-amber-300">⚑ {a.flags.join(' · ')}</div>}<div className="mt-2 text-[10px] font-black uppercase text-violet-300">View contents</div></button>; })}</div></div>}

            {grades.length > 0 && (
              <button type="button" onClick={() => setReportInspect('overall_grade')} className="mt-4 w-full rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-violet-300/60 focus:outline-none focus:ring-2 focus:ring-violet-400/40">
                Overall grade summary: <span className="font-black text-violet-300">{Math.round(grades.reduce((sum, grade) => sum + grade.percent, 0) / grades.length)}% class average</span> · <span className="text-emerald-300">{gradeReview.correct} Looks Correct</span> · <span className="text-amber-300">{gradeReview.review} Needs Review</span> · <span className="text-rose-300">{gradeReview.critical} Critical Review</span> · {gradeReview.approved}/{grades.length} approved · {released ? 'Released' : 'Not released'} <span className="ml-2 text-[10px] font-black uppercase text-violet-300">View details</span>
              </button>
            )}

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">End-to-End Status · click any step to see why</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><button type="button" onClick={() => setReportInspect('step_scan')} className="rounded-xl bg-slate-900 p-3 text-left transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"><div className="text-xs text-slate-500">1 · Scan</div><div className="mt-1 font-bold text-emerald-300">{reportReady ? 'Complete' : 'In progress'}</div><div className="mt-1 text-[9px] font-bold uppercase text-cyan-300">Why?</div></button><button type="button" onClick={() => setReportInspect('step_quality')} className="rounded-xl bg-slate-900 p-3 text-left transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"><div className="text-xs text-slate-500">2 · Quality</div><div className={`mt-1 font-bold ${failedCount ? 'text-amber-300' : 'text-emerald-300'}`}>{failedCount ? 'Needs action' : 'Passed'}</div><div className="mt-1 text-[9px] font-bold uppercase text-cyan-300">Why?</div></button><button type="button" onClick={() => setReportInspect('step_check')} className="rounded-xl bg-slate-900 p-3 text-left transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"><div className="text-xs text-slate-500">3 · Check</div><div className={`mt-1 font-bold ${grades.length ? 'text-emerald-300' : 'text-slate-400'}`}>{grades.length ? 'Suggested' : 'Pending'}</div><div className="mt-1 text-[9px] font-bold uppercase text-cyan-300">Why?</div></button><button type="button" onClick={() => setReportInspect('step_approval')} className="rounded-xl bg-slate-900 p-3 text-left transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"><div className="text-xs text-slate-500">4 · Approval</div><div className={`mt-1 font-bold ${released ? 'text-emerald-300' : 'text-slate-400'}`}>{released ? 'Approved' : 'Pending'}</div><div className="mt-1 text-[9px] font-bold uppercase text-cyan-300">Why?</div></button></div></div>

            <h3 className="mt-6 text-lg font-black">Sorted Student Records</h3>
            <p className="mt-1 text-xs text-slate-500">After checking, pages are separated by assessment/question set, then matched to the same student and ordered by likely page sequence. Handwriting similarity is only a supporting clue, never the sole basis for a merge.</p>
            {assessments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{assessments.map(a => <span key={a.id} className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-200">{a.kind}: {a.title} · {a.studentCount} student(s)</span>)}</div>}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {grouped.map(group => {
                const localFlags = group.pages.flatMap(p => p.flags);
                const conf = Math.round(Math.min(...group.pages.map(p => p.confidence)) * 100);
                const firstPage = group.pages[0];
                const groupIdentity = (firstPage?.resolvedStudentId || firstPage?.studentId || firstPage?.resolvedStudentName || firstPage?.studentName || '').trim().toLowerCase();
                const exactGrade = grades.find(grade => {
                  const gradeIdentity = (grade.studentId || grade.studentName || '').trim().toLowerCase();
                  const sameAssessment = !firstPage?.assessmentGroup || grade.assessmentId === firstPage.assessmentGroup;
                  return sameAssessment && !!groupIdentity && gradeIdentity === groupIdentity;
                });
                return (
                  <button type="button" onClick={() => exactGrade?.gradeId ? setPaperReviewId(exactGrade.gradeId) : setReportInspect(`student:${group.key}`)} key={group.key} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-bold">{group.name}</div><div className="text-xs text-slate-500">{group.pages[0]?.assessmentKind || 'Assessment'} · {group.pages[0]?.assessmentTitle || group.pages[0]?.assessmentGroup || 'Unsorted'} · {group.pages.length} page(s) · sequence {group.pages.map(p => p.sequence || p.pageNumber || '?').join('→')}</div>{group.pages[0]?.rosterMatchStatus && <div className={`mt-1 text-[10px] font-bold uppercase ${group.pages[0].rosterMatchStatus === 'matched' ? 'text-emerald-300' : group.pages[0].rosterMatchStatus === 'not_in_roster' ? 'text-rose-300' : 'text-amber-300'}`}>Roster: {group.pages[0].rosterMatchStatus.replace(/_/g, ' ')}{group.pages[0].rosterMatchConfidence != null ? ` · ${Math.round(group.pages[0].rosterMatchConfidence * 100)}%` : ''}</div>}</div>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${conf >= 80 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{conf}% match</span>
                    </div>
                    {localFlags.length > 0 && <div className="mt-3 text-xs text-amber-300">⚑ {localFlags.join(' · ')}</div>}
                    <div className="mt-3 text-[10px] font-black uppercase tracking-wide text-cyan-300">View this student's record only</div>
                  </button>
                );
              })}
            </div>
            {failedFrames.length > 0 && (
              <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-200">Resolve the retained Failed Pages above before grading so the report is complete.</div>
            )}
            <button disabled={!!busy || !!rubricBusy || scanning || queuedCount > 0 || processingCount > 0 || failedFrames.length > 0} onClick={() => void checkAll()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />} {grades.length ? 'RE-SORT & RECHECK' : 'AUTO-SORT & SUGGEST GRADES'}</button>
          </section>
        )}

        {answerKey.length > 0 && (
          <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-xl font-bold">{rubricText.trim() ? 'Rubric Grading Guide' : 'Suggested Answer Keys'}</h2>
              <p className="mt-1 text-xs text-slate-500">{rubricText.trim() ? 'This guide reflects the teacher rubric used as the primary grading authority. Teacher approval is still required.' : 'A separate suggested key is built for each detected activity/assignment/question set.'}</p>
              <div className="mt-4 space-y-3">{answerKey.map((k, index) => <div key={`${k.assessmentId || 'a'}-${k.number}-${index}`} className="rounded-xl bg-slate-950 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">{k.assessmentKind || 'Assessment'} · {k.assessmentTitle || k.assessmentId || 'Detected set'}</div><div className="mt-1 text-xs font-bold text-violet-300">Q{k.number} · {k.maxPoints} pt</div><div className="mt-1 text-sm text-slate-300">{k.expectedAnswer}</div></div>)}</div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold">3. Suggested Grades & Teacher Review</h2><p className="text-xs text-slate-500">QuickCheck separates safe suggestions from exceptions. Nothing is released until every grade is teacher-approved.</p></div><button onClick={exportCsv} disabled={!released} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16} /> CSV</button></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><div className="text-2xl font-black text-emerald-300">{gradeReview.correct}</div><div className="text-[10px] font-bold uppercase text-slate-500">Looks Correct</div></div><div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><div className="text-2xl font-black text-amber-300">{gradeReview.review}</div><div className="text-[10px] font-bold uppercase text-slate-500">Needs Review</div></div><div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3"><div className="text-2xl font-black text-rose-300">{gradeReview.critical}</div><div className="text-[10px] font-bold uppercase text-slate-500">Critical Review</div></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3"><div className="text-2xl font-black text-cyan-300">{gradeReview.approved}/{grades.length}</div><div className="text-[10px] font-bold uppercase text-slate-500">Approved</div></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => void approveAllCorrect()} disabled={grades.filter(g => g.reviewStatus === 'looks_correct' && g.approvalStatus !== 'approved').length === 0} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">APPROVE ALL CORRECT</button><button onClick={() => setReviewOnly(prev => !prev)} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-black text-amber-200">{reviewOnly ? 'SHOW ALL GRADES' : 'REVIEW FLAGS ONLY'}</button></div>
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="pb-3">Assessment</th><th className="pb-3">Student</th><th className="pb-3">Suggested</th><th className="pb-3">Confidence</th><th className="pb-3">Review</th><th className="pb-3">Approval</th><th className="pb-3">Action</th></tr></thead><tbody>{visibleGrades.map((g, index) => <tr key={g.gradeId || `${g.assessmentId || 'a'}-${g.studentId || g.studentName}-${index}`} className="border-t border-slate-800"><td className="py-3"><div className="font-semibold">{g.assessmentTitle || g.assessmentId || 'Assessment'}</div><div className="text-xs text-slate-500">{g.assessmentKind || ''}</div></td><td className="py-3"><div className="font-semibold">{g.studentName}</div><div className="text-xs text-slate-500">{g.studentId || 'No ID'}</div></td><td className="py-3 font-black">{g.score}/{g.maxScore} <span className="text-xs font-normal text-slate-500">({g.percent}%)</span></td><td className="py-3">{Math.round(g.confidence * 100)}%</td><td className="py-3">{g.reviewStatus === 'critical_review' ? <span className="font-bold text-rose-300">● Critical Review</span> : g.reviewStatus === 'needs_review' ? <span className="font-bold text-amber-300">⚑ Needs Review</span> : <span className="font-bold text-emerald-300">✓ Looks Correct</span>}{g.flags.length > 0 && <div className="mt-1 max-w-xs text-[10px] text-slate-500">{g.flags.join(' · ')}</div>}</td><td className="py-3">{g.approvalStatus === 'approved' ? <span className="font-bold text-cyan-300">✓ Approved</span> : <span className="text-slate-400">Pending</span>}</td><td className="py-3"><div className="flex min-w-[225px] flex-wrap gap-1.5"><button type="button" onClick={() => setPaperReviewId(g.gradeId || '')} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/30 bg-violet-400/10 px-2 py-1.5 text-[10px] font-black text-violet-200"><Eye size={12} /> VIEW PAPER</button><button type="button" disabled={released || !g.gradeId || !batchId} onClick={() => openGradeEditor(g)} className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] font-black text-amber-200 disabled:opacity-35"><Pencil size={12} /> EDIT GRADE</button>{g.approvalStatus !== 'approved' && <button onClick={() => void approveOne(g.gradeId)} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[10px] font-black text-cyan-200">APPROVE THIS</button>}</div></td></tr>)}</tbody></table></div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2"><button onClick={() => void approveRemaining()} disabled={gradeReview.pending === 0} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 font-black text-violet-200 disabled:opacity-40">APPROVE REMAINING</button><button onClick={() => void releaseAll()} disabled={gradeReview.pending > 0 || failedCount > 0 || released} className="rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{released ? '✓ GRADES RELEASED' : 'RELEASE ALL GRADES'}</button></div>
              <p className="mt-3 text-xs text-slate-500">Safe order: Approve All Correct → Review Flags Only → approve exceptions individually or Approve Remaining → Release All Grades. Critical Review is never included in the first bulk approval.</p>
            </div>
          </section>
        )}

        {grades.length > 0 && reportReady && (
          <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Optional final step</div>
                <h2 className="mt-1 text-xl font-black">Sync to BUKLOD Classroom</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">QuickCheck stays fully standalone. Use this only if you want these finished grades assigned to a BUKLOD faculty/class record.</p>
              </div>
              <button onClick={() => setSyncOpen(prev => !prev)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-400/20">{syncOpen ? 'CLOSE SYNC' : 'SYNC TO BUKLOD CLASSROOM'}</button>
            </div>

            {syncOpen && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">Manual handoff only in this standalone build. Nothing is posted automatically. Only RELEASED teacher-approved grades can be packaged for Classroom, so the handoff cannot bypass review.</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold text-slate-400">Faculty / Owner (optional)<input value={syncFaculty} onChange={e => setSyncFaculty(e.target.value)} placeholder="Faculty name or account" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400" /></label>
                  <label className="text-xs font-bold text-slate-400">Class / Classroom *<input value={syncClass} onChange={e => setSyncClass(e.target.value)} placeholder="e.g. CHN 3B" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400" /></label>
                  <label className="text-xs font-bold text-slate-400">Grading Period<input value={syncPeriod} onChange={e => setSyncPeriod(e.target.value)} placeholder="e.g. Midterm" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400" /></label>
                  <label className="text-xs font-bold text-slate-400">Record Type *<select value={syncType} onChange={e => setSyncType(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400"><option>Quiz</option><option>Activity</option><option>Requirement</option><option>Exam</option><option>Assignment</option><option>Performance Task</option><option>Other</option></select></label>
                  <label className="text-xs font-bold text-slate-400 md:col-span-2">Assessment / Record Name *<input value={syncAssessment} onChange={e => setSyncAssessment(e.target.value)} placeholder="e.g. Quiz 3 – Logic" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400" /></label>
                </div>
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-400">Destination preview: <span className="font-bold text-slate-200">{syncClass.trim() || 'Class not set'} → {syncPeriod.trim() ? `${syncPeriod.trim()} → ` : ''}{syncType} → {syncAssessment.trim() || 'Assessment not set'}</span> · {grades.length} student grade(s)</div>
                <button onClick={exportBuklodSync} disabled={!released} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><Download size={18} /> PREPARE BUKLOD SYNC PACKAGE</button>
              </div>
            )}
          </section>
        )}

        {paperReviewGrade && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.currentTarget === event.target) setPaperReviewId(''); }}>
            <div role="dialog" aria-modal="true" aria-label={`Paper review for ${paperReviewGrade.studentName}`} className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 p-5"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Paper Review</div><h2 className="mt-1 text-2xl font-black">{paperReviewGrade.studentName}</h2><div className="mt-1 text-sm text-slate-400">{paperReviewGrade.assessmentTitle || paperReviewGrade.assessmentId || 'Assessment'} · Suggested {paperReviewGrade.score}/{paperReviewGrade.maxScore} ({paperReviewGrade.percent}%)</div></div><button type="button" onClick={() => setPaperReviewId('')} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black">CLOSE ×</button></div>
              <div className="max-h-[calc(94vh-105px)] overflow-y-auto p-5">
                <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-slate-300"><span className="font-black text-cyan-300">Local-first preview:</span> actual paper images/text are kept only in browser memory for this current session. If this is a reopened/refresh batch, the original paper preview may be unavailable; extracted answers remain visible below.</div>
                <div className="grid gap-5 lg:grid-cols-[1.3fr_0.8fr]">
                  <div className="space-y-4">{paperReviewPages.length ? paperReviewPages.map((page, index) => { const preview = paperPreviewRef.current[page.source]; return <div key={`${page.source}-${index}`} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><div className="font-bold">Page {page.sequence || page.pageNumber || index + 1}</div><div className="text-xs text-slate-500">{page.source}</div></div><span className="text-xs font-bold text-cyan-300">{Math.round(page.confidence * 100)}% extraction</span></div>{preview?.dataUrl ? <img src={preview.dataUrl} alt={`Paper page ${index + 1} for ${paperReviewGrade.studentName}`} className="max-h-[75vh] w-full bg-white object-contain" /> : preview?.text ? <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-slate-200">{preview.text}</pre> : <div className="p-5"><div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">Original paper preview is no longer available in this browser session.</div><div className="mt-4 space-y-3">{page.questions.map((question, qIndex) => <div key={`${question.number}-${qIndex}`} className="rounded-xl bg-slate-950 p-3"><div className="text-xs font-black text-violet-300">Q{question.number}</div><div className="mt-1 text-xs text-slate-400">{question.question}</div><div className="mt-2 text-sm text-slate-100">Answer: {question.answer || '—'}</div></div>)}</div></div>}</div>; }) : <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No matched paper pages were found for this grade record.</div>}</div>
                  <div><div className="sticky top-0 rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">AI suggestion</div><div className="mt-2 text-3xl font-black">{paperReviewGrade.score}/{paperReviewGrade.maxScore} <span className="text-base text-slate-500">({paperReviewGrade.percent}%)</span></div><div className="mt-3 text-sm text-slate-300">{paperReviewGrade.feedback}</div>{paperReviewGrade.flags.length > 0 && <div className="mt-3 text-xs text-amber-300">⚑ {paperReviewGrade.flags.join(' · ')}</div>}<div className="mt-4 space-y-2">{paperReviewGrade.items.map((item, index) => <div key={`${item.number}-${index}`} className="rounded-xl bg-slate-950 p-3 text-xs"><div className="font-black text-violet-300">Item {item.number}: {item.points}/{item.maxPoints}</div><div className="mt-1 text-slate-400">{item.note}</div></div>)}</div><button type="button" disabled={released || !batchId} onClick={() => { setPaperReviewId(''); openGradeEditor(paperReviewGrade); }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40"><Pencil size={16} /> EDIT GRADE</button></div></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {editGrade && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={event => { if (event.currentTarget === event.target && !editBusy) setEditGradeId(''); }}>
            <div role="dialog" aria-modal="true" aria-label={`Edit grade for ${editGrade.studentName}`} className="w-full max-w-xl rounded-t-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Teacher Override</div><h2 className="mt-1 text-2xl font-black">Edit Grade · {editGrade.studentName}</h2><div className="mt-1 text-xs text-slate-500">AI suggested {editGrade.score}/{editGrade.maxScore}. Saving an edit resets this student's approval to Pending.</div></div><button type="button" disabled={editBusy} onClick={() => setEditGradeId('')} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black disabled:opacity-40">CLOSE ×</button></div><label className="mt-5 block text-xs font-black uppercase tracking-wide text-slate-400">Final teacher score<input type="number" min="0" max={editGrade.maxScore} step="0.25" value={editScore} onChange={event => setEditScore(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg font-black outline-none focus:border-amber-300" /></label><div className="mt-2 text-xs text-slate-500">Allowed: 0 to {editGrade.maxScore}. Percentage recalculates automatically.</div><label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-400">Teacher feedback / note<textarea value={editFeedback} onChange={event => setEditFeedback(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-300" /></label><button type="button" disabled={editBusy} onClick={() => void saveTeacherGrade()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{editBusy ? <Loader2 size={17} className="animate-spin" /> : <Pencil size={17} />} SAVE TEACHER GRADE</button></div>
          </div>
        )}

        {reportInspection && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={event => { if (event.currentTarget === event.target) setReportInspect(''); }}>
            <div role="dialog" aria-modal="true" aria-label={reportInspection.title} className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 p-5 sm:p-6">
                <div><div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Report Inspector</div><h2 className="mt-1 text-2xl font-black">{reportInspection.title}</h2><div className="mt-1 text-lg font-black text-emerald-300">{reportInspection.value}</div></div>
                <button type="button" onClick={() => setReportInspect('')} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-black text-slate-300 hover:bg-slate-800">CLOSE ×</button>
              </div>
              <div className="max-h-[calc(92vh-130px)] overflow-y-auto p-5 sm:p-6">
                <div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-violet-300">Bakit ganito?</div><p className="mt-2 text-sm text-slate-300">{reportInspection.why}</p></div><div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-amber-300">Check bago final</div><p className="mt-2 text-sm text-slate-300">{reportInspection.action}</p></div></div>
                <div className="mt-5 flex items-center justify-between gap-3"><h3 className="font-black">Underlying records</h3><span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-400">{reportInspection.rows.length} row(s)</span></div>
                {reportInspection.rows.length ? <div className="mt-3 space-y-2">{reportInspection.rows.map((row, index) => <div key={`${row.title}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-bold text-slate-100">{row.title}</div>{row.meta && <div className="mt-1 text-xs text-slate-400">{row.meta}</div>}</div>{row.status && (row.gradeId ? <button type="button" title="Open exact Paper Review" onClick={() => { setReportInspect(''); setPaperReviewId(row.gradeId || ''); }} className="w-fit rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-1 text-[10px] font-black uppercase text-violet-200 hover:bg-violet-400/20">{row.status}</button> : <span className="w-fit rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-black uppercase text-cyan-300">{row.status}</span>)}</div>{row.detail && <div className="mt-2 text-xs leading-relaxed text-slate-400">{row.detail}</div>}</div>)}</div> : <div className="mt-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center text-sm text-slate-500">No underlying rows for this item.</div>}
              </div>
            </div>
          </div>
        )}

        {(busy || message) && <div className="sticky bottom-4 mt-6 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"><div className="flex items-center gap-3">{busy && <Loader2 className="animate-spin text-cyan-300" size={18} />}<span className="text-sm text-slate-300">{busy || message}</span></div></div>}
      </div>
    </main>
  );
}

export default App;
