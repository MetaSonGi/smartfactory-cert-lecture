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
    roadmap: {
      weeks: "4주 완성",
      steps: [
        {
          sid: "af-basic",
          hours: 4,
          note: "전압·전류·저항·옴의 법칙, 단위 읽는 법"
        },
        {
          sid: "af-w1",
          hours: 24,
          note: "핵심 정리 2회독 + 연습문제 3회독. 자기유지·인터록은 손으로 그려보기"
        },
        {
          sid: "af-p1",
          hours: 32,
          note: "I/O 할당표 작성 연습 + 시뮬레이터(사이트 내 공압 시뮬레이터·PLC 래더)로 시퀀스 검증"
        }
      ],
      beginnerRoute: "비전공자는 af-basic(1주) → af-w1 이론(2주) → af-p1 실습(1주) 순으로, 용어집 플래시카드를 매일 10분씩 병행하세요.",
      majorRoute: "전공자는 af-w1 핵심 정리 1회독 후 연습문제로 바로 들어가고, 틀린 부분만 이론으로 되돌아오세요 (2~3주)."
    },
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '자동화요소 제어 기술 · 객관식 60문항 / 60분 · 100점 만점 60점 이상 합격',
        subjects: ['af-basic', 'af-w1'],
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
    roadmap: {
      weeks: "6주 완성",
      steps: [
        {
          sid: "ae-basic",
          hours: 6,
          note: "기계제도 기호·투상법·전기 기초"
        },
        {
          sid: "ae-w1",
          hours: 24,
          note: "공식 암기보다 단위·기호 해석. 계산형은 공식 유도 과정 이해"
        },
        {
          sid: "ae-w2",
          hours: 20,
          note: "회로 기호 그리기 + 미터인/미터아웃·추력 계산 반복"
        },
        {
          sid: "ae-w3",
          hours: 20,
          note: "자기유지·인터록·타이머 회로 손그림 연습"
        },
        {
          sid: "ae-p1",
          hours: 40,
          note: "기계설계 도면 + PLC 래더 — 사이트 시뮬레이터로 검증"
        }
      ],
      beginnerRoute: "비전공자는 ae-basic(1주) → ae-w3(자동제어, 친숙한 전기부터) → ae-w2 → ae-w1(계산이 가장 어려우니 마지막) → ae-p1 순을 권장.",
      majorRoute: "기계 전공자는 ae-w1부터, 전기 전공자는 ae-w3부터 시작해 약한 과목에 시간을 몰아주세요 (4~5주)."
    },
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '기계요소설계 · 공유압 · 자동제어 각 20문항 / 90분 · 과목당 40점 이상, 전과목 평균 60점 이상 합격',
        subjects: ['ae-basic', 'ae-w1', 'ae-w2', 'ae-w3'],
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
    roadmap: {
      weeks: "4주 완성",
      steps: [
        {
          sid: "hp-basic",
          hours: 4,
          note: "힘·압력·단위. 압력 단위 환산(bar↔Pa) 손에 익히기"
        },
        {
          sid: "hp-w1",
          hours: 24,
          note: "공압/유압 대비표 + 회로 기호 + 추력·유량 계산. 사이트 공압 시뮬레이터로 회로 그려보기"
        },
        {
          sid: "hp-w3",
          hours: 12,
          note: "전기 기초. 시퀀스 기호(a/b접점)까지"
        },
        {
          sid: "hp-w2",
          hours: 12,
          note: "투상법·치수·공차 기호 읽기"
        },
        {
          sid: "hp-p1",
          hours: 24,
          note: "회로 구성 실습 — 시뮬레이터에서 예제 회로(실린더 왕복 등) 먼저 돌려보기"
        }
      ],
      beginnerRoute: "비전공자는 hp-basic → hp-w1(이 과정의 핵심) → hp-w3 → hp-w2 → hp-p1 순. 공압은 눈에 안 보이는 공기라 시뮬레이터로 \"보이게\" 만드는 게 이해의 지름길.",
      majorRoute: "기계 전공자는 hp-w1부터 바로, 3주 완성 가능."
    },
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '공유압일반 · 기계제도 및 기계요소 · 기초전기일반 60문항 / 60분 · 60점 이상 합격',
        subjects: ['hp-basic', 'hp-w1', 'hp-w2', 'hp-w3'],
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
    roadmap: {
      weeks: "8주 완성 (비전공자 기준)",
      steps: [
        {
          sid: "sf-basic",
          hours: 8,
          note: "IT·자동화 용어와 개념. 이 과정을 건너뛰면 뒤가 전부 외계어"
        },
        {
          sid: "sf-ind-auto",
          hours: 30,
          note: "PLC·센서·모터. 자동화설비산업기사 자동제어와 겹치니 함께 보면 효율적"
        },
        {
          sid: "sf-ind-net",
          hours: 24,
          note: "OSI 7계층·TCP/IP·서브넷·보안. 정보처리기사와 겹치는 부분 활용"
        },
        {
          sid: "sf-ind-sys",
          hours: 24,
          note: "스마트센서·로봇협업·안전관리. 신설 과목이라 출제기준 꼼꼼히"
        },
        {
          sid: "sf-ind-prac",
          hours: 48,
          note: "작업형 6시간 대비. 과제 순서: 센서→PLC→HMI→네트워크→통합"
        }
      ],
      beginnerRoute: "비전공자는 sf-basic를 반드시 먼저(2주). 그 다음 auto → net → sys → prac 순. 용어집 플래시카드 매일 병행.",
      majorRoute: "IT 전공자는 net부터, 기계/전기 전공자는 auto부터 시작해 5~6주 완성."
    },
    parts: [
      {
        id: 'written', name: '필기',
        examInfo: '자동제어 · 네트워크 일반 · 스마트공장 시스템 각 20문항 / 90분 · 과목당 40점 이상, 전과목 평균 60점 이상 합격',
        subjects: ['sf-basic', 'sf-ind-auto', 'sf-ind-net', 'sf-ind-sys'],
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
