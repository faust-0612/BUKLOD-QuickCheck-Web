create extension if not exists pgcrypto;

create table if not exists public.quickcheck_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  classroom_id uuid,
  classroom_name text,
  status text not null default 'suggested',
  page_count integer not null default 0,
  assessment_count integer not null default 0,
  unique_student_count integer not null default 0,
  flag_count integer not null default 0,
  approved_count integer not null default 0,
  review_count integer not null default 0,
  critical_count integer not null default 0,
  rubric_text text not null default '',
  rubric_source text not null default '',
  answer_key jsonb not null default '[]'::jsonb,
  assessments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.quickcheck_question_sets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  classroom_id uuid,
  fingerprint text not null,
  canonical_title text not null,
  assessment_kind text not null default 'Other',
  normalized_questions jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  use_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists quickcheck_question_sets_owner_scope_fp_uidx on public.quickcheck_question_sets(owner_user_id, coalesce(classroom_id,'00000000-0000-0000-0000-000000000000'::uuid), fingerprint);

create table if not exists public.quickcheck_pages (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.quickcheck_batches(id) on delete cascade,
  owner_user_id uuid not null,
  source text not null,
  explicit_student_name text,
  explicit_student_id text,
  resolved_student_name text,
  resolved_student_id text,
  roster_user_id uuid,
  roster_match_status text,
  roster_match_confidence numeric,
  assessment_key text,
  question_set_id uuid references public.quickcheck_question_sets(id),
  question_fingerprint text,
  assessment_title text,
  assessment_kind text,
  page_number integer,
  total_pages integer,
  sequence integer,
  confidence numeric not null default 0,
  image_quality text,
  needs_rescan boolean not null default false,
  questions jsonb not null default '[]'::jsonb,
  question_signature text,
  handwriting_profile text,
  flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quickcheck_pages_batch_idx on public.quickcheck_pages(batch_id);
create index if not exists quickcheck_pages_owner_idx on public.quickcheck_pages(owner_user_id, batch_id);
create index if not exists quickcheck_pages_qset_idx on public.quickcheck_pages(question_set_id);

create table if not exists public.quickcheck_grades (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.quickcheck_batches(id) on delete cascade,
  owner_user_id uuid not null,
  assessment_key text,
  question_set_id uuid references public.quickcheck_question_sets(id),
  student_identity_key text not null,
  student_name text not null,
  student_id text,
  score numeric not null default 0,
  max_score numeric not null default 0,
  percent numeric not null default 0,
  confidence numeric not null default 0,
  feedback text not null default '',
  flags jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  review_status text not null default 'needs_review',
  approval_status text not null default 'pending',
  approved_at timestamptz,
  teacher_adjusted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists quickcheck_grades_batch_idx on public.quickcheck_grades(batch_id);
create index if not exists quickcheck_grades_owner_idx on public.quickcheck_grades(owner_user_id, batch_id);

create table if not exists public.quickcheck_faculty_handoffs (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null,
  classroom_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.quickcheck_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null,
  classroom_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists quickcheck_sessions_active_idx on public.quickcheck_sessions(token_hash, expires_at) where revoked_at is null;

alter table public.quickcheck_batches enable row level security;
alter table public.quickcheck_question_sets enable row level security;
alter table public.quickcheck_pages enable row level security;
alter table public.quickcheck_grades enable row level security;
alter table public.quickcheck_faculty_handoffs enable row level security;
alter table public.quickcheck_sessions enable row level security;

comment on table public.quickcheck_pages is 'Structured QuickCheck extraction only. Original PDF/DOCX/image source files are intentionally not persisted.';
comment on table public.quickcheck_question_sets is 'Canonical assessment identity is based on unity of normalized questions/instructions, not display title.';
