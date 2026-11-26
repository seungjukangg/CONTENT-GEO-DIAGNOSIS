/**
 * 오프사이트 GEO — 외부 출처 존재감 진단 결과 타입 (서버·화면 공통)
 */

export interface YoutubeVideo { id: string; title: string; channel: string; views: number; long: boolean; official: boolean; publishedAt: string }

export interface EntityPresence {
  name: string;
  isBrand: boolean;
  youtube: {
    status: 'ok' | 'no_key' | 'error';
    error?: string;
    mentionVideos: number;     // 최근 12개월 검색 상위 25개 중 이름이 제목·설명에 들어간 영상 수
    thirdParty: number;        // 그중 공식 채널이 아닌 영상 수
    longForm: number;          // 그중 3분 초과 영상 수
    totalViews: number;
    top: YoutubeVideo[];
  };
  wikipedia: {
    status: 'ok' | 'error';
    error?: string;
    ko: { exists: boolean; title?: string; lastEdited?: string; length?: number; disambiguation?: boolean };
    en: { exists: boolean; title?: string; lastEdited?: string; length?: number; disambiguation?: boolean };
    wikidata?: { id: string; languages: number; officialWebsite: boolean };
  };
  news: {
    status: 'ok' | 'no_query' | 'error';
    error?: string;
    query?: string;
    articles: number;          // 최근 3개월 기사 수 (최대 250)
    outlets: number;           // 서로 다른 매체 수
    koreanArticles: number;
    topOutlets: { domain: string; count: number }[];
  };
}

export interface PresenceResult {
  id?: string;
  projectId: string;
  measuredAt: string;
  entities: EntityPresence[];
  findings: { level: 'high' | 'mid' | 'info'; source: string; text: string }[];
}

/** 지표별 브랜드 점유율 = 브랜드 값 / 비교 대상 전체 합 */
export function shareOf(values: number[], brandIndex: number): number {
  const sum = values.reduce((a, b) => a + b, 0);
  return sum === 0 ? 0 : values[brandIndex] / sum;
}
