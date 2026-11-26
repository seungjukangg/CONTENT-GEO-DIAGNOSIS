/**
 * 오프사이트 GEO 저장소 (서버 전용)
 * - AI Studio Secrets에 SUPABASE_URL, SUPABASE_SECRET_KEY가 있으면 Supabase에 저장
 * - 없으면 서버 메모리에 임시 저장 (서버 재시작 시 삭제됨)
 * - Supabase 키는 서버에서만 사용하고 화면(브라우저)으로 보내지 않음
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { extractCitations, normDomain, OffsiteProject, OffsiteRun, Competitor, Category, CATEGORIES } from './src/offsite';
import type { PresenceResult } from './src/presenceTypes';

export type ProjectInput = Omit<OffsiteProject, 'id' | 'createdAt'> & { id?: string };
export type RunInput = { engine: string; prompt: string; answer: string; sources: string };

interface Store {
  kind: 'supabase' | 'memory';
  listProjects(): Promise<OffsiteProject[]>;
  saveProject(p: ProjectInput): Promise<OffsiteProject>;
  deleteProject(id: string): Promise<void>;
  listRuns(projectId: string): Promise<OffsiteRun[]>;
  addRun(projectId: string, r: RunInput): Promise<OffsiteRun>;
  deleteRun(id: string): Promise<void>;
  listPresence(projectId: string): Promise<PresenceResult[]>;
  addPresence(r: PresenceResult): Promise<PresenceResult>;
}

/* ---------- 입력값 정리 ---------- */
const strList = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);

export function cleanProject(b: Record<string, unknown>): ProjectInput {
  const name = String(b.name ?? '').trim().slice(0, 80);
  const brand = String(b.brand ?? '').trim().slice(0, 80);
  if (!name || !brand) throw new Error('프로젝트 이름과 브랜드명은 필수입니다.');
  const labels: Record<string, Category> = {};
  Object.entries((b.domainLabels as Record<string, string>) ?? {}).forEach(([d, c]) => {
    if (CATEGORIES.includes(c as Category)) labels[normDomain(d)] = c as Category;
  });
  return {
    id: typeof b.id === 'string' ? b.id : undefined,
    name, brand,
    brandAliases: strList(b.brandAliases),
    ownedDomains: strList(b.ownedDomains).map(normDomain),
    competitors: (Array.isArray(b.competitors) ? b.competitors : []).slice(0, 10).map((c: Competitor) => ({
      name: String(c?.name ?? '').trim().slice(0, 80),
      aliases: strList(c?.aliases),
      domains: strList(c?.domains).map(normDomain),
    })).filter((c: Competitor) => c.name),
    domainLabels: labels,
  };
}

export function cleanRun(b: Record<string, unknown>): RunInput {
  const r = {
    engine: String(b.engine ?? '').trim().slice(0, 40) || '기타',
    prompt: String(b.prompt ?? '').trim().slice(0, 1000),
    answer: String(b.answer ?? '').slice(0, 60_000),
    sources: String(b.sources ?? '').slice(0, 20_000),
  };
  if (!r.prompt) throw new Error('소비자 프롬프트를 입력하세요.');
  if (!r.answer.trim()) throw new Error('AI 답변을 붙여 넣으세요.');
  return r;
}

/* ---------- 메모리 저장소 ---------- */
function memoryStore(): Store {
  const projects: OffsiteProject[] = [];
  const runs: OffsiteRun[] = [];
  const presence: PresenceResult[] = [];
  return {
    kind: 'memory',
    async listPresence(projectId) { return presence.filter((x) => x.projectId === projectId).slice(-20).reverse(); },
    async addPresence(r) { const saved = { ...r, id: randomUUID() }; presence.push(saved); return saved; },
    async listProjects() { return [...projects]; },
    async saveProject(p) {
      const i = p.id ? projects.findIndex((x) => x.id === p.id) : -1;
      const saved: OffsiteProject = { ...p, id: i >= 0 ? projects[i].id : randomUUID(), createdAt: i >= 0 ? projects[i].createdAt : new Date().toISOString() };
      if (i >= 0) projects[i] = saved; else projects.push(saved);
      return saved;
    },
    async deleteProject(id) {
      const i = projects.findIndex((x) => x.id === id);
      if (i >= 0) projects.splice(i, 1);
      for (let j = runs.length - 1; j >= 0; j--) if (runs[j].projectId === id) runs.splice(j, 1);
      for (let j = presence.length - 1; j >= 0; j--) if (presence[j].projectId === id) presence.splice(j, 1);
    },
    async listRuns(projectId) { return runs.filter((r) => r.projectId === projectId); },
    async addRun(projectId, r) {
      if (!projects.some((p) => p.id === projectId)) throw new Error('프로젝트를 찾을 수 없습니다.');
      const run: OffsiteRun = { ...r, id: randomUUID(), projectId, measuredAt: new Date().toISOString(), citations: extractCitations(r.answer, r.sources) };
      runs.push(run);
      return run;
    },
    async deleteRun(id) { const i = runs.findIndex((x) => x.id === id); if (i >= 0) runs.splice(i, 1); },
  };
}

/* ---------- Supabase 저장소 ---------- */
type ProjectRow = { id: string; created_at: string; name: string; brand: string; brand_aliases: string[]; owned_domains: string[]; competitors: Competitor[]; domain_labels: Record<string, Category> };
type RunRow = { id: string; project_id: string; measured_at: string; engine: string; prompt: string; answer: string; sources: string; citations: OffsiteRun['citations'] };

const toProject = (r: ProjectRow): OffsiteProject => ({
  id: r.id, createdAt: r.created_at, name: r.name, brand: r.brand, brandAliases: r.brand_aliases ?? [],
  ownedDomains: r.owned_domains ?? [], competitors: r.competitors ?? [], domainLabels: r.domain_labels ?? {},
});
const toRun = (r: RunRow): OffsiteRun => ({
  id: r.id, projectId: r.project_id, measuredAt: r.measured_at, engine: r.engine, prompt: r.prompt,
  answer: r.answer, sources: r.sources ?? '', citations: r.citations ?? [],
});

function supabaseStore(sb: SupabaseClient): Store {
  const check = <T>(res: { data: T; error: { message: string } | null }) => {
    if (res.error) throw new Error(`Supabase 오류: ${res.error.message}`);
    return res.data;
  };
  return {
    kind: 'supabase',
    async listPresence(projectId) {
      const rows = check(await sb.from('offsite_presence').select('*').eq('project_id', projectId).order('measured_at', { ascending: false }).limit(20)) as { id: string; result: PresenceResult }[];
      return rows.map((r) => ({ ...r.result, id: r.id }));
    },
    async addPresence(r) {
      const row = check(await sb.from('offsite_presence').insert({ project_id: r.projectId, measured_at: r.measuredAt, result: r }).select().single()) as { id: string };
      return { ...r, id: row.id };
    },
    async listProjects() {
      return (check(await sb.from('offsite_projects').select('*').order('created_at')) as ProjectRow[]).map(toProject);
    },
    async saveProject(p) {
      const row = { name: p.name, brand: p.brand, brand_aliases: p.brandAliases, owned_domains: p.ownedDomains, competitors: p.competitors, domain_labels: p.domainLabels };
      const res = p.id
        ? await sb.from('offsite_projects').update(row).eq('id', p.id).select().single()
        : await sb.from('offsite_projects').insert(row).select().single();
      return toProject(check(res) as ProjectRow);
    },
    async deleteProject(id) { check(await sb.from('offsite_projects').delete().eq('id', id)); },
    async listRuns(projectId) {
      return (check(await sb.from('offsite_runs').select('*').eq('project_id', projectId).order('measured_at')) as RunRow[]).map(toRun);
    },
    async addRun(projectId, r) {
      const row = { project_id: projectId, engine: r.engine, prompt: r.prompt, answer: r.answer, sources: r.sources, citations: extractCitations(r.answer, r.sources) };
      return toRun(check(await sb.from('offsite_runs').insert(row).select().single()) as RunRow);
    },
    async deleteRun(id) { check(await sb.from('offsite_runs').delete().eq('id', id)); },
  };
}

export function createStore(): Store {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    console.log('오프사이트 저장소: Supabase');
    return supabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  }
  console.log('오프사이트 저장소: 메모리 (SUPABASE_URL / SUPABASE_SECRET_KEY 미설정)');
  return memoryStore();
}
