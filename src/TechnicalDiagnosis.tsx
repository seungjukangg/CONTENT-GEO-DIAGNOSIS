import React, { useState } from 'react';
import { Globe, Loader2, Search, CheckCircle2, AlertTriangle, XCircle, Info, Eye, Bot, ClipboardList } from 'lucide-react';
import { CheckResult, CheckStatus, GROUP_DESC, TechnicalResult } from './technicalTypes';

const STATUS: Record<CheckStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  pass: { label: '통과', cls: 'text-emerald-400 bg-emerald-500/10', icon: <CheckCircle2 size={14} /> },
  warn: { label: '주의', cls: 'text-amber-400 bg-amber-500/10', icon: <AlertTriangle size={14} /> },
  fail: { label: '실패', cls: 'text-rose-400 bg-rose-500/10', icon: <XCircle size={14} /> },
  info: { label: '참고', cls: 'text-sky-300 bg-sky-500/10', icon: <Info size={14} /> },
};

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-[#161616] border border-[#262626] rounded-xl p-5 space-y-4">
      <h3 className="text-[#FF9F0A] text-sm font-bold flex items-center gap-2">{icon}{title}</h3>
      {children}
    </section>
  );
}

function CheckRow({ c }: { c: CheckResult }) {
  const s = STATUS[c.status];
  return (
    <details className="group border-b border-[#1F1F1F] py-3" open={c.status === 'fail'}>
      <summary className="flex items-start gap-3 cursor-pointer list-none">
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${s.cls}`}>{s.icon}{s.label}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs text-[#aaa] break-words">{c.summary}</div>
        </div>
      </summary>
      <div className="pl-[72px] pt-2 space-y-1 text-xs">
        {c.details.map((d, i) => <div key={i} className="text-[#888] break-all">· {d}</div>)}
        {c.fix && <div className="text-emerald-400">→ {c.fix}</div>}
        <div className="text-[#555]">근거: {c.basis}</div>
      </div>
    </details>
  );
}

export default function TechnicalDiagnosis() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [r, setR] = useState<TechnicalResult | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(''); setR(null);
    try {
      const res = await fetch('/api/technical-diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '진단 실패');
      setR(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '진단 실패');
    } finally {
      setLoading(false);
    }
  }

  const total = r ? r.groups.reduce((a, g) => ({ pass: a.pass + g.pass, warn: a.warn + g.warn, fail: a.fail + g.fail }), { pass: 0, warn: 0, fail: 0 }) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-white">테크니컬 GEO</h1>
          <span className="text-xs font-medium text-[#FF9F0A] bg-[#FF9F0A]/15 px-2.5 py-0.5 rounded-full">URL 진단</span>
        </div>
        <p className="text-sm text-[#888]">화면에는 보이지만 AI 크롤러는 읽지 못하는 부분, AI 봇 차단 설정, 색인·구조화 데이터 상태를 점검함</p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Globe size={16} className="absolute left-3 top-3 text-[#666]" />
          <input
            className="w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#FF9F0A]"
            placeholder="https://www.example.com/product/123"
            value={url} onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <button disabled={loading || !url.trim()} className="px-5 rounded-xl bg-[#FF9F0A] text-black font-bold text-sm disabled:opacity-40 flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 진단
        </button>
      </form>
      {error && <p className="text-rose-400 text-sm">{error}</p>}
      {loading && <div className="h-40 flex items-center justify-center text-[#888] text-sm"><Loader2 className="animate-spin mr-2" size={18} /> 페이지·robots.txt·사이트맵 수집 및 AI 봇 이름으로 접속 테스트 중</div>}

      {!r && !loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(GROUP_DESC).map(([g, d]) => (
            <div key={g} className="bg-[#161616] border border-[#262626] rounded-xl p-4">
              <div className="font-semibold text-sm">{g}</div>
              <div className="text-xs text-[#888] mt-1">{d}</div>
            </div>
          ))}
        </div>
      )}

      {r && total && (
        <>
          {/* 요약 */}
          <Card title="진단 요약" icon={<CheckCircle2 size={16} />}>
            <div className="text-xs text-[#888] break-all">{r.finalUrl} · {new Date(r.fetchedAt).toLocaleString('ko-KR')}</div>
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-400">통과 {total.pass}</span>
              <span className="text-amber-400">주의 {total.warn}</span>
              <span className="text-rose-400">실패 {total.fail}</span>
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              {r.groups.map((g) => (
                <div key={g.group} className="bg-[#0F0F0F] rounded-lg p-3">
                  <div className="text-sm font-semibold">{g.group}</div>
                  <div className="text-[11px] text-[#777] mb-2">{GROUP_DESC[g.group]}</div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-emerald-400">{g.pass}</span>/<span className="text-amber-400">{g.warn}</span>/<span className="text-rose-400">{g.fail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* AI가 보는 본문 */}
          <Card title={`AI 크롤러가 보는 본문 (JavaScript 실행 전 · ${r.rawTextLength.toLocaleString()}자)`} icon={<Eye size={16} />}>
            <p className="text-xs text-[#888]">ChatGPT·Claude·Perplexity 크롤러는 JavaScript를 실행하지 않고 아래 텍스트만 읽음. 실제 화면과 비교해 제품명·스펙·가격 등 핵심 정보가 빠졌는지 확인</p>
            <div className="bg-[#0F0F0F] rounded-lg p-3 text-sm text-[#ccc] max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
              {r.rawTextPreview || <span className="text-rose-400">본문 텍스트가 비어 있음 — AI 크롤러에게는 빈 페이지로 보임</span>}
              {r.rawTextLength > r.rawTextPreview.length && <span className="text-[#555]"> …(이하 생략)</span>}
            </div>
          </Card>

          {/* 봇별 접근 */}
          <Card title="AI 봇별 접근 가능 여부" icon={<Bot size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-[#888] border-b border-[#262626]">
                    <th className="py-2 pr-3">봇</th><th className="pr-3">운영사</th><th className="pr-3">용도</th><th className="pr-3">robots.txt</th><th>봇 이름으로 접속</th>
                  </tr>
                </thead>
                <tbody>
                  {r.bots.map((b) => {
                    const w = r.waf.find((x) => x.agent === b.bot);
                    return (
                      <tr key={b.bot} className="border-b border-[#1F1F1F]">
                        <td className="py-2 pr-3 font-mono text-xs">{b.bot}</td>
                        <td className="pr-3 text-xs text-[#aaa]">{b.owner}</td>
                        <td className="pr-3 text-xs text-[#888]">{b.purpose}</td>
                        <td className="pr-3"><span className={`text-xs px-2 py-0.5 rounded ${b.robotsAllowed ? STATUS.pass.cls : b.kind === 'training' ? STATUS.info.cls : STATUS.fail.cls}`}>{b.robotsAllowed ? '허용' : '차단'}</span></td>
                        <td className="text-xs">{w ? <span className={w.blocked ? 'text-rose-400' : 'text-emerald-400'}>{w.status ?? '응답 없음'}{w.blocked ? ' 차단' : ' 정상'}</span> : <span className="text-[#555]">-</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#666]">학습용 봇(GPTBot·ClaudeBot·Google-Extended) 차단은 선택 사항이며 AI 검색 노출과는 별개임</p>
          </Card>

          {/* 항목별 */}
          {r.groups.map((g) => (
            <Card key={g.group} title={`${g.group} — ${GROUP_DESC[g.group]}`}>
              <div>{r.checks.filter((c) => c.group === g.group).map((c) => <CheckRow key={c.id} c={c} />)}</div>
            </Card>
          ))}

          {/* 직접 확인 */}
          <Card title="자동 진단이 불가능한 항목 — 직접 확인" icon={<ClipboardList size={16} />}>
            <div className="space-y-2 text-sm">
              {r.manual.map((m) => <div key={m.item}><span className="font-medium">{m.item}</span><span className="text-[#888]"> — {m.how}</span></div>)}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
