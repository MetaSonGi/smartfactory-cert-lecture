# 출처 및 라이선스 (공압 시뮬레이터)

## 원본
- **Picuino Pneumatic Simulator** — https://github.com/picuino/neumatic
- Copyright © 2025 Carlos Félix Pardo Martín (https://www.picuino.com)
- 라이선스: **GNU General Public License v3.0** (이 디렉토리의 `LICENSE` 파일)

## 포크 변경 사항 (2026-10-19)
- `index.html`: 원본 단일 파일을 포크. 회로 프리셋 경로를 `circuits/`로 이동,
  PLC 연동을 위한 최소 후크만 추가 (밸브 `plcDriven` 플래그·파일럿 오버라이드 스킵,
  `Roller.active` 게터, 수동 클릭 가드, `window.__sim` 노출, `plc.js` 로드).
- `circuits/`: 원본 회로 프리셋 20종 + 신규 `plc-reciprocating.txt` (PLC 왕복 예제 회로)
- `plc.js`: 신규 작성 — PLC 래더 에디터·I/O 매핑·100ms 스캔 엔진 (한국어 UI)
- `LICENSE`: GPL-3.0 전문 (https://www.gnu.org/licenses/gpl-3.0.txt)

## 라이선스 고지
이 디렉토리의 모든 파일은 GPL-3.0을 따릅니다. 재배포·수정 시 동일 라이선스를
유지하고 원본 저작권 표시를 보존해야 합니다.
