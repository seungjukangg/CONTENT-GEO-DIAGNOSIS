/**
 * 오프사이트 GEO — 공통 타입·분석 로직 (서버·화면 공통, 외부 패키지 없음)
 * - AI 답변을 붙여 넣으면 출처 URL을 뽑아 도메인을 분류하고,
 *   브랜드 언급률·자사 인용률·출처 유형·텍스트/영상 비율을 계산
 * - 비율에는 95% 신뢰구간(Wilson)을 함께 표시
 */

/* ---------------- 타입 ---------------- */

export interface Competitor { name: string; aliases: string[]; domains: string[] }

export interface OffsiteProject {
  id: string;
  createdAt: string;
  name: string;
  brand: string;
  brandAliases: string[];
  ownedDomains: string[];
  competitors: Competitor[];
  domainLabels: Record<string, Category>; // 사용자가 직접 지정한 도메인 분류
}

export interface Citation { url: string; domain: string }

export interface OffsiteRun {
  id: string;
  projectId: string;
  measuredAt: string;
  engine: string;
  prompt: string;
  answer: string;
  sources: string;
  citations: Citation[];
}

export const ENGINES = [
  'ChatGPT', 'Gemini', 'Google AI 개요', 'Google AI 모드', 'Perplexity', 'Claude', 'Copilot', '네이버 AI 브리핑', '기타',
] as const;

export const CATEGORIES = [
  '자사(Owned)', '경쟁사(Owned)', '언론(Earned)', '리뷰·판매(Third-party)', '커뮤니티·영상(UGC)', '위키(지식베이스)', '미분류',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** 출처 유형별 활용 방법 (팀 오프사이트 GEO 점검표 기반) */
export const CATEGORY_ACTION: Record<Category, string> = {
  '자사(Owned)': '인용되는 자사 페이지를 최신 상태로 유지하고, 같은 구조를 다른 핵심 페이지에도 적용',
  '경쟁사(Owned)': '경쟁사 페이지가 인용되는 질문에 답하는 자사 페이지 마련 (콘텐츠 GEO)',
  '언론(Earned)': '해당 매체에 보도자료 배포·기획 기사 제안. 동일 보도자료를 여러 매체에 동시 배포 시 인용 중앙값 239% 상승',
  '리뷰·판매(Third-party)': '해당 플랫폼의 제품 정보·평점·리뷰 수 점검 및 리뷰 확보. 온라인 평판이 AI 언급 톤에 그대로 반영됨',
  '커뮤니티·영상(UGC)': '해당 커뮤니티의 실사용 후기·YouTube 리뷰 영상 확보 및 부정 여론 모니터링',
  '위키(지식베이스)': '위키 문서의 브랜드·제품 정보가 정확하고 최신인지 점검',
  '미분류': '도메인 성격을 확인해 직접 분류 지정',
};

/* ---------------- 도메인 분류 사전 ---------------- */

const LIST: Record<Exclude<Category, '자사(Owned)' | '경쟁사(Owned)' | '미분류'>, string[]> = {
  '언론(Earned)': [
    'news.naver.com', 'n.news.naver.com', 'v.daum.net', 'news.daum.net', 'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr',
    'khan.co.kr', 'mk.co.kr', 'hankyung.com', 'yna.co.kr', 'newsis.com', 'news1.kr', 'edaily.co.kr', 'mt.co.kr', 'sedaily.com',
    'etnews.com', 'zdnet.co.kr', 'bloter.net', 'asiae.co.kr', 'heraldcorp.com', 'kmib.co.kr', 'seoul.co.kr', 'hankookilbo.com',
    'sbs.co.kr', 'kbs.co.kr', 'imbc.com', 'jtbc.co.kr', 'ytn.co.kr', 'motorgraph.com', 'autodaily.co.kr', 'thebell.co.kr',
    'nytimes.com', 'reuters.com', 'bloomberg.com', 'forbes.com', 'cnn.com', 'bbc.com', 'bbc.co.uk', 'theverge.com', 'techcrunch.com',
    'wired.com', 'cnet.com', 'techradar.com', 'businessinsider.com', 'wsj.com', 'ft.com', 'apnews.com', 'theguardian.com',
    'cnbc.com', 'engadget.com', 'tomsguide.com', 'pcmag.com', 'caranddriver.com', 'motortrend.com', 'topgear.com', 'autocar.co.uk',
  ],
  '리뷰·판매(Third-party)': [
    'coupang.com', 'danawa.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'smartstore.naver.com', 'shopping.naver.com',
    'brand.naver.com', 'ssg.com', 'musinsa.com', 'oliveyoung.co.kr', 'kurly.com', 'lotteon.com', 'wemakeprice.com', 'tmon.co.kr',
    'amazon.com', 'amazon.co.jp', 'amazon.co.uk', 'ebay.com', 'walmart.com', 'bestbuy.com', 'target.com', 'aliexpress.com',
    'g2.com', 'capterra.com', 'trustpilot.com', 'yelp.com', 'tripadvisor.com', 'rtings.com', 'consumerreports.org',
    'tirerack.com', 'adac.de', 'tyrereviews.com', 'nerdwallet.com', 'glowpick.com', 'hwahae.co.kr',
  ],
  '커뮤니티·영상(UGC)': [
    'reddit.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'threads.net',
    'quora.com', 'medium.com', 'linkedin.com', 'pinterest.com', 'cafe.naver.com', 'blog.naver.com', 'kin.naver.com', 'post.naver.com',
    'tv.naver.com', 'cafe.daum.net', 'tistory.com', 'brunch.co.kr', 'velog.io', 'clien.net', 'bobaedream.co.kr', 'dcinside.com',
    'theqoo.net', 'fmkorea.com', 'ruliweb.com', 'ppomppu.co.kr', 'instiz.net', 'mlbpark.donga.com', 'stackoverflow.com', 'github.com',
  ],
  '위키(지식베이스)': ['wikipedia.org', 'namu.wiki', 'wikidata.org', 'terms.naver.com', 'britannica.com'],
};

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'tiktok.com', 'vimeo.com', 'tv.naver.com', 'tv.kakao.com', 'dailymotion.com', 'twitch.tv'];

/* ---------------- 유틸 ---------------- */

export const normDomain = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^(www|m)\./, '');

const matchesDomain = (host: string, d: string) => {
  const n = normDomain(d);
  return !!n && (host === n || host.endsWith('.' + n));
};

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
export { splitList };

/** 붙여 넣은 텍스트에서 출처 URL 추출 (마크다운 링크 포함, 추적 파라미터 제거, 중복 제거) */
export function extractCitations(...texts: string[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  const re = /https?:\/\/[^\s<>"'`)\]}（）]+/gi;
  for (const t of texts) {
    for (const m of t.match(re) ?? []) {
      let raw = m.replace(/[.,;:!?。、]+$/, '');
      try {
        const u = new URL(raw);
        [...u.searchParams.keys()].filter((k) => k.startsWith('utm_')).forEach((k) => u.searchParams.delete(k));
        u.hash = '';
        raw = u.toString().replace(/\?$/, '');
        const domain = normDomain(u.hostname);
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push({ url: raw, domain });
      } catch { /* URL 형식 아님 */ }
    }
  }
  return out;
}

export function classify(c: Citation, p: OffsiteProject): Category {
  const host = c.domain;
  if (p.ownedDomains.some((d) => matchesDomain(host, d))) return '자사(Owned)';
  if (p.competitors.some((x) => x.domains.some((d) => matchesDomain(host, d)))) return '경쟁사(Owned)';
  const label = Object.entries(p.domainLabels ?? {}).find(([d]) => matchesDomain(host, d));
  if (label) return label[1];
  for (const [cat, list] of Object.entries(LIST)) {
    if (list.some((d) => matchesDomain(host, d))) return cat as Category;
  }
  if (/(^|\.)news\.|news|press|times|daily|journal|herald|media/.test(host)) return '언론(Earned)';
  if (/(^|\.)(shop|store|mall)\.|shopping|review/.test(host)) return '리뷰·판매(Third-party)';
  return '미분류';
}

export function mediaType(c: Citation): '영상' | '텍스트' {
  if (VIDEO_HOSTS.some((d) => matchesDomain(c.domain, d))) return '영상';
  if (matchesDomain(c.domain, 'instagram.com') && /\/(reel|reels|tv)\//.test(c.url)) return '영상';
  return '텍스트';
}

export function mentions(text: string, names: string[]): boolean {
  const t = text.toLowerCase();
  return names.map((n) => n.trim().toLowerCase()).filter(Boolean).some((n) => t.includes(n));
}

/** 비율의 95% 신뢰구간 (Wilson score interval) */
export function wilson(k: number, n: number, z = 1.96) {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/* ---------------- 분석 ---------------- */

export interface Rate { k: number; n: number; p: number; lo: number; hi: number }
const rate = (k: number, n: number): Rate => ({ k, n, ...wilson(k, n) });

export interface Analysis {
  n: number;
  promptCount: number;
  engines: { engine: string; n: number; brand: Rate; owned: Rate; video: number; citations: number }[];
  brand: Rate;
  owned: Rate;
  competitors: { name: string; rate: Rate }[];
  totalCitations: number;
  runsWithoutCitations: number;
  categories: { category: Category; count: number; share: number }[];
  media: { video: number; text: number };
  topDomains: {
    domain: string; category: Category; media: '영상' | '텍스트'; citations: number; runs: number; runRate: number;
    engines: string[]; gap: number;
  }[];
  prompts: { prompt: string; n: number; brand: Rate; engines: string[] }[];
  findings: { level: 'high' | 'mid' | 'info'; area: string; text: string }[];
}

export function analyze(p: OffsiteProject, runs: OffsiteRun[]): Analysis {
  const n = runs.length;
  const brandNames = [p.brand, ...p.brandAliases];
  const per = runs.map((r) => {
    const cits = r.citations.map((c) => ({ ...c, category: classify(c, p), media: mediaType(c) }));
    const compMentioned = p.competitors.filter((c) => mentions(r.answer, [c.name, ...c.aliases])).map((c) => c.name);
    return {
      r, cits,
      brand: mentions(r.answer, brandNames),
      owned: cits.some((c) => c.category === '자사(Owned)'),
      compMentioned,
    };
  });

  const allCits = per.flatMap((x) => x.cits.map((c) => ({ ...c, engine: x.r.engine, runId: x.r.id, gapRun: !x.brand && x.compMentioned.length > 0 })));
  const total = allCits.length;

  // 엔진별
  const engineNames = [...new Set(runs.map((r) => r.engine))];
  const engines = engineNames.map((e) => {
    const rs = per.filter((x) => x.r.engine === e);
    const cs = rs.flatMap((x) => x.cits);
    return {
      engine: e, n: rs.length,
      brand: rate(rs.filter((x) => x.brand).length, rs.length),
      owned: rate(rs.filter((x) => x.owned).length, rs.length),
      video: cs.length ? cs.filter((c) => c.media === '영상').length / cs.length : 0,
      citations: cs.length,
    };
  });

  // 출처 유형
  const categories = CATEGORIES.map((category) => {
    const count = allCits.filter((c) => c.category === category).length;
    return { category, count, share: total ? count / total : 0 };
  }).filter((c) => c.count > 0);

  // 도메인별
  const byDomain = new Map<string, typeof allCits>();
  allCits.forEach((c) => byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]));
  const topDomains = [...byDomain.entries()].map(([domain, cs]) => {
    const runIds = new Set(cs.map((c) => c.runId));
    return {
      domain, category: cs[0].category, media: cs[0].media, citations: cs.length,
      runs: runIds.size, runRate: n ? runIds.size / n : 0,
      engines: [...new Set(cs.map((c) => c.engine))],
      gap: new Set(cs.filter((c) => c.gapRun).map((c) => c.runId)).size,
    };
  }).sort((a, b) => b.runs - a.runs || b.citations - a.citations);

  // 프롬프트별
  const promptNames = [...new Set(runs.map((r) => r.prompt.trim()))];
  const prompts = promptNames.map((pr) => {
    const rs = per.filter((x) => x.r.prompt.trim() === pr);
    return { prompt: pr, n: rs.length, brand: rate(rs.filter((x) => x.brand).length, rs.length), engines: [...new Set(rs.map((x) => x.r.engine))] };
  });

  const brand = rate(per.filter((x) => x.brand).length, n);
  const owned = rate(per.filter((x) => x.owned).length, n);
  const competitors = p.competitors.map((c) => ({ name: c.name, rate: rate(per.filter((x) => x.compMentioned.includes(c.name)).length, n) }));
  const video = allCits.filter((c) => c.media === '영상').length;

  /* ----- 해석 규칙 (팀 점검표 ⑤ 기반) ----- */
  const findings: Analysis['findings'] = [];
  if (n < 10) findings.push({ level: 'info', area: '측정', text: `측정 ${n}회로 표본이 작음. 신뢰구간이 넓으므로 프롬프트별로 3회 이상, 전체 30회 이상 측정 후 판단 권장` });
  const runsWithoutCitations = per.filter((x) => x.cits.length === 0).length;
  if (runsWithoutCitations > 0) findings.push({ level: 'info', area: '측정', text: `출처 URL이 없는 답변 ${runsWithoutCitations}회 — 검색 없이 답했거나 출처가 복사되지 않음. 출처가 있었다면 "출처 목록" 칸에 따로 붙여넣기` });
  if (n >= 3) {
    if (owned.k === 0) {
      findings.push({ level: 'high', area: '테크니컬 GEO', text: '자사 사이트가 한 번도 인용되지 않음 → AI 봇 차단·JavaScript 렌더링 등 테크니컬 문제부터 점검 (테크니컬 GEO 탭)' });
    } else if (brand.p < 0.5) {
      findings.push({ level: 'mid', area: '콘텐츠 GEO', text: `자사 사이트는 인용되지만(${pct(owned.p)}) 브랜드 언급률이 ${pct(brand.p)}로 낮음 → 인용된 페이지에 브랜드·제품명이 문장마다 남도록 콘텐츠 보완 (콘텐츠 GEO)` });
    }
    const strongComp = competitors.filter((c) => c.rate.p > brand.p + 0.1).sort((a, b) => b.rate.p - a.rate.p);
    if (strongComp.length) {
      const ext = allCits.filter((c) => ['언론(Earned)', '리뷰·판매(Third-party)', '커뮤니티·영상(UGC)', '위키(지식베이스)'].includes(c.category)).length;
      findings.push({
        level: 'high', area: '오프사이트 GEO',
        text: `${strongComp.map((c) => `${c.name} ${pct(c.rate.p)}`).join(', ')}가 자사(${pct(brand.p)})보다 자주 언급됨. 전체 인용의 ${pct(total ? ext / total : 0)}가 외부 출처 → 아래 "공략 우선순위 도메인"에서 존재감 확보`,
      });
    }
    if (total && video / total >= 0.15) {
      findings.push({ level: 'mid', area: '콘텐츠 GEO', text: `인용 출처의 ${pct(video / total)}가 영상 → 이 주제는 영상(주로 YouTube) 인용 비중이 높음. 콘텐츠 GEO 영상 진단 활용 권장` });
    }
    const uncls = categories.find((c) => c.category === '미분류');
    if (uncls && uncls.share > 0.2) findings.push({ level: 'info', area: '분류', text: `미분류 도메인이 ${pct(uncls.share)} — 도메인 표에서 분류를 지정하면 분석이 정확해짐` });
  }

  return {
    n, promptCount: promptNames.length, engines, brand, owned, competitors, totalCitations: total, runsWithoutCitations,
    categories, media: { video, text: total - video }, topDomains, prompts, findings,
  };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
