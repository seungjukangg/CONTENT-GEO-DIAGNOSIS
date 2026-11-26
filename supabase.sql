-- 오프사이트 GEO용 테이블 (Supabase > SQL Editor에 붙여 넣고 Run)
create table if not exists offsite_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  brand text not null,
  brand_aliases text[] not null default '{}',
  owned_domains text[] not null default '{}',
  competitors jsonb not null default '[]',
  domain_labels jsonb not null default '{}'
);

create table if not exists offsite_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references offsite_projects(id) on delete cascade,
  measured_at timestamptz not null default now(),
  engine text not null,
  prompt text not null,
  answer text not null,
  sources text not null default '',
  citations jsonb not null default '[]'
);

create index if not exists offsite_runs_project_idx on offsite_runs (project_id, measured_at);

-- 보안: 외부(브라우저)에서 직접 접근 차단. 서버의 secret 키로만 읽고 씀
alter table offsite_projects enable row level security;
alter table offsite_runs enable row level security;
