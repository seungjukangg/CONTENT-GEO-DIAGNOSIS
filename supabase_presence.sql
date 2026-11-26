-- 존재감 진단 이력 테이블 (이미 offsite_projects·offsite_runs를 만든 경우 이것만 실행)
create table if not exists offsite_presence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references offsite_projects(id) on delete cascade,
  measured_at timestamptz not null default now(),
  result jsonb not null
);
create index if not exists offsite_presence_project_idx on offsite_presence (project_id, measured_at desc);
alter table offsite_presence enable row level security;
