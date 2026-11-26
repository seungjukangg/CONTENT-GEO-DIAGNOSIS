/**
 * 오프사이트 GEO — 외부 출처 존재감 진단 (서버 전용)
 * AI가 자주 인용하는 외부 출처에 브랜드·경쟁사가 얼마나 있는지 비교
 *  - YouTube : YouTube Data API (무료 키 필요: YOUTUBE_API_KEY)
 *  - 위키    : Wikipedia·Wikidata 공개 API (키 불필요)
 *  - 뉴스    : GDELT DOC 2.0 API (키 불필요, 최근 3개월, 영문 키워드 기준 검색)
 */
import type { OffsiteProject } from './src/offsite';
import type { EntityPresence, PresenceResult, YoutubeVideo } from './src/presenceTypes';

const UA = 'GEO-Diagnosis/1.0 (educational project; contact via GitHub seungjukangg)';
const TIMEOUT = 15_000;

interface Entity { name: string; aliases: string[]; isBrand: boolean }

const getJson = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { throw new Error(`JSON 아님: ${text.slice(0, 120)}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const includesAny = (text: string, names: string[]) => {
  const t = text.toLowerCase();
  return names.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 2).some((n) => t.includes(n));
};

/* ---------------- YouTube ---------------- */

/** ISO 8601 기간(PT1H2M3S) → 초 */
export function durationSec(iso: string): number {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

async function youtube(e: Entity): Promise<EntityPresence['youtube']> {
  const empty = { mentionVideos: 0, thirdParty: 0, longForm: 0, totalViews: 0, top: [] as YoutubeVideo[] };
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { status: 'no_key', ...empty };
  try {
    const after = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const q = encodeURIComponent(e.name);
    const s = await getJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&regionCode=KR&relevanceLanguage=ko&publishedAfter=${after}&q=${q}&key=${key}`);
    const ids: string[] = (s.items ?? []).map((i: { id?: { videoId?: string } }) => i.id?.videoId).filter(Boolean);
    if (!ids.length) return { status: 'ok', ...empty };
    const v = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${key}`);
    const names = [e.name, ...e.aliases];
    const vids: YoutubeVideo[] = (v.items ?? [])
      .filter((it: { snippet: { title: string; description: string } }) => includesAny(`${it.snippet.title}\n${it.snippet.description}`, names))
      .map((it: { id: string; snippet: { title: string; channelTitle: string; publishedAt: string }; statistics?: { viewCount?: string }; contentDetails?: { duration?: string } }) => ({
        id: it.id,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        views: Number(it.statistics?.viewCount ?? 0),
        long: durationSec(it.contentDetails?.duration ?? '') > 180,
        official: includesAny(it.snippet.channelTitle, names),
        publishedAt: it.snippet.publishedAt,
      }));
    return {
      status: 'ok',
      mentionVideos: vids.length,
      thirdParty: vids.filter((x) => !x.official).length,
      longForm: vids.filter((x) => x.long).length,
      totalViews: vids.reduce((a, x) => a + x.views, 0),
      top: [...vids].sort((a, b) => b.views - a.views).slice(0, 3),
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err), ...empty };
  }
}

/* ---------------- Wikipedia / Wikidata ---------------- */

type WikiPage = EntityPresence['wikipedia']['ko'] & { qid?: string };

export function parseWikiPages(json: unknown): WikiPage {
  const pages = ((json as { query?: { pages?: unknown[] } })?.query?.pages ?? []) as {
    missing?: boolean; invalid?: boolean; title: string; length?: number; revisions?: { timestamp: string }[];
    pageprops?: { wikibase_item?: string; disambiguation?: string };
  }[];
  const p = pages.find((x) => !x.missing && !x.invalid);
  if (!p) return { exists: false };
  return {
    exists: true, title: p.title, length: p.length, lastEdited: p.revisions?.[0]?.timestamp,
    disambiguation: p.pageprops?.disambiguation !== undefined, qid: p.pageprops?.wikibase_item,
  };
}

async function wikiLang(lang: 'ko' | 'en', names: string[]): Promise<WikiPage> {
  for (const n of names) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=revisions|pageprops|info&rvprop=timestamp&ppprop=wikibase_item|disambiguation&titles=${encodeURIComponent(n)}`;
    const page = parseWikiPages(await getJson(url));
    if (page.exists) return page;
  }
  return { exists: false };
}

async function wikipedia(e: Entity): Promise<EntityPresence['wikipedia']> {
  try {
    const names = [e.name, ...e.aliases].filter(Boolean).slice(0, 4);
    const [ko, en] = await Promise.all([wikiLang('ko', names), wikiLang('en', names)]);
    const qid = (!ko.disambiguation && ko.qid) || (!en.disambiguation && en.qid);
    let wikidata: EntityPresence['wikipedia']['wikidata'];
    if (qid) {
      const w = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks|claims&ids=${qid}`);
      const ent = w.entities?.[qid];
      wikidata = {
        id: qid,
        languages: Object.keys(ent?.sitelinks ?? {}).filter((k) => k.endsWith('wiki') && k !== 'commonswiki').length,
        officialWebsite: Array.isArray(ent?.claims?.P856) && ent.claims.P856.length > 0,
      };
    }
    const strip = ({ qid: _q, ...rest }: WikiPage) => rest;
    return { status: 'ok', ko: strip(ko), en: strip(en), wikidata };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err), ko: { exists: false }, en: { exists: false } };
  }
}

/* ---------------- 뉴스 (GDELT) ---------------- */

/** GDELT는 기계번역된 영문 기준으로 검색하므로 영문 표기만 사용 */
export function gdeltQuery(e: Entity): string | null {
  const latin = [e.name, ...e.aliases].map((n) => n.trim()).filter((n) => /^[A-Za-z0-9 .&'-]{3,}$/.test(n));
  if (!latin.length) return null;
  const parts = [...new Set(latin)].slice(0, 3).map((n) => (n.includes(' ') ? `"${n}"` : n));
  return parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0];
}

export function summarizeArticles(articles: { domain?: string; language?: string }[]) {
  const byDomain = new Map<string, number>();
  articles.forEach((a) => a.domain && byDomain.set(a.domain, (byDomain.get(a.domain) ?? 0) + 1));
  return {
    articles: articles.length,
    outlets: byDomain.size,
    koreanArticles: articles.filter((a) => (a.language ?? '').toLowerCase() === 'korean').length,
    topOutlets: [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count })),
  };
}

async function news(e: Entity): Promise<EntityPresence['news']> {
  const query = gdeltQuery(e);
  const empty = { articles: 0, outlets: 0, koreanArticles: 0, topOutlets: [] };
  if (!query) return { status: 'no_query', ...empty };
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=250&timespan=3months&sort=datedesc&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25_000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
    const json = text.trim().startsWith('{') ? JSON.parse(text) : { articles: [] }; // 결과 없음·안내문이면 0건
    return { status: 'ok', query, ...summarizeArticles(json.articles ?? []) };
  } catch (err) {
    return { status: 'error', query, error: err instanceof Error ? err.message : String(err), ...empty };
  }
}

/* ---------------- 진단 결과 해석 ---------------- */

export function buildFindings(ents: EntityPresence[]): PresenceResult['findings'] {
  const f: PresenceResult['findings'] = [];
  const brand = ents.find((e) => e.isBrand)!;
  const comps = ents.filter((e) => !e.isBrand);
  const top = (pick: (e: EntityPresence) => number) => comps.reduce<EntityPresence | null>((m, e) => (!m || pick(e) > pick(m) ? e : m), null);

  // YouTube
  if (brand.youtube.status === 'no_key') {
    f.push({ level: 'info', source: 'YouTube', text: 'YOUTUBE_API_KEY가 없어 YouTube 진단을 건너뜀' });
  } else if (brand.youtube.status === 'ok') {
    const c = top((e) => e.youtube.thirdParty);
    if (c && c.youtube.thirdParty > brand.youtube.thirdParty) {
      f.push({ level: 'high', source: 'YouTube', text: `제3자 언급 영상: ${brand.name} ${brand.youtube.thirdParty}개 vs ${c.name} ${c.youtube.thirdParty}개 → 리뷰·비교 영상 확보 필요. AI 영상 인용은 대부분 YouTube 롱폼에서 발생` });
    }
    if (brand.youtube.mentionVideos > 0 && brand.youtube.longForm / brand.youtube.mentionVideos < 0.3) {
      f.push({ level: 'mid', source: 'YouTube', text: `브랜드 언급 영상 중 3분 초과 영상이 ${brand.youtube.longForm}/${brand.youtube.mentionVideos}개 → 쇼츠 위주. 롱폼 설명·리뷰 영상 보강 권장 (콘텐츠 GEO 영상 진단 활용)` });
    }
  }

  // 위키
  if (brand.wikipedia.status === 'ok') {
    if (!brand.wikipedia.ko.exists) {
      const has = comps.filter((e) => e.wikipedia.ko.exists).map((e) => e.name);
      f.push({ level: has.length ? 'high' : 'mid', source: '위키', text: `한국어 위키백과 문서 없음${has.length ? ` (경쟁사 ${has.join(', ')}는 있음)` : ''} → 이름 표기가 다른지 먼저 확인. 위키백과는 이해관계자의 직접 작성을 제한하므로, 언론 보도 등 독립 출처를 먼저 확보하는 것이 순서` });
    } else if (brand.wikipedia.ko.disambiguation) {
      f.push({ level: 'mid', source: '위키', text: `"${brand.wikipedia.ko.title}"이 동음이의 문서로 연결됨 → 다른 표기(정식 회사명 등)를 브랜드 다른 표기에 추가해 재진단` });
    } else if (brand.wikipedia.ko.lastEdited) {
      const days = Math.floor((Date.now() - new Date(brand.wikipedia.ko.lastEdited).getTime()) / 86_400_000);
      if (days > 365) f.push({ level: 'mid', source: '위키', text: `한국어 위키백과 문서가 ${days}일 동안 수정되지 않음 → 내용이 최신인지 점검` });
    }
    if (brand.wikipedia.wikidata && !brand.wikipedia.wikidata.officialWebsite) {
      f.push({ level: 'mid', source: '위키', text: '위키데이터에 공식 웹사이트(P856) 정보 없음 → AI가 브랜드와 공식 사이트를 연결하는 데 쓰이는 정보' });
    }
  }

  // 뉴스
  if (brand.news.status === 'no_query') {
    f.push({ level: 'info', source: '뉴스', text: '뉴스 진단은 영문 표기가 필요함 → 프로젝트 설정의 "브랜드 다른 표기"에 영문 브랜드명 추가' });
  } else if (brand.news.status === 'ok') {
    const c = top((e) => e.news.outlets);
    if (c && c.news.outlets > brand.news.outlets) {
      f.push({ level: 'high', source: '뉴스', text: `최근 3개월 보도 매체 수: ${brand.name} ${brand.news.outlets}곳 vs ${c.name} ${c.news.outlets}곳 → 보도자료 다매체 동시 배포 권장 (단일 게시 대비 인용 중앙값 239% 상승, 팀 점검표)` });
    }
  }
  const failed = [
    ents.some((e) => e.youtube.status === 'error') && 'YouTube',
    ents.some((e) => e.wikipedia.status === 'error') && '위키',
    ents.some((e) => e.news.status === 'error') && '뉴스',
  ].filter(Boolean) as string[];
  if (failed.length) f.push({ level: 'info', source: '수집', text: `${failed.join('·')} 데이터 일부를 가져오지 못함 → 잠시 후 다시 실행. 계속 실패하면 표의 "수집 실패"에 마우스를 올려 오류 내용 확인` });
  if (!f.some((x) => x.level !== 'info') && !failed.length) f.push({ level: 'info', source: '종합', text: '비교 대상 대비 뚜렷하게 뒤처지는 출처 없음' });
  return f;
}

/* ---------------- 실행 ---------------- */

export async function runPresence(p: OffsiteProject): Promise<PresenceResult> {
  const ents: Entity[] = [
    { name: p.brand, aliases: p.brandAliases, isBrand: true },
    ...p.competitors.slice(0, 5).map((c) => ({ name: c.name, aliases: c.aliases, isBrand: false })),
  ];
  // YouTube·위키는 동시에, 뉴스(GDELT)는 요청 간격 권장(약 5초)에 맞춰 순서대로
  const [yt, wk] = await Promise.all([Promise.all(ents.map(youtube)), Promise.all(ents.map(wikipedia))]);
  const nw: EntityPresence['news'][] = [];
  for (let i = 0; i < ents.length; i++) {
    if (i > 0 && gdeltQuery(ents[i])) await sleep(5500);
    nw.push(await news(ents[i]));
  }
  const entities: EntityPresence[] = ents.map((e, i) => ({ name: e.name, isBrand: e.isBrand, youtube: yt[i], wikipedia: wk[i], news: nw[i] }));
  return { projectId: p.id, measuredAt: new Date().toISOString(), entities, findings: buildFindings(entities) };
}
