/**
 * 테크니컬 GEO 진단 (서버 전용)
 * - URL 하나를 받아 AI 크롤러 관점에서 접근·읽기·색인·이해 항목을 점검
 * - Gemini를 쓰지 않음 → 비용 없음
 * - 판정 기준 중 "임시 기준"으로 표시된 숫자는 팀 점검표·업계 자료 기반의 출발점이며 조정 가능
 */
import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import net from 'net';
import type {
  BotAccess, CheckGroup, CheckResult, CheckStatus, TechnicalResult, WafResult,
} from './src/technicalTypes';

/* ---------------- 설정 ---------------- */

const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

const UA = {
  browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
};

const BOTS: Omit<BotAccess, 'robotsAllowed' | 'matchedRule'>[] = [
  { bot: 'OAI-SearchBot', owner: 'OpenAI', purpose: 'ChatGPT 검색 답변 노출', kind: 'search' },
  { bot: 'ChatGPT-User', owner: 'OpenAI', purpose: '사용자 요청 시 페이지 방문', kind: 'user' },
  { bot: 'GPTBot', owner: 'OpenAI', purpose: '모델 학습 데이터 수집', kind: 'training' },
  { bot: 'Claude-SearchBot', owner: 'Anthropic', purpose: 'Claude 검색 답변 노출', kind: 'search' },
  { bot: 'Claude-User', owner: 'Anthropic', purpose: '사용자 요청 시 페이지 방문', kind: 'user' },
  { bot: 'ClaudeBot', owner: 'Anthropic', purpose: '모델 학습 데이터 수집', kind: 'training' },
  { bot: 'PerplexityBot', owner: 'Perplexity', purpose: 'Perplexity 검색 색인', kind: 'search' },
  { bot: 'Perplexity-User', owner: 'Perplexity', purpose: '사용자 요청 시 페이지 방문', kind: 'user' },
  { bot: 'Googlebot', owner: 'Google', purpose: 'Google 검색·AI 개요·AI 모드 노출', kind: 'search' },
  { bot: 'Google-Extended', owner: 'Google', purpose: 'Gemini 학습·그라운딩 사용 여부 (AI 개요 노출과 무관)', kind: 'training' },
  { bot: 'Bingbot', owner: 'Microsoft', purpose: 'Bing·Copilot 노출 (ChatGPT 검색도 Bing 의존 보고)', kind: 'search' },
  { bot: 'Yeti', owner: 'Naver', purpose: '네이버 검색·AI 브리핑 노출', kind: 'korea' },
];

/* ---------------- 안전한 요청 (내부망 주소 차단) ---------------- */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') ||
    (v.startsWith('::ffff:') && isPrivateIp(v.slice(7)));
}

async function assertPublicUrl(u: URL) {
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('http 또는 https 주소만 진단할 수 있습니다.');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) {
    throw new Error('내부망 주소는 진단할 수 없습니다.');
  }
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => {
    throw new Error(`도메인을 찾을 수 없습니다: ${u.hostname}`);
  });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('내부망 주소는 진단할 수 없습니다.');
}

interface FetchOut {
  status: number | null;
  finalUrl: string;
  redirects: number;
  headers: Headers | null;
  body: string;
  ttfbMs: number | null;
  error?: string;
}

async function safeFetch(url: string, userAgent: string, readBody = true): Promise<FetchOut> {
  let current = new URL(url);
  let redirects = 0;
  const started = Date.now();
  try {
    for (;;) {
      await assertPublicUrl(current);
      const res = await fetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        if (++redirects > MAX_REDIRECTS) throw new Error('리다이렉트가 너무 많습니다.');
        current = new URL(loc, current);
        await res.body?.cancel();
        continue;
      }
      const ttfbMs = Date.now() - started;
      const body = readBody ? (await res.text()).slice(0, 3_000_000) : '';
      if (!readBody) await res.body?.cancel();
      return { status: res.status, finalUrl: current.toString(), redirects, headers: res.headers, body, ttfbMs };
    }
  } catch (e) {
    return {
      status: null, finalUrl: current.toString(), redirects, headers: null, body: '', ttfbMs: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ---------------- robots.txt ---------------- */

interface RobotsGroup { agents: string[]; rules: { allow: boolean; path: string }[] }

export function parseRobots(txt: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (cur && !(key === 'disallow' && val === '')) cur.rules.push({ allow: key === 'allow', path: val });
    } else if (key === 'sitemap') {
      sitemaps.push(val);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : '')).test(path);
}

export function robotsAllows(groups: RobotsGroup[], bot: string, path: string): { allowed: boolean; rule: string } {
  const token = bot.toLowerCase();
  let group = groups.filter((g) => g.agents.includes(token));
  let agentLabel = bot;
  if (!group.length) { group = groups.filter((g) => g.agents.includes('*')); agentLabel = '*'; }
  if (!group.length) return { allowed: true, rule: '해당 규칙 없음' };
  const rules = group.flatMap((g) => g.rules).filter((r) => ruleMatches(r.path, path));
  if (!rules.length) return { allowed: true, rule: `User-agent: ${agentLabel} (차단 규칙 없음)` };
  rules.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  const top = rules[0];
  return { allowed: top.allow, rule: `User-agent: ${agentLabel} → ${top.allow ? 'Allow' : 'Disallow'}: ${top.path}` };
}

/* ---------------- HTML 분석 ---------------- */

export function extractVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, template, iframe, head').remove();
  $('p, div, li, td, th, tr, h1, h2, h3, h4, h5, h6, section, article, header, footer, nav, br, dt, dd, blockquote, figcaption, option, button')
    .each((_, el) => { $(el).append(' '); });
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function collectJsonLd($: cheerio.CheerioAPI) {
  const types: string[] = [];
  const nodes: Record<string, unknown>[] = [];
  let errors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        const obj = n as Record<string, unknown>;
        if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]));
        const t = obj['@type'];
        if (t) {
          (Array.isArray(t) ? t : [t]).forEach((x) => types.push(String(x)));
          nodes.push(obj);
        }
      }
    } catch {
      errors++;
    }
  });
  return { types: [...new Set(types)], nodes, errors, blocks: $('script[type="application/ld+json"]').length };
}

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);
const normUrl = (u: string) => { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return u; } };

/* ---------------- 메인 ---------------- */

export async function runTechnicalDiagnosis(inputUrl: string): Promise<TechnicalResult> {
  let target: URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(inputUrl) && !/^https?:\/\//i.test(inputUrl)) {
    throw new Error('http 또는 https 주소만 진단할 수 있습니다.');
  }
  try {
    target = new URL(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`);
  } catch {
    throw new Error('올바른 URL 형식이 아닙니다.');
  }
  await assertPublicUrl(target);

  const page = await safeFetch(target.toString(), UA.browser);
  if (page.status === null) throw new Error(`페이지에 접속할 수 없습니다: ${page.error}`);

  const final = new URL(page.finalUrl);
  const origin = final.origin;

  // 병렬 요청: robots, llms.txt, 모바일, 봇 UA 4종
  const wafAgents = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'] as const;
  const [robotsRes, llmsRes, mobileRes, ...botRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, UA.browser),
    safeFetch(`${origin}/llms.txt`, UA.browser),
    safeFetch(page.finalUrl, UA.mobile),
    ...wafAgents.map((a) => safeFetch(page.finalUrl, UA[a], false)),
  ]);

  const checks: CheckResult[] = [];
  const add = (c: Omit<CheckResult, 'fix'> & { fix?: string }) =>
    checks.push({ ...c, fix: c.status === 'pass' ? '' : c.fix ?? '' });

  const $ = cheerio.load(page.body);
  const rawText = extractVisibleText(page.body);
  const path = final.pathname + final.search;

  /* ===== 접근 ===== */

  // 1. HTTP 상태
  {
    const ok = page.status >= 200 && page.status < 300;
    add({
      id: 'http_status', group: '접근', name: 'HTTP 상태',
      status: !ok ? 'fail' : page.redirects > 2 ? 'warn' : 'pass',
      summary: `응답 코드 ${page.status}, 리다이렉트 ${page.redirects}회`,
      details: [`최종 URL: ${page.finalUrl}`],
      fix: !ok ? '주요 페이지가 200으로 응답하도록 수정' : '리다이렉트를 1~2회 이내로 줄이기',
      basis: '404·403·5xx 또는 과도한 리다이렉트는 봇이 페이지 접근에 실패하거나 오류 페이지로 판단하게 만듦',
    });
  }

  // 2. robots.txt
  let sitemapsFromRobots: string[] = [];
  const bots: BotAccess[] = [];
  {
    const st = robotsRes.status;
    let groups: RobotsGroup[] = [];
    let note = '';
    if (st === 200) {
      const parsed = parseRobots(robotsRes.body);
      groups = parsed.groups;
      sitemapsFromRobots = parsed.sitemaps;
    } else if (st !== null && st >= 500) {
      note = `robots.txt가 ${st} 오류 → 표준(RFC 9309)상 봇이 사이트 전체를 차단된 것으로 간주할 수 있음`;
    } else {
      note = `robots.txt 없음(${st ?? '접속 실패'}) → 모든 봇 허용으로 간주`;
    }
    for (const b of BOTS) {
      const r = st !== null && st >= 500 ? { allowed: false, rule: 'robots.txt 서버 오류' } : robotsAllows(groups, b.bot, path);
      bots.push({ ...b, robotsAllowed: r.allowed, matchedRule: r.rule });
    }
    const blockedSearch = bots.filter((b) => !b.robotsAllowed && (b.kind === 'search' || b.kind === 'user'));
    const blockedTraining = bots.filter((b) => !b.robotsAllowed && b.kind === 'training');
    const blockedKorea = bots.filter((b) => !b.robotsAllowed && b.kind === 'korea');
    add({
      id: 'robots_ai', group: '접근', name: 'robots.txt AI 봇 허용',
      status: blockedSearch.length ? 'fail' : blockedKorea.length ? 'warn' : 'pass',
      summary: blockedSearch.length
        ? `검색·사용자 요청용 봇 ${blockedSearch.length}개 차단: ${blockedSearch.map((b) => b.bot).join(', ')}`
        : `검색·사용자 요청용 봇 모두 허용${blockedTraining.length ? ` (학습용 ${blockedTraining.map((b) => b.bot).join(', ')} 차단 — 선택 사항)` : ''}`,
      details: [note, ...bots.map((b) => `${b.robotsAllowed ? '허용' : '차단'} · ${b.bot} — ${b.matchedRule}`)].filter(Boolean),
      fix: blockedSearch.length
        ? `robots.txt에서 ${blockedSearch.map((b) => b.bot).join(', ')}의 Disallow 규칙 제거. 학습 차단이 목적이면 GPTBot·ClaudeBot·Google-Extended만 막고 검색용 봇은 허용`
        : 'robots.txt에서 Yeti(네이버) 허용',
      basis: 'OpenAI·Anthropic 모두 봇을 학습용 / 검색용 / 사용자 요청용 3종으로 분리 운영. 검색용 봇을 막으면 해당 AI 검색 답변 후보에서 빠짐. Google-Extended는 Gemini 학습·그라운딩 제어용이며 AI 개요 노출은 Googlebot 기준',
    });
  }

  // 3. CDN/WAF 봇 차단
  const waf: WafResult[] = [];
  {
    const browserOk = page.status >= 200 && page.status < 400;
    wafAgents.forEach((a, i) => {
      const s = botRes[i].status;
      waf.push({ agent: a, status: s, blocked: browserOk && (s === null || [401, 403, 406, 429, 503].includes(s)) });
    });
    const blocked = waf.filter((w) => w.blocked);
    add({
      id: 'waf_block', group: '접근', name: '보안 설정(CDN·WAF)의 AI 봇 차단',
      status: !browserOk ? 'info' : blocked.length ? 'fail' : 'pass',
      summary: !browserOk
        ? '일반 브라우저 요청도 정상 응답이 아니어서 비교 불가'
        : blocked.length
          ? `AI 봇 이름으로 요청 시 ${blocked.map((w) => `${w.agent}(${w.status ?? '응답 없음'})`).join(', ')} 차단`
          : 'AI 봇 이름으로 요청해도 일반 브라우저와 동일하게 응답',
      details: [`일반 브라우저: ${page.status}`, ...waf.map((w) => `${w.agent}: ${w.status ?? '응답 없음'}`),
        '한계: User-Agent 기준 차단만 확인 가능. IP 대역으로 실제 봇을 검증하는 보안 설정은 이 방식으로 잡히지 않음'],
      fix: 'Cloudflare·Akamai 등 보안 설정에서 검증된 AI 검색 봇(OAI-SearchBot, PerplexityBot 등)을 허용 목록에 추가',
      basis: 'robots.txt는 허용했는데 서버 보안 설정이 AI 봇을 403 처리하면 실제로는 수집되지 않음 (팀 테크니컬 GEO 점검표)',
    });
  }

  // 4. 응답 속도
  {
    const t = page.ttfbMs ?? 0;
    add({
      id: 'ttfb', group: '접근', name: '첫 응답 시간(TTFB)',
      status: t <= 800 ? 'pass' : t <= 1800 ? 'warn' : 'fail',
      summary: `${t}ms (기준 800ms 이내)`,
      details: ['측정 위치: 이 진단 서버. 사용자·봇 위치에 따라 달라질 수 있음', '리다이렉트 시간 포함'],
      fix: '서버 캐시·CDN 적용, 서버 렌더링 시간 단축',
      basis: '서버 첫 응답이 느리면 크롤러 수집 우선순위에서 밀릴 수 있음 (팀 테크니컬 GEO 점검표: 800ms 이내)',
    });
  }

  /* ===== 읽기 ===== */

  // 5. 원본 HTML 텍스트
  {
    const len = rawText.length;
    const shell = $('#root, #app, #__next, #__nuxt, #___gatsby').filter((_, el) => $(el).text().trim().length === 0).length > 0;
    const scripts = $('script[src]').length;
    const status: CheckStatus = len < 200 ? 'fail' : len < 800 ? 'warn' : 'pass';
    add({
      id: 'raw_html_text', group: '읽기', name: 'JavaScript 없이 읽히는 본문',
      status,
      summary: `JavaScript 실행 전 HTML의 본문 텍스트 ${len.toLocaleString()}자${shell ? ' · 빈 앱 껍데기(#root 등) 감지' : ''}`,
      details: [
        `외부 스크립트 파일 ${scripts}개`,
        shell ? '본문이 비어 있는 앱 컨테이너가 있어 화면 내용 대부분을 JavaScript로 그리는 구조로 추정' : '',
        '판정: 200자 미만 실패 / 800자 미만 주의 (임시 기준)',
        '아래 "AI 크롤러가 보는 본문"과 실제 화면을 비교해 핵심 정보(제품명·스펙·가격)가 빠졌는지 확인',
      ].filter(Boolean),
      fix: '서버 렌더링(SSR)·정적 생성·프리렌더링으로 핵심 본문을 HTML에 포함',
      basis: 'Vercel·MERJ 로그 분석: OpenAI·Anthropic·Meta·ByteDance·Perplexity 크롤러는 JavaScript를 실행하지 않음(Gemini·AppleBot은 렌더링). Google도 모든 봇이 JS를 실행할 수 없으므로 서버 렌더링을 권장',
    });
  }

  // 6. 모바일·데스크톱 차이
  {
    const mLen = mobileRes.status ? extractVisibleText(mobileRes.body).length : null;
    const dLen = rawText.length;
    const ratio = mLen === null || dLen === 0 ? null : Math.abs(mLen - dLen) / Math.max(mLen, dLen);
    add({
      id: 'mobile_parity', group: '읽기', name: '모바일·데스크톱 본문 차이',
      status: ratio === null ? 'info' : ratio > 0.3 ? 'warn' : 'pass',
      summary: mLen === null ? '모바일 요청 실패로 비교 불가' : `데스크톱 ${dLen.toLocaleString()}자 / 모바일 ${mLen.toLocaleString()}자 (차이 ${Math.round((ratio ?? 0) * 100)}%)`,
      details: ['판정: 차이 30% 초과 시 주의 (임시 기준)'],
      fix: '모바일 페이지에서도 데스크톱과 같은 핵심 정보를 제공',
      basis: '모바일·데스크톱 콘텐츠 차이가 크면 일부 환경에서 핵심 정보가 누락될 수 있음 (팀 테크니컬 GEO 점검표)',
    });
  }

  // 7. 이미지·PDF 의존
  {
    const imgs = $('img');
    const noAlt = imgs.filter((_, el) => !($(el).attr('alt') ?? '').trim()).length;
    const pdfs = $('a[href$=".pdf"], a[href*=".pdf?"]').length;
    const heavy = imgs.length >= 5 && rawText.length < 800;
    add({
      id: 'text_in_media', group: '읽기', name: '이미지·PDF 의존도',
      status: heavy || (imgs.length > 0 && noAlt / imgs.length > 0.5) ? 'warn' : 'pass',
      summary: `이미지 ${imgs.length}개 (대체 텍스트 없음 ${noAlt}개) · PDF 링크 ${pdfs}개`,
      details: [heavy ? '이미지는 많고 본문 텍스트는 적음 → 정보가 이미지 안에 있을 가능성' : '', '스펙·수치가 이미지·PDF 안에만 있는지는 직접 확인 필요'].filter(Boolean),
      fix: '이미지·PDF 속 스펙과 수치를 HTML 텍스트·표로도 제공하고, 이미지에 대체 텍스트(alt) 작성',
      basis: 'Google: 중요한 콘텐츠는 텍스트로 제공. Microsoft: 핵심 정보를 이미지에만 두지 말고, 헤딩 없는 PDF 대신 HTML 사용',
    });
  }

  /* ===== 색인 ===== */

  // 8. noindex
  {
    const metaRobots = $('meta[name="robots"], meta[name="googlebot"], meta[name="bingbot"]').map((_, el) => $(el).attr('content') ?? '').get().join(', ');
    const xRobots = page.headers?.get('x-robots-tag') ?? '';
    const noindex = /noindex/i.test(metaRobots) || /noindex/i.test(xRobots);
    add({
      id: 'indexable', group: '색인', name: '색인 허용 (noindex)',
      status: noindex ? 'fail' : 'pass',
      summary: noindex ? '검색 색인 제외(noindex) 설정이 있음' : '색인 제외 설정 없음',
      details: [`meta robots: ${metaRobots || '없음'}`, `X-Robots-Tag 헤더: ${xRobots || '없음'}`],
      fix: '공개해야 할 페이지라면 noindex 제거',
      basis: '수집은 됐더라도 noindex가 있으면 검색 결과·AI 검색 후보에 들어가지 못함',
    });
  }

  // 9. canonical
  {
    const cans = $('link[rel="canonical"]').map((_, el) => $(el).attr('href') ?? '').get().filter(Boolean);
    const abs = cans.map((c) => { try { return new URL(c, final).toString(); } catch { return c; } });
    const same = abs.length === 1 && normUrl(abs[0]) === normUrl(page.finalUrl);
    add({
      id: 'canonical', group: '색인', name: '대표 URL (canonical)',
      status: cans.length === 0 ? 'warn' : cans.length > 1 ? 'fail' : same ? 'pass' : 'warn',
      summary: cans.length === 0 ? 'canonical 태그 없음' : cans.length > 1 ? `canonical이 ${cans.length}개로 충돌` : same ? '자기 자신을 대표 URL로 지정' : '다른 URL을 대표로 지정',
      details: abs.map((c) => `canonical: ${c}`),
      fix: cans.length > 1 ? 'canonical을 1개만 남기기' : cans.length === 0 ? '<link rel="canonical" href="현재 페이지 URL"> 추가' : '다른 URL을 가리키는 것이 의도한 설정인지 확인',
      basis: '같은 내용의 URL이 여러 개일 때 대표가 불명확하면 검색엔진이 어떤 페이지를 인용할지 혼란',
    });
  }

  // 10. sitemap
  {
    const candidates = sitemapsFromRobots.length ? sitemapsFromRobots : [`${origin}/sitemap.xml`];
    const sm = await safeFetch(candidates[0], UA.browser);
    const valid = sm.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(sm.body);
    const urlCount = (sm.body.match(/<loc>/gi) ?? []).length;
    const lastmods = [...sm.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map((m) => new Date(m[1].trim())).filter((d) => !isNaN(+d));
    const newest = lastmods.length ? new Date(Math.max(...lastmods.map(Number))) : null;
    add({
      id: 'sitemap', group: '색인', name: 'XML 사이트맵',
      status: valid ? 'pass' : 'warn',
      summary: valid ? `사이트맵 확인 (${urlCount.toLocaleString()}개 항목)` : '사이트맵을 찾지 못함',
      details: [
        `확인 위치: ${candidates[0]}${sitemapsFromRobots.length ? ' (robots.txt에 명시)' : ' (기본 위치)'}`,
        newest ? `가장 최근 lastmod: ${newest.toISOString().slice(0, 10)} (${daysSince(newest)}일 전)` : '',
      ].filter(Boolean),
      fix: 'XML 사이트맵을 만들고 robots.txt에 "Sitemap: URL" 한 줄 추가',
      basis: '사이트맵이 없으면 신규·주요 페이지 발견이 느려지거나 누락될 수 있음',
    });
  }

  // 11. 검색엔진 등록 흔적
  {
    const ver = {
      Google: $('meta[name="google-site-verification"]').length > 0,
      'Bing(Copilot)': $('meta[name="msvalidate.01"]').length > 0,
      네이버: $('meta[name="naver-site-verification"]').length > 0,
    };
    add({
      id: 'webmaster', group: '색인', name: '검색엔진 등록 흔적',
      status: 'info',
      summary: Object.entries(ver).map(([k, v]) => `${k} ${v ? '확인' : '미확인'}`).join(' · '),
      details: ['HTML 메타 태그 방식으로 인증한 경우만 감지됨. DNS·파일 방식 인증은 각 도구에서 직접 확인 필요'],
      fix: 'Bing Webmaster Tools·네이버 서치어드바이저 등록 여부를 직접 확인',
      basis: 'Copilot은 Bing 기반이며 ChatGPT 검색도 Bing 의존이 널리 보고됨. 네이버 AI 브리핑 대응에는 네이버 서치어드바이저 등록 필요',
    });
  }

  // 12. hreflang
  {
    const hl = $('link[rel="alternate"][hreflang]').map((_, el) => $(el).attr('hreflang')).get();
    add({
      id: 'hreflang', group: '색인', name: '국가·언어별 페이지 연결 (hreflang)',
      status: 'info',
      summary: hl.length ? `hreflang ${hl.length}개: ${hl.slice(0, 8).join(', ')}` : 'hreflang 없음 (단일 언어 사이트면 문제 없음)',
      details: [],
      fix: '국가·언어별 사이트가 있으면 hreflang으로 서로 연결',
      basis: '국가별 페이지 관계가 불명확하면 엉뚱한 국가 페이지가 인용되거나 신호가 분산됨',
    });
  }

  /* ===== 이해 ===== */

  const ld = collectJsonLd($);

  // 13. JSON-LD
  {
    add({
      id: 'schema_jsonld', group: '이해', name: '구조화 데이터 (JSON-LD)',
      status: ld.types.length === 0 ? 'fail' : ld.errors ? 'warn' : 'pass',
      summary: ld.types.length ? `${ld.types.join(', ')}` : 'JSON-LD 구조화 데이터 없음',
      details: [`JSON-LD 블록 ${ld.blocks}개`, ld.errors ? `형식 오류 ${ld.errors}개` : '', `Microdata 요소 ${$('[itemscope]').length}개`].filter(Boolean),
      fix: ld.errors ? 'JSON-LD 형식 오류 수정 (Schema Markup Validator로 확인)' : 'Organization·Product·FAQPage 등 페이지에 맞는 JSON-LD 추가',
      basis: 'Bing은 Schema가 자사 LLM의 콘텐츠 이해를 돕는다고 밝힘. 반면 Google은 AI 개요에 별도 요구사항이 없으며 구조화 데이터는 화면 내용과 일치해야 한다고 안내',
    });
  }

  // 14. Schema 세부 항목
  {
    const has = (t: string) => ld.nodes.filter((n) => ([] as unknown[]).concat(n['@type']).map(String).includes(t));
    const org = has('Organization');
    const prod = has('Product');
    const items: { label: string; ok: boolean; relevant: boolean }[] = [
      { label: 'Organization.sameAs (위키·SNS 연결)', ok: org.some((n) => n.sameAs), relevant: org.length > 0 },
      { label: 'Product.brand', ok: prod.some((n) => n.brand), relevant: prod.length > 0 },
      { label: 'Product.additionalProperty (스펙)', ok: prod.some((n) => n.additionalProperty), relevant: prod.length > 0 },
      { label: 'dateModified', ok: ld.nodes.some((n) => n.dateModified), relevant: ld.nodes.length > 0 },
    ];
    const relevant = items.filter((i) => i.relevant);
    const missing = relevant.filter((i) => !i.ok);
    add({
      id: 'schema_detail', group: '이해', name: 'Schema 세부 항목',
      status: relevant.length === 0 ? 'info' : missing.length ? 'warn' : 'pass',
      summary: relevant.length === 0 ? '점검할 Schema 유형 없음' : missing.length ? `누락: ${missing.map((m) => m.label).join(', ')}` : '주요 세부 항목 모두 있음',
      details: relevant.map((i) => `${i.ok ? '있음' : '없음'} · ${i.label}`),
      fix: '누락된 속성 추가 (sameAs로 위키·공식 SNS 연결, Product에 brand·규격 정보)',
      basis: 'AI가 브랜드 엔티티를 외부 정보와 연결하는 데 도움 (팀 점검표: LLM 직접 효과는 미검증)',
    });
  }

  // 15. 페이지 구조
  {
    const title = $('title').first().text().trim();
    const h1 = $('h1').length;
    const h2 = $('h2').length;
    add({
      id: 'structure', group: '이해', name: '페이지 구조 (제목·헤딩·표)',
      status: !title || h1 === 0 ? 'fail' : h1 > 1 || h2 === 0 ? 'warn' : 'pass',
      summary: `title ${title ? '있음' : '없음'} · H1 ${h1}개 · H2 ${h2}개 · 표 ${$('table').length}개 · 목록 ${$('ul, ol').length}개`,
      details: [title ? `title: ${title.slice(0, 80)}` : '', 'JavaScript 실행 전 HTML 기준'].filter(Boolean),
      fix: 'H1 1개 + 주제별 H2로 섹션 구분, 비교 정보는 HTML 표로 제공',
      basis: 'Microsoft: 목록·번호 단계·비교표로 정보를 재사용 가능한 조각으로 나눌 것 권고. 구조가 불명확하면 기계가 주제와 세부 정보를 파악하기 어려움',
    });
  }

  // 16. 메타 정보
  {
    const desc = $('meta[name="description"]').attr('content')?.trim() ?? '';
    const ogt = $('meta[property="og:title"]').attr('content') ?? '';
    const ogd = $('meta[property="og:description"]').attr('content') ?? '';
    const missing = [!desc && 'meta description', !ogt && 'og:title', !ogd && 'og:description'].filter(Boolean) as string[];
    add({
      id: 'meta', group: '이해', name: '메타 설명·OG 태그',
      status: missing.length === 0 ? 'pass' : desc ? 'warn' : 'fail',
      summary: missing.length ? `누락: ${missing.join(', ')}` : '모두 있음',
      details: desc ? [`description: ${desc.slice(0, 120)}`] : [],
      fix: '페이지 핵심을 1~2문장으로 요약한 meta description과 OG 태그 추가',
      basis: '페이지 요약 정보는 검색엔진·AI가 페이지 주제를 파악하는 기본 신호',
    });
  }

  // 17. 최신성
  {
    const cands: { src: string; d: Date }[] = [];
    ld.nodes.forEach((n) => (['dateModified', 'datePublished'] as const).forEach((k) => {
      if (n[k]) { const d = new Date(String(n[k])); if (!isNaN(+d)) cands.push({ src: `JSON-LD ${k}`, d }); }
    }));
    ['article:modified_time', 'og:updated_time', 'article:published_time'].forEach((p) => {
      const v = $(`meta[property="${p}"]`).attr('content');
      if (v) { const d = new Date(v); if (!isNaN(+d)) cands.push({ src: p, d }); }
    });
    const lm = page.headers?.get('last-modified');
    if (lm) { const d = new Date(lm); if (!isNaN(+d)) cands.push({ src: 'Last-Modified 헤더', d }); }
    const newest = cands.sort((a, b) => +b.d - +a.d)[0];
    const days = newest ? daysSince(newest.d) : null;
    add({
      id: 'freshness', group: '이해', name: '최신성 (수정일 표기)',
      status: days === null ? 'warn' : days <= 30 ? 'pass' : days <= 90 ? 'warn' : 'fail',
      summary: newest ? `최근 수정 ${newest.d.toISOString().slice(0, 10)} (${days}일 전, ${newest.src})` : '기계가 읽을 수 있는 수정일 정보 없음',
      details: ['판정: 30일 이내 통과 / 90일 이내 주의 / 그 이상 실패', 'Last-Modified 헤더는 서버가 매 요청 현재 시각을 넣는 경우가 있어 참고용'],
      fix: '핵심 페이지를 30일 이내 주기로 갱신하고, 화면 수정일과 JSON-LD dateModified를 일치시키기',
      basis: '핵심 페이지 30일 이내 갱신 시 인용 3.2배, 3개월 이상 방치 시 위험 (팀 점검표). Ahrefs: AI가 인용한 콘텐츠는 일반 검색 결과보다 평균 25.7% 더 최신',
    });
  }

  // 18. llms.txt
  {
    const ok = llmsRes.status === 200 && llmsRes.body.trim().length > 0 && !/<html/i.test(llmsRes.body.slice(0, 500));
    add({
      id: 'llms_txt', group: '이해', name: 'llms.txt',
      status: 'info',
      summary: ok ? 'llms.txt 있음' : 'llms.txt 없음',
      details: [],
      fix: '우선순위 낮음 — 다른 항목을 먼저 개선',
      basis: '주요 AI 엔진이 사용한다고 공식 확인된 바 없음. 존재 여부만 기록 (팀 점검표)',
    });
  }

  const groupsOrder: CheckGroup[] = ['접근', '읽기', '색인', '이해'];
  return {
    inputUrl,
    finalUrl: page.finalUrl,
    fetchedAt: new Date().toISOString(),
    checks,
    bots,
    waf,
    rawTextPreview: rawText.slice(0, 1200),
    rawTextLength: rawText.length,
    groups: groupsOrder.map((g) => {
      const cs = checks.filter((c) => c.group === g);
      return {
        group: g,
        pass: cs.filter((c) => c.status === 'pass').length,
        warn: cs.filter((c) => c.status === 'warn').length,
        fail: cs.filter((c) => c.status === 'fail').length,
        info: cs.filter((c) => c.status === 'info').length,
      };
    }),
    manual: [
      { item: '서버 로그의 실제 봇 방문 기록', how: '서버·CDN 로그에서 GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot 방문 여부 확인 (허용 후 실제 수집되는지 확인용)' },
      { item: 'Bing 색인·IndexNow', how: 'Bing Webmaster Tools에서 주요 페이지 색인 여부, IndexNow 적용 여부 확인' },
      { item: '네이버 서치어드바이저', how: '사이트 등록, 사이트맵 제출, Yeti 수집 현황 확인' },
      { item: '내부 링크', how: '핵심 페이지가 메인·카테고리 페이지에서 링크로 연결되는지, 고립된 페이지가 없는지 확인' },
      { item: '중복 콘텐츠', how: '국가·언어·URL별로 거의 같은 페이지가 여러 개 있는지 확인' },
      { item: 'CSP 보안 헤더', how: '과도한 보안 설정이 크롤러의 폰트·스크립트·CSS 로딩을 막는지 확인' },
    ],
  };
}
