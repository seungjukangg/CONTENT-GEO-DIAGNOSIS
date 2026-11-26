/**
 * GEO 영상 진단 기준 (서버·화면 공통)
 * - 기준 코드(A, K, B, C1 ...)는 팀 GEO 점검표 코드와 동일하게 맞춤
 * - 점수 합산·수치 개수(D1)는 AI가 아니라 이 파일의 코드가 계산함
 */

export type Stage = 'Crawling/indexing' | 'Retrieval' | 'Reranking-추출성' | 'Reranking-신뢰성';
export type Platform = 'youtube_long' | 'youtube_shorts' | 'reels' | 'tiktok' | 'other';
export type Score = 0 | 1 | 2;

export interface Criterion {
  code: string;
  name: string;
  stage: Stage;
  scale: string;      // 0/1/2 판정 기준
  videoCheck: string; // 영상에서 무엇을 보는가
  basis: string;      // 근거
  scoredBy: 'ai' | 'code';
}

export const CRITERIA: Criterion[] = [
  {
    code: 'A', name: '프롬프트 대응', stage: 'Retrieval', scoredBy: 'code',
    scale: '질문별 0 답하는 구간 없음 / 1 관련 언급이 흩어져 있음 / 2 질문에 바로 답하는 구간 있음 → 평균',
    videoCheck: '입력한 소비자 프롬프트마다 그 답이 되는 발화 구간이 있는가',
    basis: 'Google AI 모드는 질문을 하위 주제로 쪼개 여러 검색을 동시에 실행(query fan-out) → 하위 질문마다 매칭될 콘텐츠 필요. Bing은 "사람들이 검색하는 방식 그대로의 질문 + 명확한 답" 구조 권고',
  },
  {
    code: 'K', name: 'KBF 커버리지', stage: 'Retrieval', scoredBy: 'code',
    scale: '기준별 0 언급 없음 / 1 형용사만("조용한") / 2 수치·조건 있음 → 평균 (KBF 미입력 시 제외)',
    videoCheck: '소비자가 실제로 비교하는 KBF를 수치로 말하는가',
    basis: '통계 추가 시 생성형 엔진 가시성 +30.6% (KDD 2024 GEO 논문). Microsoft: "innovative" 대신 측정 가능한 사실 권고',
  },
  {
    code: 'B', name: '텍스트 접근성', stage: 'Crawling/indexing', scoredBy: 'ai',
    scale: '0 핵심 정보가 화면 자막·이미지에만 있음 / 1 일부만 음성으로 말함 / 2 핵심 정보를 음성으로도 말함',
    videoCheck: 'AI 엔진이 읽는 것은 주로 음성 스크립트(자동 자막)·제목·설명란이므로, 핵심 정보가 음성으로 나오는가',
    basis: 'Google: 중요한 콘텐츠를 텍스트 형태로 제공할 것. Microsoft: 핵심 정보를 이미지에만 두지 말 것',
  },
  {
    code: 'C1', name: '결론 먼저', stage: 'Reranking-추출성', scoredBy: 'ai',
    scale: '0 첫 구간이 분위기·감탄뿐 / 1 답이 늦게 나옴 / 2 첫 1~2문장이 질문의 답이 됨',
    videoCheck: '후킹 구간과 각 구간의 첫 문장이 그대로 답변으로 쓰일 수 있는가',
    basis: 'Microsoft: AI는 콘텐츠를 작은 조각으로 파싱해 질문에 직접 답하는 1~2문장을 우선 사용. GEO 실험: 이해하기 쉬운 표현 +14.0%, 유창성 개선 +28.0%',
  },
  {
    code: 'C2', name: '문장 독립성', stage: 'Reranking-추출성', scoredBy: 'ai',
    scale: '0 "이거/이 제품" 등 지시어 위주 / 1 혼재 / 2 문장마다 브랜드·제품명이 남음',
    videoCheck: '한 문장만 떼어 가도 무엇에 대한 말인지 알 수 있는가',
    basis: 'Microsoft: 맥락에서 떼어내도 뜻이 통하는 문장이 스니펫 후보. Anthropic: 주체가 빠진 청크는 검색 실패, 맥락 추가 시 실패율 35% 감소',
  },
  {
    code: 'E', name: '구조', stage: 'Reranking-추출성', scoredBy: 'ai',
    scale: '0 구분 없는 흐름 / 1 일부 구분 / 2 단계·비교·질문-답 단위로 나뉘어 챕터화 가능',
    videoCheck: '단계·비교·질문-답 단위로 나뉘어 챕터(타임스탬프)를 붙일 수 있는가',
    basis: 'Microsoft: 목록·번호 단계·비교표·FAQ 형식으로 재사용 가능한 조각을 만들 것 권고',
  },
  {
    code: 'F', name: '엔티티 표기', stage: 'Retrieval', scoredBy: 'ai',
    scale: '0 없음 / 1 브랜드 또는 제품명만 / 2 브랜드+제품명+카테고리를 한 문장에 말함',
    videoCheck: '"브랜드 + 제품명 + 카테고리"를 한 문장에 함께 말하는가',
    basis: 'Microsoft: 대상+카테고리+수치가 함께 있는 구체적 표현 권고. 경쟁사 대비 누락된 엔티티가 AI 답변 공백으로 이어짐(iPullRank)',
  },
  {
    code: 'D1', name: '수치 개수', stage: 'Reranking-신뢰성', scoredBy: 'code',
    scale: '단위가 붙은 수치 0개 → 0 / 1~2개 → 1 / 3개 이상 → 2 (임시 기준)',
    videoCheck: '음성·자막에 단위가 붙은 수치(%, dB, km, 시간 등)가 몇 개인가',
    basis: 'KDD 2024 GEO 논문: 통계 추가 +30.6%, 키워드 스터핑 −8.3%',
  },
  {
    code: 'D2', name: '제3자 근거', stage: 'Reranking-신뢰성', scoredBy: 'ai',
    scale: '0 없음 / 1 출처 없이 "인증받은" 수준 / 2 인증명·수상명·테스트 기관 등 출처를 밝힘',
    videoCheck: '인증·수상·독립 테스트·전문가 의견을 출처와 함께 말하는가',
    basis: 'KDD 2024 GEO 논문: 권위 있는 인용문 추가 +41.0%, 출처 인용 +27.5%. Chen 2025: AI 검색은 자사·소셜보다 제3자 출처를 선호',
  },
  {
    code: 'G', name: '최신성', stage: 'Reranking-신뢰성', scoredBy: 'ai',
    scale: '0 시점 정보 없음 / 1 간접 언급("신제품") / 2 연식·출시 시점·기준일을 명시',
    videoCheck: '연식·출시 시점·데이터 기준일을 말하는가',
    basis: 'Ahrefs(인용 1,697.5만 건): AI가 인용한 콘텐츠는 구글 일반 검색 결과보다 평균 25.7% 더 최신',
  },
  {
    code: 'T', name: '중립적 사실 톤', stage: 'Reranking-신뢰성', scoredBy: 'ai',
    scale: '0 홍보 문구 위주 / 1 혼재 / 2 사실 서술 위주',
    videoCheck: '"최고의", "역대급" 같은 홍보 문구 대신 사실을 서술하는가',
    basis: '홍보 톤은 AI 인용과 −26.19% 상관 (팀 Content GEO 점검표)',
  },
];

export const STAGES: Stage[] = ['Crawling/indexing', 'Retrieval', 'Reranking-추출성', 'Reranking-신뢰성'];

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube_long: 'YouTube 롱폼',
  youtube_shorts: 'YouTube Shorts',
  reels: 'Instagram Reels',
  tiktok: 'TikTok',
  other: '기타',
};

export const PLATFORM_NOTE: Record<Platform, string> = {
  youtube_long: 'AI 영상 인용의 약 94%가 YouTube 롱폼으로 감(5WPR AI Video Citation Index 2026). 이 영상 자체가 인용 대상이 될 수 있는 형식임.',
  youtube_shorts: 'YouTube Shorts의 AI 영상 인용 비중은 5.7% 수준임. 같은 스크립트를 롱폼 영상 또는 자사 페이지 텍스트로도 게시하는 것을 권장함.',
  reels: 'Instagram Reels의 AI 영상 인용 비중은 1% 미만임. 영상 자체보다 아래 "텍스트화 패키지"를 YouTube 롱폼 설명란·자사 페이지에 게시해야 인용 대상이 됨.',
  tiktok: 'TikTok의 AI 영상 인용 비중은 1% 미만임. 영상 자체보다 아래 "텍스트화 패키지"를 YouTube 롱폼 설명란·자사 페이지에 게시해야 인용 대상이 됨.',
  other: '해당 플랫폼의 AI 인용 비중 데이터는 확인되지 않음.',
};

/* ---------- 입력·출력 타입 ---------- */

export interface DiagnoseInput {
  brand: string;
  product: string;
  category: string;
  questions: string[];
  kbfs: string[];
  platform: Platform;
}

export interface Evidence { time: string; quote: string; }
export interface TranscriptLine { start: string; source: '나레이션' | '화면자막' | '둘다'; text: string; }

export interface RawResult {
  transcript: TranscriptLine[];
  hook: { timeRange: string; text: string; problems: string[]; improved: { text: string; whatChanged: string }[] };
  criteria: { code: string; score: number; evidence: Evidence[]; reason: string; fix: string }[];
  questionCoverage: { question: string; score: number; time: string; note: string }[];
  kbfCoverage: { kbf: string; score: number; note: string }[];
  rewrites: { time: string; original: string; issues: string[]; rewritten: string }[];
  textPackage: {
    title: string;
    descriptionLead: string;
    chapters: { time: string; title: string }[];
    faq: { q: string; a: string }[];
  };
}

export interface ScoredCriterion extends Criterion {
  score: Score | null; // null = 평가 제외
  evidence: Evidence[];
  reason: string;
  fix: string;
}

export interface DiagnoseResult extends Omit<RawResult, 'criteria'> {
  criteria: ScoredCriterion[];
  stages: { stage: Stage; score: number; max: number }[];
  total: number;
  max: number;
  metrics: {
    numbersFound: string[];
    demonstratives: string[];
    brandMentions: number;
    screenOnlyLines: number;
    totalLines: number;
  };
  platform: Platform;
  platformNote: string;
  model: string;
}

/* ---------- 프롬프트 ---------- */

export function buildPrompt(input: DiagnoseInput): string {
  const aiCriteria = CRITERIA.map(
    (c) => `- ${c.code} ${c.name}: ${c.videoCheck}\n  판정: ${c.scale}`
  ).join('\n');

  return `당신은 GEO(생성형 AI 검색 최적화) 진단가입니다. 첨부된 영상이 ChatGPT·Gemini·Perplexity 같은 AI 답변에 인용되기 좋은 상태인지 아래 기준으로 진단하세요.

[진단 대상]
- 브랜드: ${input.brand || '(미입력)'}
- 제품명: ${input.product || '(미입력)'}
- 카테고리: ${input.category || '(미입력)'}
- 게시 플랫폼: ${PLATFORM_LABEL[input.platform]}
- 소비자가 AI에 물을 소비자 프롬프트:
${input.questions.length ? input.questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n') : '  (미입력 — 영상 내용으로 소비자가 물을 법한 질문 3개를 직접 설정해 questionCoverage에 사용)'}
- KBF: ${input.kbfs.length ? input.kbfs.join(', ') : '(미입력 — kbfCoverage는 빈 배열로)'}

[전제]
AI 검색 엔진은 영상 화면을 보지 않고, 주로 음성 스크립트(자동 자막)·제목·설명란 텍스트를 읽고 인용합니다. 화면에만 박힌 자막·이미지 속 글자는 인용되기 어렵다고 보고 판정하세요.

[진단 기준]
${aiCriteria}

[작업]
1. transcript: 0초부터 끝까지 모든 나레이션과 화면 자막을 시간순으로 전사. start는 "mm:ss". source는 음성만이면 "나레이션", 화면 글자만이면 "화면자막", 음성과 화면에 같은 내용이면 "둘다".
2. hook: 첫 후킹 구간(보통 0~3초)의 원문, AI 인용 관점의 문제점, 개선안 2~3개.
   개선안은 시청 유지 기능은 유지하되, 첫 문장이 소비자 프롬프트의 답이 되고 브랜드+제품명+카테고리가 함께 들어가게 작성. whatChanged에는 어떤 기준(C1, F, D1 등)을 어떻게 고쳤는지 적기.
3. criteria: 위 기준 코드 전부(A, K, B, C1, C2, E, F, D1, D2, G, T)에 대해 score(정수 0·1·2), evidence(시간 + 영상 원문 그대로 인용), reason, fix 작성. 근거가 없으면 score 0, evidence는 빈 배열.
4. questionCoverage: 소비자 프롬프트마다 score(0·1·2), 답이 나오는 시간(없으면 "-"), note.
5. kbfCoverage: KBF마다 score(0·1·2)와 note.
6. rewrites: AI 인용 관점에서 고칠 문장 3~6개. original(원문 그대로), issues(해당 기준 코드 포함), rewritten(고친 문장).
7. textPackage: AI가 실제로 읽는 텍스트로 옮길 패키지. 제목(질문형 또는 "브랜드 제품명 카테고리" 포함), 설명란 첫 2문장(결론 먼저), 챕터(시간 + 제목), FAQ 3개(소비자 프롬프트 기반, 답은 1~2문장).

[규칙]
- 영상에 없는 수치·인증·수상·테스트 결과를 절대 지어내지 마세요. 필요하면 [실측 수치], [인증명], [테스트 기관]처럼 빈칸으로 표시하세요.
- evidence.quote와 rewrites.original은 영상 원문을 그대로 옮기세요.
- 설명(reason, fix, note, problems)은 한국어 개조식("~함", "~임")으로 간결하게 쓰세요.`;
}

/* ---------- 후처리: 점수 계산은 코드가 담당 ---------- */

const NUMBER_RE =
  /\d+(?:[.,]\d+)?\s?(?:%|퍼센트|dB|데시벨|km|㎞|cm|mm|m|kg|g|ml|mL|L|리터|만\s?원|원|배|시간|분|초|년|개월|일|도|℃|kWh|Wh|W|mAh|인치|개|회|명|위|단계|가지)/g;
const DEMONSTRATIVE_RE = /(이거|이건|요거|요건|이 제품|이 기술|이 브랜드|이것|얘는|얘가)/g;

const clamp = (n: unknown): Score => {
  const v = Math.round(Number(n));
  return (v <= 0 || Number.isNaN(v) ? 0 : v >= 2 ? 2 : 1) as Score;
};
const avgScore = (xs: number[]): Score | null =>
  xs.length ? clamp(xs.reduce((a, b) => a + clamp(b), 0) / xs.length) : null;

export function postProcess(raw: RawResult, input: DiagnoseInput, model: string): DiagnoseResult {
  const transcript = Array.isArray(raw.transcript) ? raw.transcript : [];
  const allText = transcript.map((l) => l.text).join('\n');

  const numbersFound = allText.match(NUMBER_RE) ?? [];
  const demonstratives = allText.match(DEMONSTRATIVE_RE) ?? [];
  const brandMentions = input.brand
    ? (allText.toLowerCase().match(new RegExp(input.brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
    : 0;
  const screenOnlyLines = transcript.filter((l) => l.source === '화면자막').length;

  const questionCoverage = Array.isArray(raw.questionCoverage) ? raw.questionCoverage : [];
  const kbfCoverage = input.kbfs.length && Array.isArray(raw.kbfCoverage) ? raw.kbfCoverage : [];
  const aiByCode = new Map((raw.criteria ?? []).map((c) => [String(c.code).toUpperCase(), c]));

  const criteria: ScoredCriterion[] = CRITERIA.map((c) => {
    const ai = aiByCode.get(c.code);
    let score: Score | null;
    if (c.code === 'A') score = avgScore(questionCoverage.map((q) => q.score));
    else if (c.code === 'K') score = avgScore(kbfCoverage.map((k) => k.score));
    else if (c.code === 'D1') score = numbersFound.length === 0 ? 0 : numbersFound.length <= 2 ? 1 : 2;
    else score = ai ? clamp(ai.score) : null;

    let reason = ai?.reason ?? (ai ? '' : 'AI 응답에 이 기준이 누락됨');
    if (c.code === 'D1') reason = `단위가 붙은 수치 ${numbersFound.length}개 감지(코드 계산)` + (ai?.reason ? ` / ${ai.reason}` : '');
    if (c.code === 'K' && score === null) reason = 'KBF 미입력으로 평가 제외';

    return { ...c, score, evidence: Array.isArray(ai?.evidence) ? ai!.evidence : [], reason, fix: ai?.fix ?? '' };
  });

  const stages = STAGES.map((stage) => {
    const scored = criteria.filter((c) => c.stage === stage && c.score !== null);
    return { stage, score: scored.reduce((a, c) => a + (c.score ?? 0), 0), max: scored.length * 2 };
  });

  return {
    ...raw,
    transcript,
    questionCoverage: questionCoverage.map((q) => ({ ...q, score: clamp(q.score) })),
    kbfCoverage: kbfCoverage.map((k) => ({ ...k, score: clamp(k.score) })),
    rewrites: Array.isArray(raw.rewrites) ? raw.rewrites : [],
    criteria,
    stages,
    total: stages.reduce((a, s) => a + s.score, 0),
    max: stages.reduce((a, s) => a + s.max, 0),
    metrics: { numbersFound, demonstratives, brandMentions, screenOnlyLines, totalLines: transcript.length },
    platform: input.platform,
    platformNote: PLATFORM_NOTE[input.platform],
    model,
  };
}
