import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe, Plus, Trash2, Loader2, Save, Settings2, Database, Download, Target, BarChart3, ListChecks, AlertTriangle, Info, X,
} from 'lucide-react';
import {
  analyze, CATEGORIES, CATEGORY_ACTION, Category, Competitor, ENGINES, OffsiteProject, OffsiteRun, pct, Rate, splitList,
} from './offsite';

const input = 'w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF9F0A]';
const EXTERNAL: Category[] = ['언론(Earned)', '리뷰·판매(Third-party)', '커뮤니티·영상(UGC)', '위키(지식베이스)', '미분류'];
const CAT_COLOR: Record<Category, string> = {
  '자사(Owned)': '#FF9F0A', '경쟁사(Owned)': '#f43f5e', '언론(Earned)': '#38bdf8', '리뷰·판매(Third-party)': '#a78bfa',
  '커뮤니티·영상(UGC)': '#34d399', '위키(지식베이스)': '#facc15', '미분류': '#666',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '요청 실패');
  return data as T;
}

function Card({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-[#161616] border border-[#262626] rounded-xl p-5 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[#FF9F0A] text-sm font-bold flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function RateBar({ r, color = '#FF9F0A' }: { r: Rate; color?: string }) {
  return (
    <div className="relative h-2 bg-[#2A2A2A] rounded">
      <div className="absolute h-2 rounded" style={{ width: `${r.p * 100}%`, background: color }} />
      <div className="absolute top-[-3px] h-[14px] border-x border-white/50" style={{ left: `${r.lo * 100}%`, width: `${(r.hi - r.lo) * 100}%` }} />
    </div>
  );
}
const ci = (r: Rate) => `${pct(r.p)} (95% CI ${pct(r.lo)}~${pct(r.hi)}, ${r.k}/${r.n})`;

/* ---------------- 프로젝트 설정 ---------------- */

type Draft = { id?: string; name: string; brand: string; brandAliases: string; ownedDomains: string; competitors: { name: string; aliases: string; domains: string }[]; domainLabels: Record<string, Category> };
const toDraft = (p?: OffsiteProject): Draft => p ? {
  id: p.id, name: p.name, brand: p.brand, brandAliases: p.brandAliases.join(', '), ownedDomains: p.ownedDomains.join(', '),
  competitors: p.competitors.map((c) => ({ name: c.name, aliases: c.aliases.join(', '), domains: c.domains.join(', ') })), domainLabels: p.domainLabels,
} : { name: '', brand: '', brandAliases: '', ownedDomains: '', competitors: [{ name: '', aliases: '', domains: '' }], domainLabels: {} };
const fromDraft = (d: Draft) => ({
  id: d.id, name: d.name, brand: d.brand, brandAliases: splitList(d.brandAliases), ownedDomains: splitList(d.ownedDomains),
  competitors: d.competitors.filter((c) => c.name.trim()).map((c): Competitor => ({ name: c.name.trim(), aliases: splitList(c.aliases), domains: splitList(c.domains) })),
  domainLabels: d.domainLabels,
});

function ProjectForm({ initial, onSaved, onCancel }: { initial?: OffsiteProject; onSaved: (p: OffsiteProject) => void; onCancel?: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setComp = (i: number, k: 'name' | 'aliases' | 'domains', v: string) =>
    setD({ ...d, competitors: d.competitors.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });

  async function save() {
    setBusy(true); setErr('');
    try { onSaved(await api<OffsiteProject>('/api/offsite/projects', { method: 'POST', body: JSON.stringify(fromDraft(d)) })); }
    catch (e) { setErr(e instanceof Error ? e.message : '저장 실패'); }
    finally { setBusy(false); }
  }

  return (
    <Card title={initial ? '프로젝트 설정 수정' : '새 프로젝트'} icon={<Settings2 size={16} />} right={onCancel && <button onClick={onCancel} className="text-[#888] hover:text-white"><X size={16} /></button>}>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs text-[#aaa] space-y-1"><span>프로젝트 이름 *</span><input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
        <label className="text-xs text-[#aaa] space-y-1"><span>브랜드명 *</span><input className={input} value={d.brand} onChange={(e) => setD({ ...d, brand: e.target.value })} /></label>
        <label className="text-xs text-[#aaa] space-y-1"><span>브랜드 다른 표기 (쉼표 구분)</span><input className={input} value={d.brandAliases} onChange={(e) => setD({ ...d, brandAliases: e.target.value })} /></label>
        <label className="text-xs text-[#aaa] space-y-1"><span>자사 도메인 (쉼표 구분)</span><input className={input} value={d.ownedDomains} onChange={(e) => setD({ ...d, ownedDomains: e.target.value })} /></label>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-[#aaa]">경쟁사 (최대 10개)</div>
        {d.competitors.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <input className={input} placeholder="경쟁사명" value={c.name} onChange={(e) => setComp(i, 'name', e.target.value)} />
            <input className={input} placeholder="다른 표기 (쉼표)" value={c.aliases} onChange={(e) => setComp(i, 'aliases', e.target.value)} />
            <input className={input} placeholder="도메인 (쉼표)" value={c.domains} onChange={(e) => setComp(i, 'domains', e.target.value)} />
            <button onClick={() => setD({ ...d, competitors: d.competitors.filter((_, j) => j !== i) })} className="text-[#666] hover:text-rose-400 px-1"><Trash2 size={14} /></button>
          </div>
        ))}
        {d.competitors.length < 10 && (
          <button onClick={() => setD({ ...d, competitors: [...d.competitors, { name: '', aliases: '', domains: '' }] })} className="text-xs text-[#FF9F0A] flex items-center gap-1"><Plus size={12} /> 경쟁사 추가</button>
        )}
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-[#FF9F0A] text-black font-bold text-sm disabled:opacity-40 flex items-center gap-2">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 저장
      </button>
    </Card>
  );
}

/* ---------------- 메인 ---------------- */

export default function OffsiteDiagnosis() {
  const [db, setDb] = useState<'supabase' | 'memory' | null>(null);
  const [projects, setProjects] = useState<OffsiteProject[]>([]);
  const [pid, setPid] = useState<string>('');
  const [runs, setRuns] = useState<OffsiteRun[]>([]);
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null);
  const [err, setErr] = useState('');

  const [engine, setEngine] = useState<string>('ChatGPT');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState('');

  const project = projects.find((p) => p.id === pid);
  const a = useMemo(() => (project ? analyze(project, runs) : null), [project, runs]);

  useEffect(() => {
    api<{ db: 'supabase' | 'memory' }>('/api/offsite/status').then((s) => setDb(s.db)).catch(() => setDb(null));
    api<OffsiteProject[]>('/api/offsite/projects').then((ps) => {
      setProjects(ps);
      if (ps.length) setPid(ps[ps.length - 1].id); else setEditing('new');
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!pid) { setRuns([]); return; }
    api<OffsiteRun[]>(`/api/offsite/projects/${pid}/runs`).then(setRuns).catch((e) => setErr(e.message));
  }, [pid]);

  function onProjectSaved(p: OffsiteProject) {
    setProjects((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]));
    setPid(p.id); setEditing(null);
  }

  async function deleteProject() {
    if (!project || !confirm(`"${project.name}" 프로젝트와 측정 기록 ${runs.length}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await api(`/api/offsite/projects/${project.id}`, { method: 'DELETE' });
    const rest = projects.filter((p) => p.id !== project.id);
    setProjects(rest); setPid(rest.length ? rest[rest.length - 1].id : '');
    if (!rest.length) setEditing('new');
  }

  async function addRun(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSaving(true); setErr('');
    try {
      const run = await api<OffsiteRun>(`/api/offsite/projects/${project.id}/runs`, { method: 'POST', body: JSON.stringify({ engine, prompt, answer, sources }) });
      setRuns((rs) => [...rs, run]);
      setAnswer(''); setSources('');
      setLastSaved(`저장됨 · 출처 ${run.citations.length}개 추출`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRun(id: string) {
    if (!confirm('이 측정 기록을 삭제할까요?')) return;
    await api(`/api/offsite/runs/${id}`, { method: 'DELETE' });
    setRuns((rs) => rs.filter((r) => r.id !== id));
  }

  async function setLabel(domain: string, category: Category) {
    if (!project) return;
    const saved = await api<OffsiteProject>('/api/offsite/projects', {
      method: 'POST', body: JSON.stringify({ ...project, domainLabels: { ...project.domainLabels, [domain]: category } }),
    });
    onProjectSaved(saved);
  }

  function downloadCsv() {
    if (!project) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [['측정일시', '엔진', '프롬프트', '출처 수', '출처 URL', '답변'].map(esc).join(',')];
    runs.forEach((r) => rows.push([r.measuredAt, r.engine, r.prompt, String(r.citations.length), r.citations.map((c) => c.url).join(' '), r.answer].map(esc).join(',')));
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}_오프사이트측정.csv`;
    link.click();
  }

  const prevPrompts = [...new Set(runs.map((r) => r.prompt))];
  const priority = a ? a.topDomains.filter((d) => EXTERNAL.includes(d.category) && d.category !== '미분류').slice(0, 6) : [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white">오프사이트 GEO</h1>
            <span className="text-xs font-medium text-[#FF9F0A] bg-[#FF9F0A]/15 px-2.5 py-0.5 rounded-full">AI 인용 출처 분석</span>
          </div>
          <p className="text-sm text-[#888]">소비자 프롬프트에 대한 AI 답변을 쌓아 어떤 외부 사이트가 인용되는지 집계하고, 공략할 출처와 활용 방법을 제시함</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 ${db === 'supabase' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <Database size={12} /> {db === 'supabase' ? 'Supabase 저장 중' : db === 'memory' ? '임시 저장 (서버 재시작 시 삭제)' : '저장소 확인 중'}
        </span>
      </div>

      {/* 프로젝트 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${input} w-auto min-w-[220px]`} value={pid} onChange={(e) => { setPid(e.target.value); setEditing(null); }}>
          {!projects.length && <option value="">프로젝트 없음</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.brand}</option>)}
        </select>
        <button onClick={() => setEditing('new')} className="text-sm px-3 py-2 rounded-lg border border-[#2A2A2A] hover:border-[#FF9F0A] flex items-center gap-1"><Plus size={14} /> 새 프로젝트</button>
        {project && <button onClick={() => setEditing('edit')} className="text-sm px-3 py-2 rounded-lg border border-[#2A2A2A] hover:border-[#FF9F0A] flex items-center gap-1"><Settings2 size={14} /> 설정</button>}
        {project && <button onClick={deleteProject} className="text-sm px-3 py-2 rounded-lg border border-[#2A2A2A] hover:border-rose-400 text-[#888] flex items-center gap-1"><Trash2 size={14} /> 삭제</button>}
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}

      {editing && (
        <ProjectForm key={editing + pid} initial={editing === 'edit' ? project : undefined} onSaved={onProjectSaved} onCancel={projects.length ? () => setEditing(null) : undefined} />
      )}

      {project && !editing && (
        <div className="grid xl:grid-cols-[380px_1fr] gap-6">
          {/* 측정 입력 */}
          <aside className="space-y-4 xl:sticky xl:top-6 self-start">
            <Card title="AI 답변 측정 추가" icon={<Plus size={16} />}>
              <form onSubmit={addRun} className="space-y-3">
                <label className="block text-xs text-[#aaa] space-y-1"><span>AI 엔진</span>
                  <select className={input} value={engine} onChange={(e) => setEngine(e.target.value)}>{ENGINES.map((e2) => <option key={e2}>{e2}</option>)}</select>
                </label>
                <label className="block text-xs text-[#aaa] space-y-1"><span>소비자 프롬프트</span>
                  <input className={input} list="prev-prompts" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                  <datalist id="prev-prompts">{prevPrompts.map((p) => <option key={p} value={p} />)}</datalist>
                </label>
                <label className="block text-xs text-[#aaa] space-y-1"><span>AI 답변 전체 (복사 버튼으로 복사해 붙여넣기)</span>
                  <textarea className={`${input} h-40`} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                </label>
                <label className="block text-xs text-[#aaa] space-y-1"><span>출처 목록 (답변 복사본에 링크가 없을 때만)</span>
                  <textarea className={`${input} h-20`} placeholder="출처 링크를 줄바꿈으로 붙여넣기" value={sources} onChange={(e) => setSources(e.target.value)} />
                </label>
                <button disabled={saving || !prompt.trim() || !answer.trim()} className="w-full py-2.5 rounded-lg bg-[#FF9F0A] text-black font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 측정 저장
                </button>
                {lastSaved && <p className="text-xs text-emerald-400">{lastSaved}</p>}
              </form>
              <div className="text-[11px] text-[#777] space-y-1 border-t border-[#262626] pt-3">
                <p>· 측정마다 새 채팅(또는 시크릿 창)에서 프롬프트 입력 → 답변 복사 → 붙여넣기</p>
                <p>· 같은 프롬프트를 엔진별로 3회 이상 반복 측정 권장. 반복 측정 시 인용 출처가 바뀌는 비율이 ChatGPT 78.8%, Gemini 54.9% (팀 점검표)</p>
                <p>· 브랜드 언급은 답변에 브랜드명·다른 표기가 들어 있는지로 판정함</p>
              </div>
            </Card>
          </aside>

          {/* 대시보드 */}
          <main className="space-y-6 min-w-0">
            {!a || a.n === 0 ? (
              <Card title="측정 결과" icon={<BarChart3 size={16} />}><p className="text-sm text-[#888]">왼쪽에서 AI 답변을 1건 이상 저장하면 결과가 표시됨</p></Card>
            ) : (
              <>
                {/* KPI */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-[#161616] border border-[#262626] rounded-xl p-4"><div className="text-xs text-[#888]">측정 수</div><div className="text-2xl font-bold">{a.n}회</div><div className="text-xs text-[#666]">프롬프트 {a.promptCount}개 · 엔진 {a.engines.length}개 · 출처 {a.totalCitations}개</div></div>
                  <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 space-y-2"><div className="text-xs text-[#888]">브랜드 언급률</div><div className="text-2xl font-bold">{pct(a.brand.p)}</div><RateBar r={a.brand} /><div className="text-[11px] text-[#666]">95% CI {pct(a.brand.lo)}~{pct(a.brand.hi)}</div></div>
                  <div className="bg-[#161616] border border-[#262626] rounded-xl p-4 space-y-2"><div className="text-xs text-[#888]">자사 사이트 인용률</div><div className="text-2xl font-bold">{pct(a.owned.p)}</div><RateBar r={a.owned} /><div className="text-[11px] text-[#666]">95% CI {pct(a.owned.lo)}~{pct(a.owned.hi)}</div></div>
                  <div className="bg-[#161616] border border-[#262626] rounded-xl p-4"><div className="text-xs text-[#888]">출처 중 영상 비중</div><div className="text-2xl font-bold">{a.totalCitations ? pct(a.media.video / a.totalCitations) : '-'}</div><div className="text-xs text-[#666]">영상 {a.media.video} · 텍스트 {a.media.text}</div></div>
                </div>

                {/* 진단 */}
                <Card title="진단 결과" icon={<AlertTriangle size={16} />}>
                  {a.findings.length === 0 ? <p className="text-sm text-[#888]">특이 사항 없음</p> : a.findings.map((f, i) => (
                    <div key={i} className={`flex gap-2 text-sm rounded-lg p-3 ${f.level === 'high' ? 'bg-rose-500/10 text-rose-200' : f.level === 'mid' ? 'bg-amber-500/10 text-amber-200' : 'bg-[#0F0F0F] text-[#aaa]'}`}>
                      {f.level === 'info' ? <Info size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                      <span><b>[{f.area}]</b> {f.text}</span>
                    </div>
                  ))}
                </Card>

                {/* 공략 우선순위 */}
                <Card title="공략 우선순위 도메인 — 외부 출처" icon={<Target size={16} />}>
                  {priority.length === 0 ? <p className="text-sm text-[#888]">분류된 외부 출처 없음</p> : (
                    <div className="space-y-3">
                      {priority.map((d, i) => (
                        <div key={d.domain} className="flex gap-3 text-sm">
                          <span className="text-[#FF9F0A] font-mono w-5 shrink-0">{i + 1}</span>
                          <div className="min-w-0">
                            <div><span className="font-medium">{d.domain}</span> <span className="text-xs" style={{ color: CAT_COLOR[d.category] }}>{d.category}</span> <span className="text-xs text-[#888]">· 답변 {d.runs}/{a.n}회 인용 ({pct(d.runRate)}) · {d.engines.join(', ')}{d.gap ? ` · 경쟁사만 언급된 답변 ${d.gap}회` : ''}</span></div>
                            <div className="text-xs text-emerald-400">→ {CATEGORY_ACTION[d.category]}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[#666]">"경쟁사만 언급된 답변" = 경쟁사는 언급되고 자사는 언급되지 않은 답변에서 이 도메인이 인용된 횟수 (추정 지표)</p>
                </Card>

                {/* 경쟁 비교 */}
                <Card title="브랜드 언급률 비교" icon={<BarChart3 size={16} />}>
                  <div className="space-y-3">
                    {[{ name: `${project.brand} (자사)`, rate: a.brand, color: '#FF9F0A' }, ...a.competitors.map((c) => ({ name: c.name, rate: c.rate, color: '#f43f5e' }))].map((x) => (
                      <div key={x.name} className="space-y-1">
                        <div className="flex justify-between text-sm"><span>{x.name}</span><span className="text-xs text-[#888]">{ci(x.rate)}</span></div>
                        <RateBar r={x.rate} color={x.color} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#666]">흰색 구간은 95% 신뢰구간. 구간이 겹치면 차이가 있다고 단정하기 어려움</p>
                </Card>

                {/* 출처 유형 + 엔진 */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card title="출처 유형 분포">
                    <div className="flex h-3 rounded overflow-hidden">{a.categories.map((c) => <div key={c.category} style={{ width: `${c.share * 100}%`, background: CAT_COLOR[c.category] }} title={c.category} />)}</div>
                    <div className="space-y-1.5">
                      {a.categories.map((c) => (
                        <div key={c.category} className="flex justify-between text-sm">
                          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLOR[c.category] }} />{c.category}</span>
                          <span className="text-[#aaa]">{c.count}개 · {pct(c.share)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card title="엔진별">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5">엔진</th><th>측정</th><th>브랜드 언급</th><th>자사 인용</th><th>영상 출처</th></tr></thead>
                      <tbody>{a.engines.map((e) => (
                        <tr key={e.engine} className="border-b border-[#1F1F1F]"><td className="py-1.5">{e.engine}</td><td>{e.n}</td><td>{pct(e.brand.p)}</td><td>{pct(e.owned.p)}</td><td>{e.citations ? pct(e.video) : '-'}</td></tr>
                      ))}</tbody>
                    </table>
                  </Card>
                </div>

                {/* 도메인 표 */}
                <Card title={`인용 도메인 전체 (${a.topDomains.length}개)`} icon={<Globe size={16} />}>
                  <div className="overflow-x-auto max-h-[420px]">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">도메인</th><th className="pr-2">유형 (변경 가능)</th><th className="pr-2">형식</th><th className="pr-2">인용 답변</th><th>엔진</th></tr></thead>
                      <tbody>{a.topDomains.map((d) => (
                        <tr key={d.domain} className="border-b border-[#1F1F1F]">
                          <td className="py-1.5 pr-2 break-all">{d.domain}</td>
                          <td className="pr-2">
                            {d.category === '자사(Owned)' || d.category === '경쟁사(Owned)' ? <span className="text-xs" style={{ color: CAT_COLOR[d.category] }}>{d.category}</span> : (
                              <select className="bg-transparent text-xs border border-[#2A2A2A] rounded px-1 py-0.5" style={{ color: CAT_COLOR[d.category] }} value={d.category} onChange={(e) => setLabel(d.domain, e.target.value as Category)}>
                                {CATEGORIES.filter((c) => c !== '자사(Owned)' && c !== '경쟁사(Owned)').map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="pr-2 text-xs text-[#aaa]">{d.media}</td>
                          <td className="pr-2 text-xs">{d.runs}/{a.n} ({pct(d.runRate)})</td>
                          <td className="text-xs text-[#888]">{d.engines.join(', ')}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-[#666]">자사·경쟁사 도메인은 프로젝트 설정에서 변경</p>
                </Card>

                {/* 프롬프트별 */}
                <Card title="프롬프트별 브랜드 언급률" icon={<ListChecks size={16} />}>
                  <div className="space-y-3">
                    {a.prompts.map((p) => (
                      <div key={p.prompt} className="space-y-1">
                        <div className="flex justify-between gap-2 text-sm"><span className="truncate">{p.prompt}</span><span className="text-xs text-[#888] shrink-0">{ci(p.brand)} · {p.engines.join(', ')}</span></div>
                        <RateBar r={p.brand} />
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {/* 측정 기록 */}
            {runs.length > 0 && (
              <Card title={`측정 기록 (${runs.length}건)`} right={<button onClick={downloadCsv} className="text-xs text-[#aaa] hover:text-white flex items-center gap-1"><Download size={12} /> CSV</button>}>
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">일시</th><th className="pr-2">엔진</th><th className="pr-2">프롬프트</th><th className="pr-2">출처</th><th></th></tr></thead>
                    <tbody>{[...runs].reverse().map((r) => (
                      <tr key={r.id} className="border-b border-[#1F1F1F]">
                        <td className="py-1.5 pr-2 text-xs text-[#888] whitespace-nowrap">{new Date(r.measuredAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="pr-2 text-xs">{r.engine}</td>
                        <td className="pr-2 text-xs max-w-[280px] truncate">{r.prompt}</td>
                        <td className="pr-2 text-xs">{r.citations.length}개</td>
                        <td><button onClick={() => deleteRun(r.id)} className="text-[#666] hover:text-rose-400"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
