import React, { useEffect, useState } from 'react';
import { Loader2, Radar, Youtube, BookOpen, Newspaper, AlertTriangle, Info, History, ExternalLink } from 'lucide-react';
import type { OffsiteProject } from './offsite';
import { EntityPresence, PresenceResult, shareOf } from './presenceTypes';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '요청 실패');
  return data as T;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => n.toLocaleString('ko-KR');
const daysAgo = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

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

function ShareBar({ label, share }: { label: string; share: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-[#aaa]">{label}</span><span>{pct(share)}</span></div>
      <div className="h-2 bg-[#2A2A2A] rounded"><div className="h-2 rounded bg-[#FF9F0A]" style={{ width: `${share * 100}%` }} /></div>
    </div>
  );
}

const Status = ({ s, error }: { s: string; error?: string }) =>
  s === 'error' ? <span className="text-rose-400 text-xs" title={error}>수집 실패</span> : null;

export default function PresencePanel({ project }: { project: OffsiteProject }) {
  const [history, setHistory] = useState<PresenceResult[]>([]);
  const [current, setCurrent] = useState<PresenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [ytKey, setYtKey] = useState<boolean | null>(null);

  useEffect(() => {
    setCurrent(null); setHistory([]); setErr('');
    api<{ youtube: boolean }>('/api/offsite/presence-status').then((s) => setYtKey(s.youtube)).catch(() => setYtKey(null));
    api<PresenceResult[]>(`/api/offsite/projects/${project.id}/presence`).then((h) => { setHistory(h); setCurrent(h[0] ?? null); }).catch((e) => setErr(e.message));
  }, [project.id]);

  async function run() {
    setRunning(true); setErr('');
    try {
      const r = await api<PresenceResult>(`/api/offsite/projects/${project.id}/presence`, { method: 'POST' });
      setHistory((h) => [r, ...h]); setCurrent(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '진단 실패');
    } finally {
      setRunning(false);
    }
  }

  const ents = current?.entities ?? [];
  const bi = ents.findIndex((e) => e.isBrand);
  const share = (pick: (e: EntityPresence) => number) => (bi < 0 ? 0 : shareOf(ents.map(pick), bi));
  const rowCls = (e: EntityPresence) => `border-b border-[#1F1F1F] ${e.isBrand ? 'text-[#FF9F0A]' : ''}`;

  return (
    <div className="space-y-6">
      {/* 실행 */}
      <Card title="외부 출처 존재감 진단" icon={<Radar size={16} />}>
        <p className="text-sm text-[#aaa]">AI가 자주 인용하는 외부 출처(YouTube·위키·뉴스)에 {project.brand}와 경쟁사가 얼마나 있는지 자동으로 비교함. 질문을 직접 입력할 필요 없음</p>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={run} disabled={running} className="px-5 py-2.5 rounded-lg bg-[#FF9F0A] text-black font-bold text-sm disabled:opacity-40 flex items-center gap-2">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />} {running ? '수집 중 (최대 1분)' : '진단 실행'}
          </button>
          {history.length > 0 && (
            <label className="text-xs text-[#888] flex items-center gap-2"><History size={14} />
              <select className="bg-[#0F0F0F] border border-[#2A2A2A] rounded px-2 py-1.5 text-sm text-[#EDEDED]" value={current?.id ?? ''} onChange={(e) => setCurrent(history.find((h) => h.id === e.target.value) ?? null)}>
                {history.map((h) => <option key={h.id} value={h.id}>{new Date(h.measuredAt).toLocaleString('ko-KR')}</option>)}
              </select>
            </label>
          )}
        </div>
        {ytKey === false && (
          <div className="text-xs bg-amber-500/10 text-amber-200 rounded-lg p-3">YouTube 진단을 하려면 AI Studio Secrets에 <b>YOUTUBE_API_KEY</b>를 추가해야 함. 키 없이도 위키·뉴스 진단은 실행됨</div>
        )}
        <div className="text-[11px] text-[#666] space-y-0.5">
          <p>· 비교 대상: 브랜드 + 경쟁사 최대 5곳 · 결과는 실행할 때마다 저장되어 시점별로 비교 가능</p>
          <p>· YouTube: 최근 12개월 검색 상위 25개 영상 중 이름이 제목·설명에 들어간 영상 · 위키: 한국어·영어 위키백과, 위키데이터 · 뉴스: GDELT 최근 3개월 (영문 표기로 검색, 국내 매체 일부 누락 가능)</p>
        </div>
        {err && <p className="text-rose-400 text-sm">{err}</p>}
      </Card>

      {current && (
        <>
          {/* 점유율 요약 */}
          <Card title={`${project.brand} 점유율 — 비교 대상 전체 대비`}>
            <div className="grid md:grid-cols-3 gap-4">
              <ShareBar label="YouTube 제3자 언급 영상 수" share={share((e) => e.youtube.thirdParty)} />
              <ShareBar label="YouTube 언급 영상 조회수" share={share((e) => e.youtube.totalViews)} />
              <ShareBar label="뉴스 보도 매체 수 (3개월)" share={share((e) => e.news.outlets)} />
            </div>
            <p className="text-[11px] text-[#666]">비교 대상 {ents.length}곳 기준. 모두 같은 비율이면 {pct(1 / Math.max(ents.length, 1))}</p>
          </Card>

          {/* 진단 */}
          <Card title="진단 결과" icon={<AlertTriangle size={16} />}>
            {current.findings.map((f, i) => (
              <div key={i} className={`flex gap-2 text-sm rounded-lg p-3 ${f.level === 'high' ? 'bg-rose-500/10 text-rose-200' : f.level === 'mid' ? 'bg-amber-500/10 text-amber-200' : 'bg-[#0F0F0F] text-[#aaa]'}`}>
                {f.level === 'info' ? <Info size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                <span><b>[{f.source}]</b> {f.text}</span>
              </div>
            ))}
          </Card>

          {/* YouTube */}
          <Card title="YouTube" icon={<Youtube size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">대상</th><th className="pr-2">언급 영상</th><th className="pr-2">제3자 영상</th><th className="pr-2">3분 초과</th><th className="pr-2">조회수 합계</th><th>조회수 상위 영상</th></tr></thead>
                <tbody>{ents.map((e) => (
                  <tr key={e.name} className={rowCls(e)}>
                    <td className="py-2 pr-2 font-medium">{e.name}</td>
                    {e.youtube.status === 'no_key' ? <td colSpan={5} className="text-xs text-[#666]">API 키 미설정</td> : e.youtube.status === 'error' ? <td colSpan={5}><Status s="error" error={e.youtube.error} /></td> : (
                      <>
                        <td className="pr-2">{e.youtube.mentionVideos}</td>
                        <td className="pr-2">{e.youtube.thirdParty}</td>
                        <td className="pr-2">{e.youtube.longForm}</td>
                        <td className="pr-2">{fmt(e.youtube.totalViews)}</td>
                        <td className="text-xs text-[#aaa]">{e.youtube.top[0] ? (
                          <a href={`https://www.youtube.com/watch?v=${e.youtube.top[0].id}`} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
                            {e.youtube.top[0].title.slice(0, 40)} · {e.youtube.top[0].channel}{e.youtube.top[0].official ? ' (공식)' : ''} <ExternalLink size={10} />
                          </a>
                        ) : '-'}</td>
                      </>
                    )}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#666]">공식 채널 여부는 채널명에 브랜드명이 들어 있는지로 추정. AI 영상 인용은 대부분 YouTube 롱폼에서 발생하므로 3분 초과 영상 수를 따로 표시</p>
          </Card>

          {/* 위키 */}
          <Card title="위키백과·위키데이터" icon={<BookOpen size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">대상</th><th className="pr-2">한국어 문서</th><th className="pr-2">영어 문서</th><th className="pr-2">위키데이터 언어 수</th><th>공식 사이트 연결</th></tr></thead>
                <tbody>{ents.map((e) => {
                  const w = e.wikipedia;
                  const cell = (x: typeof w.ko) => !x.exists ? <span className="text-[#666]">없음</span> : (
                    <span>{x.disambiguation ? <span className="text-amber-400">동음이의 문서</span> : '있음'} <span className="text-xs text-[#888]">· {x.title}{x.lastEdited ? ` · ${daysAgo(x.lastEdited)}일 전 수정` : ''}</span></span>
                  );
                  return (
                    <tr key={e.name} className={rowCls(e)}>
                      <td className="py-2 pr-2 font-medium">{e.name}</td>
                      {w.status === 'error' ? <td colSpan={4}><Status s="error" error={w.error} /></td> : (
                        <>
                          <td className="pr-2">{cell(w.ko)}</td>
                          <td className="pr-2">{cell(w.en)}</td>
                          <td className="pr-2">{w.wikidata ? `${w.wikidata.languages}개` : '-'}</td>
                          <td>{w.wikidata ? (w.wikidata.officialWebsite ? '있음' : <span className="text-amber-400">없음</span>) : '-'}</td>
                        </>
                      )}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#666]">브랜드명·다른 표기로 문서 제목을 찾음. 표시된 문서 제목이 실제 브랜드 문서가 맞는지 확인 필요</p>
          </Card>

          {/* 뉴스 */}
          <Card title="뉴스 보도 (최근 3개월)" icon={<Newspaper size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">대상</th><th className="pr-2">기사 수</th><th className="pr-2">매체 수</th><th className="pr-2">한국어 기사</th><th>주요 매체</th></tr></thead>
                <tbody>{ents.map((e) => (
                  <tr key={e.name} className={rowCls(e)}>
                    <td className="py-2 pr-2 font-medium">{e.name}</td>
                    {e.news.status === 'no_query' ? <td colSpan={4} className="text-xs text-[#666]">영문 표기 없음 — 프로젝트 설정에서 다른 표기에 영문명 추가</td>
                      : e.news.status === 'error' ? <td colSpan={4}><Status s="error" error={e.news.error} /></td> : (
                        <>
                          <td className="pr-2">{e.news.articles}{e.news.articles >= 250 ? '+' : ''}</td>
                          <td className="pr-2">{e.news.outlets}</td>
                          <td className="pr-2">{e.news.koreanArticles}</td>
                          <td className="text-xs text-[#aaa]">{e.news.topOutlets.slice(0, 3).map((o) => `${o.domain}(${o.count})`).join(', ') || '-'}</td>
                        </>
                      )}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#666]">검색어: {ents.map((e) => `${e.name} → ${e.news.query ?? '-'}`).join(' / ')} · 최대 250건까지 집계</p>
          </Card>

          {/* 시점별 추이 */}
          {history.length > 1 && (
            <Card title="시점별 추이" icon={<History size={16} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] text-[#888] border-b border-[#262626]"><th className="py-1.5 pr-2">진단 일시</th><th className="pr-2">YouTube 제3자 영상</th><th className="pr-2">뉴스 매체 수</th><th>한국어 위키</th></tr></thead>
                  <tbody>{history.map((h) => {
                    const b = h.entities.find((e) => e.isBrand);
                    return b ? (
                      <tr key={h.id} className="border-b border-[#1F1F1F]">
                        <td className="py-1.5 pr-2 text-xs text-[#888]">{new Date(h.measuredAt).toLocaleString('ko-KR')}</td>
                        <td className="pr-2">{b.youtube.status === 'ok' ? b.youtube.thirdParty : '-'}</td>
                        <td className="pr-2">{b.news.status === 'ok' ? b.news.outlets : '-'}</td>
                        <td>{b.wikipedia.ko.exists ? '있음' : '없음'}</td>
                      </tr>
                    ) : null;
                  })}</tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
