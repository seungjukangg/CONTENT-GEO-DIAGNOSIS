import React, { useState } from 'react';
import {
  Video, Globe, Link as LinkIcon, Upload, Loader2, X, Copy, Check, AlertTriangle, Sparkles, FileText, Code2, Quote,
} from 'lucide-react';
import {
  CRITERIA, PLATFORM_LABEL, DiagnoseResult, Platform, ScoredCriterion,
} from './geoCriteria';
import TechnicalDiagnosis from './TechnicalDiagnosis';

type Tab = 'content' | 'technical' | 'offsite';

const scoreColor = (s: number | null) =>
  s === null ? 'bg-[#2A2A2A] text-[#888]' : s === 2 ? 'bg-emerald-500/15 text-emerald-400' : s === 1 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400';

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="p-1.5 rounded hover:bg-[#2A2A2A] text-[#888] hover:text-white"
      title="복사"
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Section({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-[#161616] border border-[#262626] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[#FF9F0A] text-sm font-bold flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---------------- 영상 진단 ---------------- */

function VideoDiagnosis() {
  const [mode, setMode] = useState<'file' | 'youtube'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('');
  const [questions, setQuestions] = useState('');
  const [kbfs, setKbfs] = useState('');
  const [platform, setPlatform] = useState<Platform>('youtube_shorts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const canSubmit = (mode === 'file' ? !!file : youtubeUrl.trim().length > 0) && brand.trim().length > 0 && !loading;

  async function submit() {
    setLoading(true); setError(''); setResult(null);
    const form = new FormData();
    if (mode === 'file' && file) form.append('video', file);
    if (mode === 'youtube') form.append('youtubeUrl', youtubeUrl.trim());
    Object.entries({ brand, product, category, questions, kbfs, platform }).forEach(([k, v]) => form.append(k, v));
    try {
      const res = await fetch('/api/video-diagnose', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석 실패');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패');
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF9F0A]';

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      {/* 입력 */}
      <aside className="space-y-4 lg:sticky lg:top-6 self-start">
        <Section title="진단할 영상" icon={<Video size={16} />}>
          <div className="flex gap-2 text-xs">
            {(['file', 'youtube'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg border ${mode === m ? 'border-[#FF9F0A] text-[#FF9F0A]' : 'border-[#2A2A2A] text-[#888]'}`}>
                {m === 'file' ? '파일 업로드' : 'YouTube 주소'}
              </button>
            ))}
          </div>
          {mode === 'file' ? (
            file ? (
              <div className="flex items-center justify-between bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm">
                <span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={() => setFile(null)}><X size={14} /></button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 h-28 border border-dashed border-[#333] rounded-lg cursor-pointer text-[#888] text-sm hover:border-[#FF9F0A]">
                <Upload size={18} /> 영상 파일 선택 (200MB 이하)
                <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )
          ) : (
            <div className="relative">
              <LinkIcon size={14} className="absolute left-3 top-3 text-[#666]" />
              <input className={`${input} pl-8`} placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
              <p className="text-[11px] text-[#666] mt-1">공개 영상만 분석 가능</p>
            </div>
          )}
          <label className="block text-xs text-[#aaa] space-y-1">
            <span>게시 플랫폼</span>
            <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
            </select>
          </label>
        </Section>

        <Section title="진단 기준 정보" icon={<FileText size={16} />}>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="브랜드 *" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <input className={input} placeholder="제품명" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <input className={input} placeholder="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} />
          <label className="block text-xs text-[#aaa] space-y-1">
            <span>소비자 프롬프트 (줄바꿈으로 구분, 최대 8개)</span>
            <textarea className={`${input} h-24`} value={questions} onChange={(e) => setQuestions(e.target.value)} />
          </label>
          <label className="block text-xs text-[#aaa] space-y-1">
            <span>KBF (쉼표로 구분, 선택)</span>
            <input className={input} value={kbfs} onChange={(e) => setKbfs(e.target.value)} />
          </label>
        </Section>

        <button onClick={submit} disabled={!canSubmit}
          className="w-full py-3 rounded-xl bg-[#FF9F0A] text-black font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={16} className="animate-spin" /> 분석 중 (1~3분)</> : <><Sparkles size={16} /> AI 인용 준비도 진단</>}
        </button>
        {error && <p className="text-rose-400 text-sm">{error}</p>}
      </aside>

      {/* 결과 */}
      <main className="space-y-6 min-w-0">
        {!result && !loading && <EmptyState />}
        {loading && <div className="h-64 flex items-center justify-center text-[#888] text-sm"><Loader2 className="animate-spin mr-2" size={18} /> 영상 업로드 → 전사 → 기준별 판정 중</div>}
        {result && <ResultView r={result} />}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <Section title="진단 기준" icon={<Code2 size={16} />}>
      <p className="text-sm text-[#aaa]">AI 검색 엔진은 영상 화면이 아니라 음성 스크립트·제목·설명란을 읽고 인용함. 아래 11개 기준으로 영상 속 문장이 인용되기 좋은 상태인지 판정함.</p>
      <CriteriaTable rows={CRITERIA.map((c) => ({ ...c, score: null, evidence: [], reason: '', fix: '' }))} compact />
    </Section>
  );
}

function ResultView({ r }: { r: DiagnoseResult }) {
  const pct = r.max ? Math.round((r.total / r.max) * 100) : 0;
  const packageText = [
    `제목: ${r.textPackage.title}`,
    `\n설명란:\n${r.textPackage.descriptionLead}`,
    `\n챕터:\n${r.textPackage.chapters.map((c) => `${c.time} ${c.title}`).join('\n')}`,
    `\nFAQ:\n${r.textPackage.faq.map((f) => `Q. ${f.q}\nA. ${f.a}`).join('\n\n')}`,
  ].join('\n');

  return (
    <>
      {/* 요약 */}
      <Section title="AI 인용 준비도" icon={<Sparkles size={16} />} right={<span className="text-[11px] text-[#666]">model: {r.model}</span>}>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-4xl font-bold">{r.total}<span className="text-lg text-[#666]"> / {r.max}</span></div>
            <div className="text-xs text-[#888]">기준 충족률 {pct}% · 실제 인용 확률이 아닌 기준 충족 정도</div>
          </div>
          <div className="flex-1 grid sm:grid-cols-4 gap-2 min-w-[280px]">
            {r.stages.map((s) => (
              <div key={s.stage} className="bg-[#0F0F0F] rounded-lg p-3">
                <div className="text-[11px] text-[#888]">{s.stage}</div>
                <div className="text-lg font-semibold">{s.score}<span className="text-xs text-[#666]"> / {s.max}</span></div>
                <div className="h-1 bg-[#2A2A2A] rounded mt-1"><div className="h-1 bg-[#FF9F0A] rounded" style={{ width: `${s.max ? (s.score / s.max) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-start text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span><b>{PLATFORM_LABEL[r.platform]}</b> · {r.platformNote}</span>
        </div>
        <div className="grid sm:grid-cols-4 gap-2 text-xs">
          <Metric label="단위 붙은 수치" value={`${r.metrics.numbersFound.length}개`} sub={r.metrics.numbersFound.slice(0, 4).join(', ')} />
          <Metric label="지시어 사용" value={`${r.metrics.demonstratives.length}회`} sub={[...new Set(r.metrics.demonstratives)].join(', ')} />
          <Metric label="브랜드명 언급" value={`${r.metrics.brandMentions}회`} />
          <Metric label="화면 자막에만 있는 문장" value={`${r.metrics.screenOnlyLines} / ${r.metrics.totalLines}`} />
        </div>
      </Section>

      {/* 후킹 */}
      <Section title="후킹 구간 개선 — AI 인용 기준" icon={<Quote size={16} />}>
        <div className="bg-[#0F0F0F] rounded-lg p-3 text-sm">
          <div className="text-[11px] text-[#888] mb-1">원문 · {r.hook.timeRange}</div>
          {r.hook.text}
        </div>
        <ul className="text-sm text-[#ccc] list-disc pl-5 space-y-1">{r.hook.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <div className="space-y-2">
          {r.hook.improved.map((h, i) => (
            <div key={i} className="border border-[#FF9F0A]/30 rounded-lg p-3">
              <div className="flex justify-between gap-2"><span className="text-sm font-medium">{h.text}</span><CopyButton text={h.text} /></div>
              <div className="text-xs text-[#888] mt-1">{h.whatChanged}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 기준별 */}
      <Section title="기준별 진단" icon={<Code2 size={16} />}>
        <CriteriaTable rows={r.criteria} />
      </Section>

      {/* 질문·구매기준 */}
      <div className="grid md:grid-cols-2 gap-6">
        <Section title="소비자 프롬프트 대응 (A)">
          {r.questionCoverage.map((q, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className={`shrink-0 w-6 h-6 rounded text-xs flex items-center justify-center ${scoreColor(q.score)}`}>{q.score}</span>
              <div><div>{q.question}</div><div className="text-xs text-[#888]">{q.time} · {q.note}</div></div>
            </div>
          ))}
        </Section>
        <Section title="KBF 커버리지 (K)">
          {r.kbfCoverage.length === 0 ? <p className="text-sm text-[#666]">KBF 미입력</p> : r.kbfCoverage.map((k, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className={`shrink-0 w-6 h-6 rounded text-xs flex items-center justify-center ${scoreColor(k.score)}`}>{k.score}</span>
              <div><div>{k.kbf}</div><div className="text-xs text-[#888]">{k.note}</div></div>
            </div>
          ))}
        </Section>
      </div>

      {/* 문장 수정 */}
      <Section title="문장별 수정안">
        <div className="space-y-3">
          {r.rewrites.map((w, i) => (
            <div key={i} className="grid md:grid-cols-2 gap-2 text-sm">
              <div className="bg-[#0F0F0F] rounded-lg p-3">
                <div className="text-[11px] text-[#888] mb-1">{w.time} · {w.issues.join(' / ')}</div>
                <span className="text-[#aaa] line-through decoration-rose-400/50">{w.original}</span>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex justify-between gap-2">
                <span>{w.rewritten}</span><CopyButton text={w.rewritten} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#666]">[ ] 표시는 영상에 없는 정보로, 실제 수치·출처로 채워야 함</p>
      </Section>

      {/* 텍스트화 패키지 */}
      <Section title="텍스트화 패키지 — 설명란·자사 페이지 게시용" icon={<FileText size={16} />} right={<CopyButton text={packageText} />}>
        <div className="text-sm space-y-3">
          <div><div className="text-[11px] text-[#888]">제목</div>{r.textPackage.title}</div>
          <div><div className="text-[11px] text-[#888]">설명란 첫 2문장</div>{r.textPackage.descriptionLead}</div>
          <div>
            <div className="text-[11px] text-[#888]">챕터</div>
            {r.textPackage.chapters.map((c, i) => <div key={i}><span className="text-[#FF9F0A] font-mono text-xs mr-2">{c.time}</span>{c.title}</div>)}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] text-[#888]">FAQ</div>
            {r.textPackage.faq.map((f, i) => <div key={i}><div className="font-medium">Q. {f.q}</div><div className="text-[#bbb]">A. {f.a}</div></div>)}
          </div>
        </div>
      </Section>

      {/* 전사 */}
      <Section title="전사 (나레이션·화면 자막)">
        <div className="max-h-80 overflow-y-auto space-y-1 text-sm">
          {r.transcript.map((l, i) => (
            <div key={i} className="flex gap-3">
              <span className="font-mono text-xs text-[#666] w-12 shrink-0 pt-0.5">{l.start}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded h-fit shrink-0 ${l.source === '화면자막' ? 'bg-rose-500/15 text-rose-300' : 'bg-[#2A2A2A] text-[#aaa]'}`}>{l.source}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#666]">"화면자막"으로 표시된 문장은 음성 스크립트에 남지 않아 AI가 읽기 어려움</p>
      </Section>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#0F0F0F] rounded-lg p-3">
      <div className="text-[#888]">{label}</div>
      <div className="text-base font-semibold text-white">{value}</div>
      {sub && <div className="text-[#666] truncate">{sub}</div>}
    </div>
  );
}

function CriteriaTable({ rows, compact = false }: { rows: ScoredCriterion[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-[#888] border-b border-[#262626]">
            <th className="py-2 pr-2">코드</th><th className="pr-2">항목</th><th className="pr-2">단계</th>
            {!compact && <th className="pr-2">점수</th>}
            <th className="pr-2">{compact ? '판정 기준' : '근거 · 개선'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.code} className="border-b border-[#1F1F1F] align-top">
              <td className="py-3 pr-2 font-mono text-[#FF9F0A]">{c.code}</td>
              <td className="pr-2 py-3 whitespace-nowrap">{c.name}{c.scoredBy === 'code' && <div className="text-[10px] text-[#666]">코드 계산</div>}</td>
              <td className="pr-2 py-3 text-xs text-[#888] whitespace-nowrap">{c.stage}</td>
              {!compact && (
                <td className="pr-2 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${scoreColor(c.score)}`}>{c.score === null ? '제외' : c.score}</span>
                </td>
              )}
              <td className="py-3 text-xs space-y-1">
                {compact ? (
                  <><div className="text-[#ccc]">{c.videoCheck}</div><div className="text-[#777]">{c.scale}</div><div className="text-[#555]">근거: {c.basis}</div></>
                ) : (
                  <>
                    {c.reason && <div className="text-[#ccc]">{c.reason}</div>}
                    {c.evidence.map((e, i) => <div key={i} className="text-[#888]"><span className="font-mono">{e.time}</span> "{e.quote}"</div>)}
                    {c.fix && <div className="text-emerald-400">→ {c.fix}</div>}
                    <details className="text-[#555]"><summary className="cursor-pointer">판정 기준·근거</summary>{c.scale}<br />{c.basis}</details>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 앱 ---------------- */

export default function App() {
  const [tab, setTab] = useState<Tab>('content');
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'content', label: '콘텐츠 GEO', icon: <Video size={14} /> },
    { id: 'technical', label: '테크니컬 GEO', icon: <Code2 size={14} /> },
    { id: 'offsite', label: '오프사이트 GEO', icon: <Globe size={14} /> },
  ];
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#EDEDED]">
      <header className="border-b border-[#1F1F1F]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="font-bold">GEO 진단<span className="text-[#FF9F0A]">.</span></div>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${tab === t.id ? 'bg-[#1F1F1F] text-white' : 'text-[#888] hover:text-white'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {tab === 'content' ? (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white">콘텐츠 GEO</h1>
                <span className="text-xs font-medium text-[#FF9F0A] bg-[#FF9F0A]/15 px-2.5 py-0.5 rounded-full">영상 진단</span>
              </div>
              <p className="text-sm text-[#888]">
                영상 속 나레이션·자막이 AI 답변에 인용되기 좋은 상태인지 진단하고, 인용 기준에 맞춘 후킹 문구와 설명란 텍스트를 제안함
              </p>
            </div>
            <VideoDiagnosis />
          </div>
        ) : tab === 'technical' ? (
          <TechnicalDiagnosis />
        ) : (
          <div className="h-64 flex items-center justify-center text-[#666] text-sm border border-dashed border-[#262626] rounded-xl">
            오프사이트 GEO — 다음 단계에서 구현 예정
          </div>
        )}
      </div>
    </div>
  );
}
