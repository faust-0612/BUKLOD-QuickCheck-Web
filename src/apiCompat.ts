const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';

const QC_SESSION_KEY = 'buklod_quickcheck_session_v1';
const QC_BEARER_KEY = 'buklod_quickcheck_bearer_v1';

export function setQuickCheckSession(value: string) {
  if (value) localStorage.setItem(QC_SESSION_KEY, value);
  else localStorage.removeItem(QC_SESSION_KEY);
}

export function setQuickCheckBearerToken(value: string) {
  if (value) localStorage.setItem(QC_BEARER_KEY, value);
  else localStorage.removeItem(QC_BEARER_KEY);
}

export function hasQuickCheckSession() {
  return typeof window !== 'undefined' && !!localStorage.getItem(QC_SESSION_KEY);
}

function authHeaders() {
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  const opaque = localStorage.getItem(QC_SESSION_KEY) || '';
  const bearer = localStorage.getItem(QC_BEARER_KEY) || '';
  if (opaque) headers['x-quickcheck-session'] = opaque;
  else if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return headers;
}

async function invoke(slug: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `QuickCheck request failed (${response.status})`);
  }
  return data;
}

async function listBatches() {
  return invoke('quickcheck-records-v1', { action: 'list_batches' });
}

async function getBatch(batchId: string) {
  return invoke('quickcheck-records-v1', { action: 'get_batch', batchId });
}

function wrap(data: any) {
  return { data };
}

export const api = {
  async get(path: string) {
    if (path === '/api/_gemini_probe') {
      return wrap(await invoke('quickcheck-process-v1', { action: 'health' }));
    }
    if (path === '/api/batches') {
      return wrap(await listBatches());
    }
    const batch = path.match(/^\/api\/batches\/([^/]+)$/);
    if (batch) {
      return wrap(await getBatch(decodeURIComponent(batch[1])));
    }
    throw new Error(`Unsupported QuickCheck GET route: ${path}`);
  },

  async post(path: string, body: any = {}) {
    if (path === '/api/analyze') {
      return wrap(
        await invoke('quickcheck-process-v1', {
          action: 'analyze',
          pages: body.pages || [],
        }),
      );
    }
    if (path === '/api/rubric-extract') {
      return wrap(
        await invoke('quickcheck-process-v1', {
          action: 'rubric_extract',
          inputs: body.inputs || [],
        }),
      );
    }
    if (path === '/api/reconcile') {
      return wrap(
        await invoke('quickcheck-process-v1', {
          action: 'reconcile',
          pages: body.pages || [],
          rosterContext: body.rosterContext,
        }),
      );
    }
    if (path === '/api/grade') {
      const graded = await invoke('quickcheck-process-v1', {
        action: 'grade',
        pages: body.pages || [],
        rosterContext: body.rosterContext,
        rubricText: body.rubricText || '',
        rubricSource: body.rubricSource || '',
      });
      const saved = await invoke('quickcheck-records-v1', {
        action: 'create_batch',
        pages: graded.pages || body.pages || [],
        assessments: graded.assessments || [],
        grades: graded.grades || [],
        answerKey: graded.answerKey || [],
        rubricText: graded.rubricText || body.rubricText || '',
        rubricSource: graded.rubricSource || body.rubricSource || '',
        rosterContext: body.rosterContext,
      });
      return wrap({
        ...graded,
        batchId: saved.batchId,
        createdAt: saved.createdAt,
        grades: saved.grades || graded.grades || [],
        assessments: saved.assessments || graded.assessments || [],
        persisted: true,
        status: saved.status || 'suggested',
      });
    }

    const reprocess = path.match(/^\/api\/batches\/([^/]+)\/reprocess$/);
    if (reprocess) {
      const batchId = decodeURIComponent(reprocess[1]);
      const batch = await getBatch(batchId);
      const reconciled = await invoke('quickcheck-process-v1', {
        action: 'reconcile',
        pages: batch.pages || [],
      });
      const persisted = await invoke('quickcheck-records-v1', {
        action: 'reprocess_batch',
        batchId,
        pages: reconciled.pages || [],
        assessments: reconciled.assessments || [],
      });
      return wrap({
        pages: persisted.pages || reconciled.pages || [],
        assessments: persisted.assessments || reconciled.assessments || [],
        rubricText: persisted.rubricText || batch.rubricText || '',
        rubricSource: persisted.rubricSource || batch.rubricSource || '',
        reprocessPersisted: !!persisted.reprocessPersisted,
        studentCount: persisted.studentCount,
        pageCount: persisted.pageCount,
        status: persisted.status || 'reprocessed',
      });
    }

    throw new Error(`Unsupported QuickCheck POST route: ${path}`);
  },

  async put(path: string, body: any = {}) {
    const approval = path.match(/^\/api\/batches\/([^/]+)\/approval$/);
    if (approval) {
      return wrap(
        await invoke('quickcheck-records-v1', {
          action: 'approval',
          batchId: decodeURIComponent(approval[1]),
          approvalAction: body.action,
          gradeId: body.gradeId,
          confirmCritical: !!body.confirmCritical,
        }),
      );
    }

    const grade = path.match(/^\/api\/batches\/([^/]+)\/grade$/);
    if (grade) {
      return wrap(
        await invoke('quickcheck-records-v1', {
          action: 'update_grade',
          batchId: decodeURIComponent(grade[1]),
          gradeId: body.gradeId,
          score: body.score,
          feedback: body.feedback,
        }),
      );
    }

    throw new Error(`Unsupported QuickCheck PUT route: ${path}`);
  },
};
