// MOCK_GEMINI=1 일 때 쓰는 예시 결과 (화면 확인용, 실제 분석 아님)
import type { RawResult } from './geoCriteria';

export const MOCK_RAW: RawResult = {
  transcript: [
    { start: '00:00', source: '화면자막', text: '우리 아이 삼시세끼' },
    { start: '00:01', source: '나레이션', text: '이거 하나면 진짜 끝나요' },
    { start: '00:03', source: '화면자막', text: '사람이 먹는 등급 원료 100%' },
    { start: '00:06', source: '나레이션', text: '역대급 기호성, 한 번 먹으면 다른 건 안 먹어요' },
    { start: '00:10', source: '둘다', text: '수의사가 함께 만든 레시피' },
    { start: '00:13', source: '나레이션', text: '지금 첫 구매 50% 할인' },
  ],
  hook: {
    timeRange: '00:00–00:03',
    text: '우리 아이 삼시세끼 / 이거 하나면 진짜 끝나요',
    problems: [
      '"이거"가 무엇인지 음성에서 드러나지 않음 → 떼어 가면 브랜드·제품이 사라짐(C2, F)',
      '핵심 정보 "삼시세끼"가 화면 자막에만 있음 → 음성 스크립트에 남지 않음(B)',
      '소비자 프롬프트(강아지 화식 추천)에 대한 답이 첫 문장에 없음(C1)',
    ],
    improved: [
      {
        text: '강아지 화식 고민이면, 예시브랜드 OO화식 하나로 하루 세 끼를 해결할 수 있어요',
        whatChanged: 'C1 첫 문장을 질문의 답으로 변경 / F 브랜드+제품명+카테고리 명시 / B 자막 내용을 음성으로도 말함',
      },
      {
        text: '사람이 먹는 등급 원료 100%로 만든 강아지 화식, 예시브랜드 OO화식입니다',
        whatChanged: 'D1 수치를 첫 문장으로 이동 / F 엔티티 명시',
      },
    ],
  },
  criteria: [
    { code: 'A', score: 1, evidence: [{ time: '00:01', quote: '이거 하나면 진짜 끝나요' }], reason: '질문 관련 언급은 있으나 직접 답하지 않음', fix: '질문을 그대로 말하고 바로 답하는 구간 추가' },
    { code: 'B', score: 1, evidence: [{ time: '00:03', quote: '사람이 먹는 등급 원료 100%' }], reason: '원료 정보가 화면 자막에만 있음', fix: '원료·수치 정보를 나레이션으로도 말함' },
    { code: 'C1', score: 0, evidence: [{ time: '00:00', quote: '우리 아이 삼시세끼' }], reason: '첫 구간이 분위기 문구뿐임', fix: '첫 문장에 결론 배치' },
    { code: 'C2', score: 0, evidence: [{ time: '00:01', quote: '이거 하나면 진짜 끝나요' }], reason: '지시어 "이거"로 대상 불명확', fix: '"이거" → "예시브랜드 OO화식"' },
    { code: 'E', score: 1, evidence: [], reason: '원료 → 기호성 → 할인 순서는 있으나 구간 구분이 약함', fix: '원료 / 영양 / 급여 방법 단위로 구간 분리' },
    { code: 'F', score: 0, evidence: [], reason: '브랜드명·제품명을 음성으로 말하지 않음', fix: '브랜드+제품명+카테고리를 한 문장에' },
    { code: 'D2', score: 1, evidence: [{ time: '00:10', quote: '수의사가 함께 만든 레시피' }], reason: '전문가 언급은 있으나 출처(이름·소속) 없음', fix: '[수의사 이름·소속] 명시' },
    { code: 'G', score: 0, evidence: [], reason: '출시 시점·기준일 없음', fix: '[출시 연도] 또는 리뉴얼 시점 언급' },
    { code: 'T', score: 0, evidence: [{ time: '00:06', quote: '역대급 기호성' }], reason: '홍보 문구 위주', fix: '"역대급" → [기호성 테스트 결과 수치]' },
  ],
  questionCoverage: [
    { question: '강아지 화식 추천', score: 1, time: '00:01', note: '추천 대상은 암시되나 제품명이 없음' },
    { question: '강아지 화식 원료 안전한가', score: 2, time: '00:03', note: '원료 등급 수치 있음(화면 자막)' },
  ],
  kbfCoverage: [
    { kbf: '원료', score: 2, note: '"사람이 먹는 등급 100%" 수치 있음' },
    { kbf: '기호성', score: 1, note: '"역대급" 형용사만 있음' },
    { kbf: '가격', score: 1, note: '할인율만 있고 가격 없음' },
  ],
  rewrites: [
    { time: '00:01', original: '이거 하나면 진짜 끝나요', issues: ['C2 지시어', 'F 엔티티 누락'], rewritten: '예시브랜드 OO화식 하나로 강아지 하루 세 끼를 해결할 수 있어요' },
    { time: '00:06', original: '역대급 기호성, 한 번 먹으면 다른 건 안 먹어요', issues: ['T 홍보 톤', 'D1 수치 없음'], rewritten: '기호성 테스트에서 강아지 [실측 수치]%가 OO화식을 먼저 선택했어요' },
    { time: '00:10', original: '수의사가 함께 만든 레시피', issues: ['D2 출처 불명확'], rewritten: '[소속] [이름] 수의사와 함께 설계한 레시피예요' },
  ],
  textPackage: {
    title: '강아지 화식 추천 | 예시브랜드 OO화식 원료·급여량 정리',
    descriptionLead: '예시브랜드 OO화식은 사람이 먹는 등급 원료 100%로 만든 강아지 화식임. 하루 세 끼 급여 기준과 원료 구성을 정리함.',
    chapters: [
      { time: '00:00', title: '강아지 화식, 하루 세 끼 가능한가' },
      { time: '00:03', title: '원료 등급' },
      { time: '00:10', title: '수의사 설계 레시피' },
    ],
    faq: [
      { q: '강아지 화식 원료는 안전한가요?', a: '예시브랜드 OO화식은 사람이 먹는 등급 원료 100%를 사용함.' },
      { q: '누가 레시피를 만들었나요?', a: '[소속] [이름] 수의사가 레시피 설계에 참여함.' },
      { q: '하루에 얼마나 급여하나요?', a: '[체중별 급여량]을 기준으로 하루 세 끼 급여함.' },
    ],
  },
};
