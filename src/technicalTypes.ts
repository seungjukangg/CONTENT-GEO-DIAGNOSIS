/**
 * 테크니컬 GEO 진단 결과 타입 (서버·화면 공통)
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export type CheckGroup = '접근' | '읽기' | '색인' | '이해';

export const GROUP_DESC: Record<CheckGroup, string> = {
  접근: 'AI 봇이 페이지에 들어올 수 있는가 (Crawling)',
  읽기: '들어온 봇이 본문 텍스트를 읽을 수 있는가 (JavaScript 렌더링·텍스트)',
  색인: '읽은 페이지를 검색 후보에 넣을 수 있는가 (Indexing)',
  이해: '무엇에 대한 페이지인지 기계가 이해할 수 있는가 (구조화 데이터·구조·최신성)',
};

export interface CheckResult {
  id: string;
  group: CheckGroup;
  name: string;
  status: CheckStatus;
  summary: string;     // 한 줄 결과
  details: string[];   // 세부 근거 (측정값)
  fix: string;         // 개선 방법 (pass면 빈 문자열)
  basis: string;       // 왜 중요한가 (출처)
}

export interface BotAccess {
  bot: string;
  owner: string;
  purpose: string;
  kind: 'search' | 'training' | 'user' | 'korea';
  robotsAllowed: boolean;
  matchedRule: string;
}

export interface WafResult {
  agent: string;
  status: number | null;
  blocked: boolean;
}

export interface TechnicalResult {
  inputUrl: string;
  finalUrl: string;
  fetchedAt: string;
  checks: CheckResult[];
  bots: BotAccess[];
  waf: WafResult[];
  rawTextPreview: string;
  rawTextLength: number;
  groups: { group: CheckGroup; pass: number; warn: number; fail: number; info: number }[];
  manual: { item: string; how: string }[];
}
