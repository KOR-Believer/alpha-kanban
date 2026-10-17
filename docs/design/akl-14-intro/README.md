# AKL-14 소개 랜딩 디자인 검토

## 결과와 승인

- 2026-10-18: Open Design으로 소개 시안을 생성하고 제품 계약에 맞게 보정했다. 사용자가 시작 화면과 소개 랜딩 시안을 모두 마음에 든다고 승인했다.
- 후속 실제 적용 지시에 따라 `/`는 프로젝트 시작 화면, `/intro`는 별도 소개로 구현했다. 실제 앱은 http://127.0.0.1:5187/intro 이며 아래 Open Design 링크와 검증은 시안 단계 기록이다.
- 실제 프로젝트 캡처를 넣었다가 사용자 피드백에 따라 제거했다. 현재는 승인 시안의 가상 책갈피 보드와 같은 데이터의 Markdown을 기존 shadcn 테마로 렌더한다.
- 앱 내부 보드 개선 시안은 채택하지 않았다. 보드 재디자인 없이 시작/소개만 적용했으며 최신 제품 확인은 [design-qa.md](../../../design-qa.md)에 기록한다.
- 요구사항: [brief.md](brief.md). 티켓: [AKL-14/15](../../14_alpha_kanban_browser_local_tickets.md).

## 작업물 다시 열기

- Open Design 프로젝트: `alpha-kanban-intro-akl14-20261018`
- 대화: `51ef5547-79a2-4c78-a97b-a5bacd99a6f0`
- 작업 폴더: `/Users/kiseong.park/Library/Application Support/Open Design/namespaces/release-stable/data/projects/alpha-kanban-intro-akl14-20261018`
- 작업물 참조: projectId `alpha-kanban-intro-akl14-20261018`, entryFile `index.html`
- [소개 시안](http://127.0.0.1:60065/api/projects/alpha-kanban-intro-akl14-20261018/raw/index.html)
- [Open Design 작업 화면](http://127.0.0.1:60076/projects/alpha-kanban-intro-akl14-20261018/conversations/51ef5547-79a2-4c78-a97b-a5bacd99a6f0)
- [시작 화면 시안](http://127.0.0.1:60065/api/projects/alpha-kanban-start-akl08-20261018/raw/index.html)
- [최종 데스크톱 전체 캡처](../../../output/playwright/akl-14/intro-desktop-final.png)

위 URL은 Open Design 실행 세션용이며 제품 `/intro`와 별개다. 재시작으로 포트가 바뀌면 공식 MCP의 get_project 또는 get_run으로 현재 시안 주소를 확인한다.

## 제작 방식

- 이전 AKL-08과 같은 Open Design 0.25.0 공식 MCP 구현의 create_project, write_file, start_run, get_run을 사용했다. 현재 채팅 도구 목록에 전역 등록 도구가 반영되지 않아 설치된 공식 구현을 호출했으며 설정을 다시 설치하거나 바꾸지는 않았다.
- Open Design의 frontend-design과 기존 Codex 실행 설정을 사용했다. 초기 실행 `6461eba8-845a-4509-ab08-05e0065fe5f4`, 보정 실행 `a1cf5f51-6ad1-404b-b74c-8eb4411b8d95`는 모두 succeeded다.
- 이전 Start 작업물은 읽기 참고만 했다. 실제 앱 소스는 스타일·보드 참고에 한정하고 원본 앱, 개인 스킬, 연결된 프로젝트 데이터는 수정하지 않았다.
- 헤더·제품명·제품 이미지, 네 단계 작업 흐름, 로컬 원본과 권한, 스킬 안내, 시작 화면 이동으로 구성했다. 한국어 기본이며 영어로 전환한다.
- 초기 예시의 임의 검토 상태를 실제 여섯 상태로 고쳤다. 예시 Markdown은 정식 Status/Progress/사용자 지시 발췌와 공통 reading 파일명으로 교체했다. 데스크톱 Chrome 안내, 공식 로컬 Lucide 아이콘과 라이선스를 포함했다.

## 확인한 범위

- 최종 시안을 Chrome 플러그인에서 열고 이미지·아이콘 로드를 확인했다. 1440x900에서 페이지 폭 1425px로 가로 넘침이 없었다.
- 390x844에서 한국어·영어의 페이지 폭은 375px이며 검사한 본문 요소에 수평 넘침이 없었다. 실제 좁은 브라우저 렌더 확인이며 모바일 기기의 파일 권한 지원 검증은 아니다.
- 설치 안내 모달 열기, Escape 닫기와 한국어/영어 왕복이 동작했다. 시작하기를 눌러 AKL-08 프로젝트 시작 시안으로 이동하고 뒤로가기로 복귀했다. 임시 뷰포트 설정은 복원했다.
- 최종 이미지 파일은 Open Design이 내보낸 1440x2534 전체 페이지 캡처다. Chrome의 1440x900 화면 캡처나 실제 사용 프로젝트 캡처와 구분한다.
- 정적 시안은 링크 이동·언어 전환·모달·클립보드 요청만 사용한다. 파일 선택, 제품 IndexedDB, API 호출, 스킬 설치 및 AI 실행은 없다. 당시 시안의 Claude/버전 준비 안내는 최신 사용자 결정으로 실제 제품에서 제거하고 티켓에서만 추적한다.
- Open Design의 verify.cjs는 DOM 대역 테스트다. 실제 클립보드 쓰기/권한 거부, 모바일 기기, 실제 스킬 설치, 제품 앱 전체 회귀 테스트는 수행하지 않았다.

## 확인·결정이 필요한 사항

- 없음. 실제 앱 적용은 후속 지시로 진행했으며 실제 캡처 대신 마크업 데모를 사용하기로 확정했다. 배포 버전 계약과 공유 이미지 등 남은 작업은 AKL-13/15에 기록한다.
