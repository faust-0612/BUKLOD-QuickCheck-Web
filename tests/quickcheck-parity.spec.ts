import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const handoff = {
  quickcheckSession: 'e2e-session',
  launchContext: 'profile-accessory',
  classroom: { name: 'BUKLOD Profile' },
  students: [],
  syncedAt: '2026-09-19T00:00:00.000Z',
};

const pages = [
  {
    source: 'demo-1',
    studentName: 'Maria Santos',
    studentId: '2026-001',
    resolvedStudentName: 'Maria Santos',
    resolvedStudentId: '2026-001',
    assessmentGroup: 'A1',
    assessmentTitle: 'Logic Activity',
    assessmentKind: 'Activity',
    pageNumber: 1,
    sequence: 1,
    totalPages: 2,
    questions: [
      { number: '1', question: 'What is a proposition?', answer: 'A declarative statement that is either true or false.' },
      { number: '2', question: 'Give one example of a proposition.', answer: 'Manila is in the Philippines.' },
    ],
    questionSignature: 'logic activity q1 q2 q3',
    imageQuality: 'clear',
    needsRescan: false,
    confidence: 0.98,
    flags: [],
  },
  {
    source: 'demo-2',
    studentName: 'Juan Dela Cruz',
    studentId: '2026-002',
    resolvedStudentName: 'Juan Dela Cruz',
    resolvedStudentId: '2026-002',
    assessmentGroup: 'A1',
    assessmentTitle: 'Logic Activity',
    assessmentKind: 'Activity',
    pageNumber: 1,
    sequence: 1,
    totalPages: 1,
    questions: [
      { number: '1', question: 'What is a proposition?', answer: 'A sentence that can be judged true or false.' },
      { number: '2', question: 'Give one example of a proposition.', answer: 'Close the door.' },
    ],
    questionSignature: 'logic activity q1 q2 q3',
    imageQuality: 'clear',
    needsRescan: false,
    confidence: 0.94,
    flags: [],
  },
  {
    source: 'demo-3',
    studentName: 'Maria Santos',
    studentId: '2026-001',
    resolvedStudentName: 'Maria Santos',
    resolvedStudentId: '2026-001',
    assessmentGroup: 'A1',
    assessmentTitle: 'Logic Activity',
    assessmentKind: 'Activity',
    pageNumber: 2,
    sequence: 2,
    totalPages: 2,
    questions: [
      { number: '3', question: 'Is a command a proposition? Explain.', answer: 'No, because a command has no truth value.' },
    ],
    questionSignature: 'logic activity q1 q2 q3',
    imageQuality: 'clear',
    needsRescan: false,
    confidence: 0.96,
    flags: [],
  },
];

const assessments = [{
  id: 'A1',
  title: 'Logic Activity',
  kind: 'Activity',
  pageCount: 3,
  studentCount: 2,
  confidence: 0.96,
  flags: [],
}];

const answerKey = [
  { assessmentId: 'A1', assessmentTitle: 'Logic Activity', assessmentKind: 'Activity', number: '1', question: 'What is a proposition?', expectedAnswer: 'A declarative statement with a truth value.', maxPoints: 1 },
  { assessmentId: 'A1', assessmentTitle: 'Logic Activity', assessmentKind: 'Activity', number: '2', question: 'Give one example.', expectedAnswer: 'Any declarative proposition.', maxPoints: 1 },
];

async function installMocks(page: Page, options: { invalidHandoff?: boolean; analyzeError?: boolean } = {}) {
  let grades: any[] = [];
  let created = false;
  let released = false;

  await page.route('**/functions/v1/quickcheck-handoff-redeem-v2', async route => {
    if (options.invalidHandoff) {
      return route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'Handoff expired or already used.' }) });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handoff) });
  });

  await page.route('**/auth/v1/token?grant_type=password', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'manual-bearer-token' }) });
  });

  await page.route('**/functions/v1/quickcheck-classroom-roster', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ classrooms: [{ id: 'class-1', name: 'CHN 3B', section_name: 'B', subject_code: 'CHN' }] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        classroom: { id: 'class-1', name: 'CHN 3B', section_name: 'B', subject_code: 'CHN' },
        students: [
          { userId: 'u-1', fullName: 'Maria Santos', studentNumber: '2026-001' },
          { userId: 'u-2', fullName: 'Juan Dela Cruz', studentNumber: '2026-002' },
        ],
        syncedAt: '2026-09-19T00:00:00.000Z',
      }),
    });
  });

  await page.route('**/functions/v1/quickcheck-process-v1', async route => {
    const body = route.request().postDataJSON() as any;
    if (body.action === 'health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, service: 'quickcheck-process-v1' }) });
    }
    if (body.action === 'rubric_extract') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ title: 'QA Rubric', rubricText: 'Each correct answer earns 1 point. Incorrect answers earn 0.' }),
      });
    }
    if (body.action === 'analyze') {
      if (options.analyzeError) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'AI temporarily unavailable in E2E fault injection.' }) });
      }
      const source = body.pages?.[0]?.name || 'imported.png';
      const poor = /poor/i.test(source);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pages: [{
          source,
          studentName: 'Import Student',
          studentId: 'IMP-001',
          pageNumber: 1,
          totalPages: 1,
          assessmentTitle: 'Imported Activity',
          assessmentKind: 'Activity',
          questions: [{ number: '1', question: 'Imported question', answer: 'Imported answer' }],
          questionSignature: 'imported q1',
          imageQuality: poor ? 'poor' : 'clear',
          needsRescan: poor,
          confidence: poor ? 0.35 : 0.99,
          flags: poor ? ['Blurred / unreadable test page'] : [],
        }] }),
      });
    }
    if (body.action === 'reconcile') {
      const incoming = Array.isArray(body.pages) ? body.pages : [];
      const isDemo = incoming.some((p: any) => p.studentName === 'Maria Santos');
      const reconciled = isDemo ? pages : incoming.map((p: any, i: number) => ({
        ...p,
        resolvedStudentName: p.studentName,
        resolvedStudentId: p.studentId,
        assessmentGroup: 'A1',
        assessmentTitle: p.assessmentTitle || 'Imported Activity',
        assessmentKind: p.assessmentKind || 'Activity',
        sequence: i + 1,
      }));
      const localAssess = isDemo ? assessments : [{
        id: 'A1', title: 'Imported Activity', kind: 'Activity',
        pageCount: reconciled.length, studentCount: 1, confidence: 0.99, flags: [],
      }];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages: reconciled, assessments: localAssess }) });
    }
    if (body.action === 'grade') {
      const nextGrades = [
        {
          assessmentId: 'A1', assessmentTitle: 'Logic Activity', assessmentKind: 'Activity',
          studentName: 'Maria Santos', studentId: '2026-001',
          score: 3, maxScore: 3, percent: 100, confidence: 0.97,
          feedback: 'Strong answers.', flags: [],
          items: [{ number: '1', correct: true, points: 1, maxPoints: 1, note: 'Correct' }],
        },
        {
          assessmentId: 'A1', assessmentTitle: 'Logic Activity', assessmentKind: 'Activity',
          studentName: 'Juan Dela Cruz', studentId: '2026-002',
          score: 1, maxScore: 2, percent: 50, confidence: 0.78,
          feedback: 'Review item 2.', flags: ['Item 2 needs teacher review'],
          items: [{ number: '2', correct: false, points: 0, maxPoints: 1, note: 'Command has no truth value' }],
        },
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ answerKey, grades: nextGrades, pages, assessments, rubricText: '', rubricSource: '' }),
      });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown test process action' }) });
  });

  await page.route('**/functions/v1/quickcheck-records-v1', async route => {
    const body = route.request().postDataJSON() as any;
    if (body.action === 'list_batches') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ batches: created ? [{
          id: 'batch-e2e', createdAt: '2026-09-19T00:00:00.000Z',
          status: released ? 'released' : 'suggested',
          pageCount: 3, assessmentCount: 1, studentCount: 2,
          flagCount: 1, approvedCount: grades.filter(g => g.approvalStatus === 'approved').length,
          reviewCount: grades.filter(g => g.reviewStatus === 'needs_review').length,
          criticalCount: 0,
        }] : [] }),
      });
    }
    if (body.action === 'create_batch') {
      created = true;
      grades = (body.grades || []).map((g: any, i: number) => ({
        ...g,
        gradeId: 'grade-' + (i + 1),
        reviewStatus: i === 0 ? 'looks_correct' : 'needs_review',
        approvalStatus: 'pending',
      }));
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ batchId: 'batch-e2e', createdAt: '2026-09-19T00:00:00.000Z', grades, assessments, persisted: true, status: 'suggested' }),
      });
    }
    if (body.action === 'update_grade') {
      grades = grades.map(g => g.gradeId === body.gradeId ? {
        ...g,
        score: Number(body.score),
        percent: Math.round(Number(body.score) / g.maxScore * 1000) / 10,
        feedback: body.feedback || g.feedback,
        reviewStatus: 'needs_review',
        approvalStatus: 'pending',
      } : g);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ grades, status: 'suggested' }) });
    }
    if (body.action === 'approval') {
      const now = '2026-09-19T00:01:00.000Z';
      if (body.approvalAction === 'approve_correct') {
        grades = grades.map(g => g.reviewStatus === 'looks_correct' ? { ...g, approvalStatus: 'approved', approvedAt: now } : g);
      } else if (body.approvalAction === 'approve_grade') {
        grades = grades.map(g => g.gradeId === body.gradeId ? { ...g, approvalStatus: 'approved', approvedAt: now } : g);
      } else if (body.approvalAction === 'approve_remaining') {
        grades = grades.map(g => ({ ...g, approvalStatus: 'approved', approvedAt: g.approvedAt || now }));
      } else if (body.approvalAction === 'release') {
        if (grades.some(g => g.approvalStatus !== 'approved')) {
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Grades remain pending teacher approval.' }) });
        }
        released = true;
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ grades, status: released ? 'released' : (grades.every(g => g.approvalStatus === 'approved') ? 'approved' : 'partially_approved') }),
      });
    }
    if (body.action === 'reprocess_batch') {
      if (released) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Released batch is immutable.' }) });
      }
      grades = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        batchId: 'batch-e2e',
        status: 'reprocessed',
        pages: body.pages || pages,
        assessments: body.assessments || assessments,
        rubricText: '',
        rubricSource: '',
        studentCount: 2,
        pageCount: 3,
        reprocessPersisted: true,
      }) });
    }
    if (body.action === 'get_batch') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'batch-e2e', status: released ? 'released' : 'suggested', pageCount: 3,
        assessments, pages, grades, answerKey, rubricText: '', rubricSource: '',
      }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown test records action' }) });
  });
}

test('Profile accessory handoff through review, override, approval and release', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');

  await expect(page).not.toHaveURL(/handoff=/);
  await expect(page.getByText(/opened securely from BUKLOD Profile/i)).toBeVisible();

  await page.getByRole('button', { name: 'Load Demo Data' }).click();
  await expect(page.getByText('END-TO-END BATCH REPORT')).toBeVisible();
  await expect(page.getByText(/2 unique student\(s\)/i)).toBeVisible();

  await page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true }).click();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toBeVisible();

  const reportSummary = page.locator('button').filter({ hasText: 'Overall grade summary' });
  await reportSummary.click();
  await expect(page.getByText('Report Inspector')).toBeVisible();

  await page.getByRole('button', { name: /looks correct.*pending/i }).first().click();
  await expect(page.getByText('Paper Review')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Paper review for Maria Santos/i })).toBeVisible();
  await page.getByRole('dialog', { name: /Paper review for Maria Santos/i }).getByRole('button', { name: /CLOSE/i }).click();

  await page.getByRole('button', { name: 'REVIEW FLAGS ONLY' }).click();
  const table = page.locator('table');
  await expect(table.getByText('Juan Dela Cruz')).toBeVisible();
  await expect(table.getByText('Maria Santos')).toHaveCount(0);

  const juanRow = table.locator('tr').filter({ hasText: 'Juan Dela Cruz' });
  await juanRow.getByRole('button', { name: /VIEW PAPER/i }).click();
  const juanDialog = page.getByRole('dialog', { name: /Paper review for Juan Dela Cruz/i });
  await expect(juanDialog).toBeVisible();
  await juanDialog.getByRole('button', { name: /EDIT GRADE/i }).click();

  await expect(page.getByText(/Teacher Override/i)).toBeVisible();
  await page.getByRole('spinbutton').fill('1.5');
  await page.getByRole('button', { name: 'SAVE TEACHER GRADE' }).click();

  await page.getByRole('button', { name: 'SHOW ALL GRADES' }).click();
  await page.getByRole('button', { name: 'APPROVE ALL CORRECT' }).click();

  const allTable = page.locator('table');
  const updatedJuan = allTable.locator('tr').filter({ hasText: 'Juan Dela Cruz' });
  await updatedJuan.getByRole('button', { name: 'APPROVE THIS' }).click();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'RELEASE ALL GRADES' }).click();
  await expect(page.getByRole('button', { name: /GRADES RELEASED/i })).toBeVisible();
});

test('local file and folder import paths process selected images', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');
  await expect(page.getByText(/opened securely from BUKLOD Profile/i)).toBeVisible();

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable in E2E fixture.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#111111';
    ctx.fillRect(12, 12, 72, 12);
    ctx.fillRect(12, 38, 58, 8);
    ctx.fillRect(12, 58, 64, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const png = Buffer.from(pngBase64, 'base64');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'SELECT FILES' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'paper.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText(/1\/1 file\(s\) accepted/i)).toBeVisible();
  await expect(page.getByText('END-TO-END BATCH REPORT')).toBeVisible();

  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  const folder = mkdtempSync(join(tmpdir(), 'quickcheck-e2e-folder-'));
  try {
    writeFileSync(join(folder, 'folder-paper.png'), png);
    const folderChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'SELECT FOLDER' }).click();
    const folderChooser = await folderChooserPromise;
    await folderChooser.setFiles(folder);
    await expect(page.getByText(/1\/1 file\(s\) accepted/i)).toBeVisible();
    await expect(page.getByText('END-TO-END BATCH REPORT')).toBeVisible();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('failed page retry button is reachable and never silently grades a poor page', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 96, 96);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'SELECT FILES' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'poor.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });

  await expect(page.getByRole('button', { name: 'RETRY FAILED' })).toBeVisible();
  await expect(page.getByText('END-TO-END BATCH REPORT')).toBeVisible();
  await expect(page.getByText(/0\/1 accepted pages/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'RETRY FAILED' }).click();
  await expect(page.getByRole('button', { name: 'RETRY FAILED' })).toBeVisible();
  await expect(page.getByText(/Batch finished with 1 blocked page/i)).toBeVisible();
  await expect(page.getByText(/Needs rescan: Blurred \/ unreadable test page/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true })).toBeDisabled();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toHaveCount(0);
});

test('AI processing outage retains the page safely and never creates grades', async ({ page }) => {
  await installMocks(page, { analyzeError: true });
  await page.goto('/?handoff=E2E-CODE');

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#111'; ctx.fillRect(12, 12, 72, 12);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'SELECT FILES' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'ai-outage.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });

  await expect(page.getByRole('button', { name: 'RETRY FAILED' })).toBeVisible();
  await expect(page.getByText(/Batch finished with 1 blocked page/i)).toBeVisible();
  await expect(page.getByText(/AI error: AI temporarily unavailable in E2E fault injection/i)).toBeVisible();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toHaveCount(0);
});

test('camera denial gives a recoverable file-import fallback without a white screen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Permission denied by E2E', 'NotAllowedError');
        },
      },
    });
  });
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');

  await page.getByRole('button', { name: 'START CONTINUOUS SCAN' }).click();
  await expect(page.getByText(/Camera could not start/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'SELECT FILES' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'SELECT FOLDER' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'QuickCheck', exact: true })).toBeVisible();
});

test('release and export stay locked before approval; released records stay immutable', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');
  await page.getByRole('button', { name: 'Load Demo Data' }).click();
  await page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true }).click();

  await expect(page.getByRole('button', { name: 'CSV' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'RELEASE ALL GRADES' })).toBeDisabled();

  await page.getByRole('button', { name: 'APPROVE ALL CORRECT' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'APPROVE REMAINING' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'RELEASE ALL GRADES' }).click();

  await expect(page.getByRole('button', { name: /GRADES RELEASED/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /EDIT GRADE/i }).first()).toBeDisabled();

  const history = page.locator('section').filter({ hasText: 'Batch Records / History' });
  await history.getByRole('button', { name: 'REPROCESS' }).click();
  await expect(page.getByText(/Reprocess failed: Released batch is immutable/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /GRADES RELEASED/i })).toBeVisible();
});

test('saved batch reprocess persists repaired grouping before release', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');
  await expect(page.getByText(/opened securely from BUKLOD Profile/i)).toBeVisible();

  await page.getByRole('button', { name: 'Load Demo Data' }).click();
  await page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true }).click();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toBeVisible();

  const historyCard = page.locator('section').filter({ hasText: 'Batch Records / History' });
  await expect(historyCard.getByRole('button', { name: 'REPROCESS' })).toBeVisible();
  await historyCard.getByRole('button', { name: 'REPROCESS' }).click();

  await expect(page.getByText(/Saved batch re-sorted/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true })).toBeVisible();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toHaveCount(0);
});

test('root, invalid handoff, manual BUKLOD connect, roster sync, disconnect and reload routes are recoverable', async ({ page }) => {
  await installMocks(page, { invalidHandoff: true });
  await page.goto('/?handoff=EXPIRED-CODE');

  await expect(page).not.toHaveURL(/handoff=/);
  await expect(page.getByText(/handoff expired or could not be used/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'QuickCheck', exact: true })).toBeVisible();

  await page.getByPlaceholder('BUKLOD email').fill('faculty@example.com');
  await page.getByPlaceholder('BUKLOD password').fill('password');
  await page.getByRole('button', { name: 'CONNECT BUKLOD' }).click();
  await expect(page.getByText(/1 faculty classroom\(s\) available/i)).toBeVisible();

  await page.getByRole('button', { name: 'SYNC ENROLLED STUDENTS' }).click();
  await expect(page.getByText(/2 enrolled students synced/i)).toBeVisible();

  await page.getByRole('button', { name: 'DISCONNECT' }).click();
  await expect(page.getByText(/disconnected.*standalone mode/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'CONNECT BUKLOD' })).toBeVisible();

  await page.unroute('**/functions/v1/quickcheck-handoff-redeem-v2');
  await page.route('**/functions/v1/quickcheck-handoff-redeem-v2', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handoff) });
  });
  await page.goto('/?handoff=RELOAD-CODE');
  await expect(page.getByText(/opened securely from BUKLOD Profile/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Connected securely from BUKLOD/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'DISCONNECT' })).toBeVisible();
});

test('rubric, report inspectors, assessment/student drilldowns and recheck buttons all open cleanly', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');
  await page.getByRole('button', { name: 'Load Demo Data' }).click();

  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#111'; ctx.fillRect(10, 10, 76, 12);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const rubricChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'SELECT RUBRIC FILE' }).click();
  const chooser = await rubricChooser;
  await chooser.setFiles({ name: 'rubric.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });
  await expect(page.getByText('✓ RUBRIC ON · rubric.png', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'CLEAR RUBRIC' }).click();
  await expect(page.getByText(/RUBRIC OFF/i)).toBeVisible();

  await page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true }).click();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toBeVisible();

  const closeInspector = async () => {
    await expect(page.getByText('Report Inspector')).toBeVisible();
    await page.getByRole('dialog').filter({ hasText: 'Report Inspector' }).getByRole('button', { name: /CLOSE/i }).click();
  };

  const topStatusPatterns = [/Scanned/i, /Processed/i, /Flags/i, /Released/i];
  for (const pattern of topStatusPatterns) {
    const button = page.locator('section.grid.md\\:grid-cols-4').getByRole('button').filter({ hasText: pattern }).first();
    await expect(button).toBeVisible();
    await button.click();
    await closeInspector();
  }

  const report = page.locator('section').filter({ hasText: 'END-TO-END BATCH REPORT' }).first();
  const reportPatterns = [
    /Captured .* View/i,
    /Processed .* View/i,
    /Assessments .* View/i,
    /Students .* View/i,
    /Failed .* View/i,
    /Graded .* View/i,
    /Scan & Quality/i,
    /Sorting & Identity/i,
    /Grade & Record/i,
    /Overall grade summary/i,
    /1 .* Scan/i,
    /2 .* Quality/i,
    /3 .* Check/i,
    /4 .* Approval/i,
  ];
  for (const pattern of reportPatterns) {
    const button = report.getByRole('button').filter({ hasText: pattern }).first();
    await expect(button).toBeVisible();
    await button.click();
    await closeInspector();
  }

  const assessmentButton = report.getByRole('button').filter({ hasText: /Logic Activity/ }).first();
  await assessmentButton.click();
  await expect(page.getByText('Report Inspector')).toBeVisible();
  await page.getByRole('dialog').filter({ hasText: 'Report Inspector' }).getByRole('button', { name: /CLOSE/i }).click();

  const mariaRecord = page.getByRole('button').filter({ hasText: /Maria Santos/ }).first();
  await mariaRecord.click();
  await expect(page.getByText(/Paper Review|Student record detail/)).toBeVisible();
  const close = page.getByRole('button', { name: /CLOSE/i }).first();
  await close.click();

  await page.getByRole('button', { name: 'RE-SORT & RECHECK', exact: true }).click();
  await expect(page.getByText('3. Suggested Grades & Teacher Review')).toBeVisible();
});

test('approve remaining, CSV, BUKLOD sync package, open record and sync toggle buttons work', async ({ page }) => {
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');
  await page.getByRole('button', { name: 'Load Demo Data' }).click();
  await page.getByRole('button', { name: 'AUTO-SORT & SUGGEST GRADES', exact: true }).click();

  await page.getByRole('button', { name: 'APPROVE ALL CORRECT' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'APPROVE REMAINING' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'RELEASE ALL GRADES' }).click();
  await expect(page.getByRole('button', { name: /GRADES RELEASED/i })).toBeVisible();

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await csvDownload).suggestedFilename()).toContain('quickcheck-grades');

  await page.getByRole('button', { name: 'SYNC TO BUKLOD CLASSROOM' }).click();
  await page.getByPlaceholder('e.g. CHN 3B').fill('CHN 3B');
  await page.getByPlaceholder('e.g. Quiz 3').fill('Logic Activity');
  const syncDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PREPARE BUKLOD SYNC PACKAGE' }).click();
  expect((await syncDownload).suggestedFilename()).toContain('quickcheck-buklod-sync');
  await page.getByRole('button', { name: 'CLOSE SYNC' }).click();

  const history = page.locator('section').filter({ hasText: 'Batch Records / History' });
  await history.getByRole('button', { name: 'OPEN RECORD' }).click();
  await expect(page.getByText(/Saved Batch Record loaded/i)).toBeVisible();
});

test('camera path opens and can finish without a white screen', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await installMocks(page);
  await page.goto('/?handoff=E2E-CODE');

  await page.getByRole('button', { name: 'START CONTINUOUS SCAN' }).click();
  await expect(page.getByRole('button', { name: 'FINISH BATCH' })).toBeVisible();
  await page.getByRole('button', { name: 'FINISH BATCH' }).click();
  await expect(page.getByRole('heading', { name: 'QuickCheck', exact: true })).toBeVisible();
});
