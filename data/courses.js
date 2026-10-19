/* 스마트팩토리 자격증 강의 — 과정 구조 데이터
 * 자격증 → 필기/실기 → 과목. 과목 상세(강의자료·연습문제)는 lessons.js / quizzes.js
 * 새 자격증·과목을 추가하려면: CERTS에 항목 추가 + lessons.js·quizzes.js에 같은 id로 데이터 추가
 */
const CERTS = [
  {
    id: 'auto-facility',
    name: '자동화설비기능사',
    oldName: '생산자동화기능사',
    badge: '⚙️',
    desc: '생산자동화 설비의 설치·운전·정비를 다루는 입문 국가기술자격 (2024년 종목명 변경)',
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '자동화요소 제어 기술 · 객관식 60문항 / 60분 · 100점 만점 60점 이상 합격',
        subjects: ['af-w1'],
      },
      {
        id: 'practical', name: '실기',
        examInfo: '생산자동화 실무 · 작업형 4시간 · 100점 만점 60점 이상 합격',
        subjects: ['af-p1'],
      },
    ],
  },
  {
    id: 'auto-facility-eng',
    name: '자동화설비산업기사',
    oldName: '생산자동화산업기사',
    badge: '🏭',
    desc: '자동화 제어시스템의 구축·정비를 다루는 중급 국가기술자격 (2024년 종목명 변경)',
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '기계요소설계 · 공유압 · 자동제어 각 20문항 / 90분 · 과목당 40점 이상, 전과목 평균 60점 이상 합격',
        subjects: ['ae-w1', 'ae-w2', 'ae-w3'],
      },
      {
        id: 'practical', name: '실기',
        examInfo: '자동화설비 실무(기계설계작업 + PLC제어작업) · 작업형 약 4시간 30분 · 60점 이상 합격',
        subjects: ['ae-p1'],
      },
    ],
  },
  {
    id: 'hydro-pneumatic',
    name: '공유압기능사',
    oldName: null,
    badge: '💧',
    desc: '공기압·유압 장치의 정비·유지관리를 다루는 국가기술자격 (응시자격 제한 없음)',
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '공유압일반 · 기계제도 및 기계요소 · 기초전기일반 60문항 / 60분 · 60점 이상 합격',
        subjects: ['hp-w1', 'hp-w2', 'hp-w3'],
      },
      {
        id: 'practical', name: '실기',
        examInfo: '공유압 실무 · 작업형 2시간 30분 · 60점 이상 합격',
        subjects: ['hp-p1'],
      },
    ],
  },
  {
    id: 'smart-factory-ind',
    name: '스마트공장산업기사',
    oldName: null,
    badge: '🤖',
    desc: '2026년 신설 국가기술자격 · IoT·AI 기반 스마트팩토리 운용시스템의 설계·구축·관리 (11월 수시검정 예정)',
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '자동제어 · 네트워크 일반 · 스마트공장 시스템 각 20문항 / 90분 · 과목당 40점 이상, 전과목 평균 60점 이상 합격',
        subjects: ['sf-ind-auto', 'sf-ind-net', 'sf-ind-sys'],
      },
      {
        id: 'practical', name: '실기',
        examInfo: '스마트공장 구축 실무 · 작업형 6시간 · 100점 만점 60점 이상 합격',
        subjects: ['sf-ind-prac'],
      },
    ],
  },
];

/* 과목 id → { certId, part } 역인덱스 (자동 생성) */
const SUBJECT_INDEX = {};
CERTS.forEach((c) => c.parts.forEach((p) =>
  p.subjects.forEach((sid) => { SUBJECT_INDEX[sid] = { certId: c.id, part: p.id }; })));

function getCert(id) { return CERTS.find((c) => c.id === id); }
function getSubjectIds() { return Object.keys(SUBJECT_INDEX); }
