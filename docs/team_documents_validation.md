# AKD-11 기본 작성·선택적 소유자 검증

검증일: 2026-11-01

대상: [AKD-11](25_alpha_kanban_team_documents_tickets.md)의 동봉 스킬·공통 컨텍스트 도구·선택적 Owner 헤더. [소유자 규약](team_documents_contract.md)을 구현했으며 브라우저 소유자 필터, 기존 문서 정합화·이동·ID 발급은 이 결과에 포함하지 않는다.

## 구현 결과

- [document-context.mjs](../skills/implementation-ledger/scripts/document-context.mjs)는 `new`, `edit`, `actor`, `check-new`를 JSON으로 제공한다. 설정·폴더·문서를 직접 쓰지 않는다. `scripts/lib`의 설정·소유자·파일시스템 판정을 재사용하며 저장소 의존성 없이 설치 폴더에서 실행한다.
- 기본 작성은 사용자 조회·Owner·설정 생성을 요구하지 않는다. 소유자별 기본 작성은 공유 `ownerFolders`와 개인 `user.id`를 따로 판정하고, 현재 worktree의 대상·번호·Owner 줄을 반환한다. 명시적 대상과 기존 편집은 기본 배치 정책보다 우선한다.
- 새 문서만 템플릿의 `{{OwnerHeader}}`를 결과의 한 줄로 바꾸거나 생략한다. `check-new`는 헤더 범위·중복/잘못된 값·경로 일치를 읽기 전용으로 검사한다. 기존 문서 수정은 Owner를 추가하거나 교정하지 않는다.
- SKILL.md는 호출·결과 사용·기록 보존만 안내하고, [선택 설정과 진단](../skills/implementation-ledger/references/document-context.md)은 별도 참조에 둔다. 양쪽 README의 기본 사용과 선택 안내, ZIP의 런타임 파일을 맞췄다.

## 자동 검사

macOS, Node.js 24.14.0, Git 2.39.5에서 수행했다. Git 검사는 임시 저장소·worktree를 만들고 실제 로컬 Git 명령으로 확인했다.

| 검사 | 결과와 근거 |
| --- | --- |
| `pnpm test:ledger` | 27개 통과. [컨텍스트 검사](../scripts/test/document-context.test.mjs)와 [설정·Owner 검사](../scripts/test/document-owner.test.mjs) |
| `pnpm --filter @alpha-kanban/shared test` | 52개 통과. 세 템플릿의 기본/소유자 작성, BOM·LF/CRLF, Owner를 보존하는 상태·지시 수정과 strict ledger 검사 포함. [호환 검사](../packages/shared/test/documentOwnerCompatibility.test.ts) |
| `pnpm --filter @alpha-kanban/web test` | 368개 통과. 기존 브라우저 읽기/쓰기·스킬 설치/업데이트 회귀 검사. 실제 OS 선택창 검증을 뜻하지 않음 |
| `pnpm typecheck` | 통과 |
| 스킬 `quick_validate.py` | 통과. 스킬 형식 검사이며 실제 행동 검증은 아래 별도 수행 |
| `pnpm build` | 앱·서비스 워커·고정된 스킬 ZIP/JSON 생성 통과. 기존 500 kB 이상 앱 청크 경고는 유지 |

주요 판정은 다음 경계까지 확인했다.

- 모든 설정 없음, 홈 사용자만 있음, 발견한 @폴더, 연결하지 않은 상위 workspace 설정, repo false와 workspace true, true와 사용자 없음/잘못된 값, 기본 위치 보존과 명시적 대상.
- 공유/개인 우선순위, 중복·오배치·미지원 키·include·구문/인코딩/권한 실패. 필요한 값만 읽고 오류를 기본값이나 다른 사용자로 대체하지 않음.
- 외부 detached worktree의 현재 공유 파일과 main의 개인 파일 분리, workspace 연결의 include/worktree override 제외, 같은 remote의 독립 clone 격리, main 이동 후 실패와 명시적 Git repair 후 복구, main 접근 실패와 특수 Git 구성의 보류.
- 호출 프로세스의 Git 환경 재지정 배제, 현재 프로젝트 밖·중첩 repo·하위 심볼릭 링크 거부, 프로젝트 자체의 OS 경로 별칭 허용. 범위를 넘는 쓰기는 수행하지 않음.
- 사용자 하위 전체 번호, 다른 사용자/레거시 번호 제외, 중복·빈 번호·24/25 이관 후 26, 큰 숫자의 정확성·불완전 탐색 거부, 대소문자/Unicode 충돌.
- 문서 헤더의 Owner만 인식, 본문·인용·코드·foreign front matter 구분, 중복/잘못된 Owner와 경로 불일치 거부. 기존 편집에서는 손상된 Owner도 원문 보존.

## 실제 agent 작성 검증

개인 설치본 대신 격리 프로젝트와 복사/ZIP 추출한 스킬을 사용했다. 독립 agent에게 스킬과 실제 작성 요청만 제공했고, 현재 프로젝트의 구현 코드나 판정 정답을 주지 않았다. 도구의 홈 fallback도 임시 home으로 지정했다.

| 시나리오 | 관찰한 결과 |
| --- | --- |
| 구현 전, 설정 없는 기본 사용 | 기존 03 문서를 보존하고 플랜·티켓·인벤토리를 기존 docs와 번호 관례로 작성했다. 후속 기능 요구·사용자 지시·READY/25% 수정과 공용 parser/writer·strict 검사 통과. 설정·@폴더·Owner 없음 |
| 수정된 ZIP, 홈 사용자만 있는 기본 프로젝트 | 별도 workspace 연결 없이 일반 docs에 세 문서를 작성했다. 홈 사용자로 자동 전환하지 않았고 Owner와 설정 파일을 만들지 않았다. 후속 해제 요구와 READY/25% 기록, 세 파일의 check-new 및 티켓 검증 통과 |
| 수정된 ZIP, workspace 밖 worktree | 현재 worktree의 true 정책과 원래 main의 @alice를 사용했다. worktree 자체에 둔 다른 사용자와 workspace/home 사용자를 채택하지 않았다. @alice의 24/25 다음으로 26·27·28 문서를 작성하고 Owner: @alice를 기록했다. 다른 사용자의 99와 일반 영역 88은 번호에 반영하지 않았다 |
| 옵션 해제 후 기존 문서 수정 | 테스트 준비에서 정책을 false, main 사용자 값을 잘못된 식별자로 바꾼 뒤 후속 요구를 전달했다. agent는 사용자/정책 조회 없이 기존 플랜·티켓만 수정했다. Owner·위치·READY/25%·이전 지시를 유지했고 설정·다른 문서·파일 수가 바뀌지 않았다 |
| 번호와 의존성·최신 지시가 다른 읽기 전용 검토 | 01 문서의 작업이 90 문서의 작업에 의존하고, 90의 DONE 뒤에 재발 문제가 보고된 fixture를 제공했다. 독립 agent는 숫자 순서·과거 DONE보다 의존성과 최신 지시를 근거로 90의 재점검을 먼저 권고했다. 문서/상태 변경이나 구현을 실행하지 않았다 |

새 문서의 실제 내용·헤더·상태·사용자 지시를 파서로 재확인했다. 후속 설정 변경을 주입하기 전에는 초기 fixture 29개 파일의 해시가 모두 유지됐다. 어느 시나리오도 기능 코드를 구현하거나 다른 티켓을 실행·완료 처리하지 않았다. 임시 파일의 개인 경로나 원시 대화는 이 문서에 복사하지 않았다.

최종 빌드의 고정 ZIP/JSON에서도 14개 스킬 파일의 해시 일치를 확인하고, ZIP 추출본으로 기본 작성 판정·소유자 작성 판정·새 Owner 검사 실행을 다시 확인했다. 후속 오류 안내 보완까지 포함한 최종 설치본에는 저장소 전용 의존성이 없다.

## 증거의 한계와 후속 범위

- 이 결과는 로컬 구현과 격리 설치본의 명시적 스킬 사용을 검증한다. 개인 전역 설치본, 실제 사용자 설정, 공개 배포는 변경하지 않았다.
- 새 묶음의 브라우저를 통한 기존 설치본 교체·복원과 OS별 속성 보존은 별도 릴리즈 검증이다. 릴리즈 기록의 스킬 호환성은 `unknown`으로 두며 공식 스냅샷 allowlist를 추가하지 않았다. 공개 전 [설치 스킬 검증](release_skill_validation.md)의 해당 게이트를 확인한다.
- native 증거는 macOS다. Windows 실기, 브라우저 폴더 선택/권한과 소유자 필터, 레거시 정합화·링크 변환·이동은 각각 해당 후속 티켓에서 검증한다.
- 새 이름·번호 제안은 분산 잠금이 아니다. 실제 작성 직전에 재확인하고 충돌하는 파일을 덮어쓰지 않는 스킬 규약을 유지한다.

## 확인·결정이 필요한 사항

- 없음
