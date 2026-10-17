# AKL-08 디자인 검토

## 현재 상태

- 2026-10-18: 시안 검토를 승인받은 뒤 후속 실제 적용 지시로 AKL-09를 구현했다. 아래 Open Design 기록은 시안 단계의 이력이며 실제 앱은 http://127.0.0.1:5187/ 에서 확인한다. 최신 검증은 [design-qa.md](../../../design-qa.md)에 기록한다.
- 요구사항: [brief.md](brief.md)
- 티켓: [AKL-08](../../14_alpha_kanban_browser_local_tickets.md#akl-08-open-design으로-시작-화면-시안을-만들고-적용안-승인받기)

## 접근 방식

사용자가 지정한 Codex 대화 `01a143f3-f092-7502-99c3-ea5a8267a86a`와 그 프로젝트의 `docs/open-design-workflow.md`를 확인했다.
해당 작업은 Open Design 공식 stdio MCP를 사용하고 computer use는 작업물 표시·결과 검증에 사용했다.

이번에도 설치된 Open Design 0.25.0의 공식 MCP를 사용했다. Codex 전역 `config.toml`에 `open-design` 서버가 없어서 Open Design의 공식 등록 API로 추가했다. 초기화와 도구 22개 응답을 확인했고, 기존 설정은 기본값 정규화 후 의미상 동일함을 확인했다. 개인 스킬은 변경하지 않았다.

현재 채팅의 도구 목록은 갱신 전이므로 설치된 공식 `handleMcpToolCall` 구현을 호출해 프로젝트 생성, brief 전달, 시안 생성을 진행했다. 별도 MCP 서버나 디자인 생성기를 만들지 않았다. 이후 Codex의 MCP 서버 재시작으로 전역 등록 도구를 사용한다.

## 작업물

- 프로젝트 ID: `alpha-kanban-start-akl08-20261018`
- 이름: `Alpha Kanban · 시작 화면 AKL-08`
- Open Design 작업 폴더: `~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/alpha-kanban-start-akl08-20261018`
- 대화 ID: `19b1f89d-0c60-4886-9dc4-ce67473a2868`
- 생성 요청 ID: `5471167f-bf96-4dab-aa0d-5a751a357141`
- 실행 ID: `115cf577-bbbf-43b4-86a8-38cc298fc0e2`
- 도구: 공식 `frontend-design`, Codex `gpt-6-astra`
- 현재 실행의 Studio: http://127.0.0.1:60076/projects/alpha-kanban-start-akl08-20261018/conversations/19b1f89d-0c60-4886-9dc4-ce67473a2868
- 기본 시안: http://127.0.0.1:60065/api/projects/alpha-kanban-start-akl08-20261018/raw/index.html
- 상태별 검토: http://127.0.0.1:60065/api/projects/alpha-kanban-start-akl08-20261018/raw/review.html

Studio/preview 주소는 Open Design 실행 세션마다 달라질 수 있다. 재시작 후에는 공식 MCP의 `get_project` 또는 `get_run`으로 현재 주소를 받는다. 프로젝트 ID와 파일은 유지된다.

## 검토 내용

- 데스크톱은 전체 폭의 최근 5개 / 다른 25개 목록, 목록별 검색·정렬, 독립 내부 스크롤이다. 워크스페이스 관리와 AI 작업 흐름·스킬 설치 진입점이 아래에 이어진다.
- 좁은 화면은 최근/다른 목록을 탭으로 전환한다. 안내는 페이지 스크롤로 접근한다. 이 배치를 포함한 시작 화면 시안을 2026-10-18 사용자가 승인했다.
- 검토 페이지에서 많은 프로젝트, 최근 기록 없음, 연결 폴더 없음, 권한 재연결, 검색 결과 없음과 한국어/영어를 전환할 수 있다.
- 등록·새 프로젝트·재연결·설치 동작은 합성 데이터 기반 시뮬레이션이다. 설치 요청의 실제 배포 주소/버전 연결과 실제 shadcn React 컴포넌트 적용은 후속 구현 범위다.

## 검증과 캡처

Chrome 플러그인에서 기본 화면과 검토 페이지 재열기·빈 폴더 상태 전환을 확인했다. 별도 Playwright CLI 세션에서 다음을 확인하고 종료했다.

- 1440x900과 1920x1080: 양쪽 목록의 상단·높이 일치, 최근/다른 목록 간 중복 없음, 가로 넘침 없음. 실제 내부 높이는 각각 251px / 301px이다.
- 최근 기록 없음은 0 / 30, 폴더 없음은 0 / 0이며 임의의 최근 항목을 만들지 않는다.
- 390x844 한글·영문: 가로 넘침 없음, 최근 목록만 표시되고 다른 목록은 탭 뒤에 있다. 두 언어의 전체 페이지 캡처를 남겼다.
- 오른쪽 목록만 스크롤해도 왼쪽 위치와 제목 위치가 유지된다. 자동 열기 체크는 현재 URL을 바꾸지 않는다.
- 목록 검색, 설치 안내 모달 열기와 Escape 닫기를 확인했다. 실행 중 pageerror는 없었다. Open Design 호스트의 favicon.ico 404 한 건은 시안 실행 오류와 구분했다.
- 실제 OS 폴더 권한, 스킬 설치, AI 실행, 실제 모바일 기기 터치는 검증 대상이 아니다. 생성 에이전트의 초기 start-screen.png는 목록 높이 조정 전이므로 아래 최종 캡처를 기준으로 검토한다.

[데스크톱](../../../output/playwright/akl-08/desktop.png) · [모바일](../../../output/playwright/akl-08/mobile.png) · [설치 안내](../../../output/playwright/akl-08/install-guide.png)

추가 캡처와 재현 스크립트는 `output/playwright/akl-08/`에 있다. 검증 결과는 사용자 승인이나 제품 적용을 뜻하지 않는다.

## 경계와 승인

- 별도 프로젝트에 가상 데이터와 요구사항만 전달했다. 실제 프로젝트 내용·로컬 폴더 권한·개인 AI 설정은 가져오지 않았다.
- 시안 단계에서는 Alpha Kanban 제품 코드, 개인 전역 스킬, 다른 Open Design 프로젝트를 변경하지 않았다.
- 후속 지시로 AKL-09의 실제 적용과 공통 설치 안내 UI를 진행했다. AKL-13의 버전 계약과 격리 설치 검증은 별도로 남아 있다. 개인 전역 스킬은 수정하지 않았다.
- 생성 성공, 브라우저 검증, 사용자 승인, 제품 적용은 서로 다른 단계로 기록한다.

## 확인·결정이 필요한 사항

- 없음. 시안 승인과 후속 제품 적용을 구분해 기록했으며 커밋·배포는 하지 않았다.
