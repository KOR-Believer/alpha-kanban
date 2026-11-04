# 문서 이동·정합화·PC 경로 보정 도구


문서 보관 범위는 repo 루트의 `.ak.config`에서 `[documents] root`로 지정한다. 생략하면 `docs`다. 항목별로 현재 repo → 지정 workspace → 기본값을 적용하며 상속한 경로도 현재 repo 기준이다. 아래 예시는 기본값을 사용하므로 다른 루트를 정했다면 `scope`·대상·이동 경로의 `docs`를 바꿔 요청한다. 쓰기 범위는 계속 명시해야 하며 설정된 문서 루트 안으로 제한된다. 검토한 계획에 루트와 설정 출처를 고정하고, 설정이 달라지면 적용·재개 전에 다시 분석한다. 명시적인 복구는 원래 계획의 범위를 사용한다.

문서 정리는 규격이 변해도 계속 사용할 파일을 관리하는 선택적 호환 기능이다. 현재 ID 발급·폴더 기준 Owner 교정·인식한 폐기 영역 삭제를 제공한다. 예전 문서의 열람·칸반은 정리를 요구하지 않는다. 새로운 변환 규칙도 실제 티켓 본문을 보존하고 변경 미리보기와 명시적 적용을 거친다.

저장소 내 Node CLI와 독립 동봉 CLI가 공유하는 분석·적용 계약이다. 현재 worktree의 명시한 문서 보관 범위만 쓰며, 다른 repo는 사용자가 지정한 현재 위치의 참조 대상만 검사한다. 독립 설치본은 Node.js 24와 Git만 필요하며 pnpm·원본 저장소·node_modules를 요구하지 않는다. 설치본 계약은 `skills/implementation-ledger/references/document-operations.md`에 있다.

## 명령 순서

Node.js 24와 저장소 의존성을 준비한 뒤 현재 작업할 Git worktree에서 실행한다. 이 저장소에서는 `pnpm document-cli`를 사용한다. 다른 격리 저장소를 검증할 때는 그 저장소를 현재 디렉터리로 두고 이 저장소의 `scripts/document-cli.mjs` 절대 경로를 `node`로 실행한다. `--cwd`·checkout·branch 선택 옵션은 없다.

```sh
pnpm document-cli analyze --request /tmp/ak-request.json > /tmp/ak-plan.json
# diff, issues, context, ownership을 검토한다.
# review 항목을 확인했다면 해당 fingerprint를 요청에 넣고 다시 analyze한다.
pnpm document-cli apply --plan /tmp/ak-plan.json --approve "분석 결과의 id"
pnpm document-cli verify --id "분석 결과의 id"
```

요청·계획 파일은 worktree 밖에 둔다. 분석 뒤 worktree 안에 산출물을 새로 만들면 파일 목록이 달라져 재분석을 요구한다. `--request -`·`--plan -`는 stdin JSON을 읽는다. stdout은 JSON 한 개이며 `help`도 JSON으로 명령 계약을 반환한다. `pnpm` 자체의 안내 출력과 분리된 기계 호출에는 `node scripts/document-cli.mjs`를 직접 사용한다.

| 종료 코드 | 의미 |
| --- | --- |
| `0` | 분석 준비 완료/무변경, 적용 완료, 확인된 복구 완료 또는 조회 성공 |
| `2` | 잘못된 명령·JSON·요청 형식 |
| `3` | 검토해야 할 한계가 남은 분석 |
| `4` | 대상 부재·범위/원본 변경·잘못된 승인 등 적용 보류. `error.code`/`issues` 확인 필요 |
| `5` | 중단·잠금·불확실 상태 또는 미완료 작업. journal을 보존하고 명시적 재개/복구 필요 |

`apply`는 `ready` 또는 `noop` 계획의 정확한 ID를 요구한다. 계획 내용·현재 작업 위치·HEAD/branch·원본·참조 대상·사용자 판정이 달라지면 거부한다. 기존 완료 계획의 재적용은 결과를 재검증한다. 동일 요청을 다시 분석했을 때 보존된 완료 기록과 현재 결과가 모두 일치하면 `already-applied`/`noop` 영수증을 반환하며 추가 쓰기를 하지 않는다. 영수증은 실행 계획이 아니므로 다시 apply할 필요가 없다.

## 요청과 분석

작업은 `move`, `reconcile`, `rebase`로 구분한다. `schema: 1`, `operation`, `scope`가 필수이며 알 수 없는 키·checkout 선택 입력을 거부한다. `scope`는 현재 worktree의 `docs` 또는 그 아래 파일/폴더다. Git root·관리 경로·HEAD·branch/detached 상태는 실행 위치에서 읽는다. 분석은 대상 문서나 복구 저장소를 만들지 않는다.

```json
{
  "schema": 1,
  "operation": "move",
  "scope": ["docs"],
  "moves": [{ "from": "docs/24_search_plan.md", "to": "docs/@alice/24_search_plan.md" }],
  "owner": "destination",
  "intent": "adopt"
}
```

- 일반 폴더 정리는 `owner`·`intent`·`actor` 없이 사용할 수 있다. 기존 파일 번호는 바꾸지 않으며 기존 목적지는 덮어쓰지 않는다. 폴더 이동은 포함 자원과 빈 폴더도 분석한다. 겹친 이동·순환·이미 점유된 이동 연쇄는 별도 작업으로 분리하도록 보류한다.
- 제목 없는 일반 Markdown도 일반 이동·경로 보정은 가능하다. Owner 등록은 문서 상단 H1 제목이 있어야 하며 이 도구가 제목을 만들어 넣지 않는다.
- `owner: destination`은 현재/목적지의 `docs/@이름`을 명시적으로 기록한다. 처음 소유자 폴더에 편입하면 `intent: adopt`, 다른 소유자의 인수·반환은 `intent: handoff`를 사용한다. 원소유자 승인이나 티켓 실행·상태 변경은 요구하거나 수행하지 않는다. `ownerFolders`는 이 명시적 기존 파일 작업을 막지 않는다.
- `actor: current`를 요청한 경우만 기존 공통 도구로 `.ak.user`와 worktree 상속을 판정한다. 목적지는 그 사용자와 같아야 하며 값·출처가 바뀌면 재분석한다. 명시적인 다른 사용자 사이의 인수는 이 옵션 없이 가능하다.
- `reconcile`은 `owner: destination`과 `targets`를 받는다. 이미 옮긴 문서는 `previous: {path, documentId, hash}`에 확인한 옛 경로·UUID·이동 전 SHA-256을 제공한다. 옛 경로가 남거나 재사용됐거나 UUID가 중복되거나 내용이 바뀌면 추측 연결하지 않는다. 기존 배치에서 owner만 등록할 때는 `placement: confirmed-in-place`로 현재 위치가 참조 기준임을 명시한다. Owner만으로 이전 경로를 추정하지 않는다.
- `rebase`는 파일 이동·Owner 변경 없이 경로를 보정한다. `repositories`에 현재 문서 repo의 `{root: "current", oldRoot, proof}`와 필요한 외부 repo의 정확한 현재 절대 `root`를 제공한다. `proof`는 `{kind: "remote", url}`의 로컬 remote 일치 또는 `{kind: "confirmed", reason}`의 사용자 확인이다. 네트워크·clone·checkout 탐색은 하지 않는다. 옛 상대 링크에는 문서 repo의 옛 위치를 사용하며, 옛/현재 해석이 서로 다른 유효 파일을 가리키면 보류한다.
- `move`/`reconcile`에서도 외부 참조를 검사하려면 `repositories: [{root: "정확한 현재 repo 경로"}]`를 명시한다. 외부 파일은 쓰기 목록에 넣지 않는다.
- 출력은 문서 상대 링크다. Windows 드라이브/UNC 공유가 달라 상대 표현이 불가능할 때만 명시한 `output: file-url`로 절대 file URL을 만들 수 있다. 다른 PC에서도 열리는 주소라는 의미는 아니다.

## 참조와 적용 판정

CommonMark inline 링크·이미지·reference 정의의 경로 범위만 수정한다. 제목·query·fragment·기존 percent 표기·BOM/개행과 나머지 원문을 보존한다. `- 기준 문서:`의 backtick 경로는 프로젝트 루트 기준이며 명시적인 `./`·`../`는 문서 상대 기준이다. 코드·front matter·임의 본문은 문자열 치환하지 않는다.

프로토콜 상대 `//host/path`는 웹 URL로 유지한다. UNC는 명시적 `file://host/share/path`를 사용한다. 파서가 링크 목적지의 정확한 원문 범위를 입증하지 못하는 복잡한 label은 검토 대상으로 남긴다. `reconcile`에서 Owner만 등록할 때도 대상 문서의 지원 로컬 링크를 검사하지만 이미 유효한 경로를 불필요하게 정규화하지 않는다. 아래 `migrate`의 Owner 기록 교정은 링크 정합화와 별개다.

| 결과 | 적용 조건 |
| --- | --- |
| `ready` | 정확한 대상·쓰기 범위·원본/목적지를 확인했고 필요한 검토가 해당 입력에 결합되어 있음 |
| `review` | HTML/위키 구문, 제외 경로, 외부 worktree·repo·채팅·임의 본문 역참조 등 검사 한계를 검토해야 함 |
| `blocked` | 범위 밖에 필요한 수정, 대상 부재·모호함, 손상 형식, 경로/ID 충돌 등 해결 전 적용 불가 |
| `noop` | 실제 변경 없음. 모든 참조의 무결성을 검증했다는 뜻은 아님 |

검토를 마쳤다면 분석 결과의 해당 `fingerprint`만 요청의 `acknowledgements`에 넣어 재분석한다. fingerprint는 요청·worktree·스캔 원문에 결합된다. `blocked`를 확인 처리로 무시할 수 없으며 단순히 결과를 출력했거나 apply를 호출했다는 이유로 `review`를 승인하지 않는다. 승인한 계획은 해시 ID와 원본/예정문·파일 속성·정확한 변경 목록을 포함한다.

현재 worktree의 접근 가능한 Markdown을 역참조 검사한다. `.git`, 의존성·빌드·캐시·출력 디렉터리, symlink·중첩 저장소·읽기 실패는 별도로 보고한다. 지정 쓰기 범위 안에 미검사 경계가 있으면 보류한다. README/AGENTS 등 범위 밖 참조를 고쳐야 하는 이동도 보류한다.

`migrate`는 이동·PC 보정과 별도의 정리용 참조 검사를 사용한다. 읽을 수 있는 프로젝트 문서에서 정리로 영향을 받는 실제 링크만 확인하며, 참조되는 섹션이나 삭제하면 참조된 다른 제목의 주소가 바뀌는 섹션만 남긴다. 나머지 정리와 누락 ID 발급은 계속하며 링크 원문이나 선택하지 않은 문서는 수정하지 않는다. 다른 문서의 위키/HTML 표기·깨진 링크·알 수 없는 PC 절대경로·미검사 영역이 있다는 이유로 전체 정리를 막지 않는다. 확인된 상대 링크와 정적 HTML/위키 링크를 판정하며, 네이티브 CLI는 정확한 현재 경로의 절대 링크도 확인한다. 옛 경로·파일명만으로 같은 문서를 추측하지 않는다.

## 선택적 문서 정리

`targets[].reconcileOwner: true`로 Owner 기록 교정을 요청할 수 있다. 파일의 부모부터 `docs`까지 올라가며 가장 가까운 `@` 폴더를 기준으로 누락 Owner를 넣거나 유효한 불일치 값을 바꾼다. 예를 들어 `docs/@bob/archive/@alice/13_search_tickets.md`는 `@alice`다. `assignId`, `cleanupLegacy`, `reconcileOwner`는 각각 독립 옵션이며 이 기록 교정에는 현재 사용자·옛 경로가 필요 없다. 소유자 폴더가 없거나 가장 가까운 `@` 식별자가 잘못되면 Owner는 보존하고 해당 사유를 `migration.retained`에 남기며 가능한 다른 정리는 진행한다. 손상·중복 Owner 헤더 보호는 유지한다. 이 작업은 파일 이동·링크 복구·업무 실행을 수행하지 않는다.

`operation: migrate`에 `targets: [{path: "docs/13_search_tickets.md", assignId: true, cleanupLegacy: true}]`를 전달한다. CLI의 각 선택은 독립적이며 일반 Markdown은 `allowPlainMarkdown: true`를 명시한다. 기존 ID는 유지하고 생성한 UUID를 계획에 고정하여 적용/재개 시 재사용한다. Progress Board는 제목과 알려진 다섯 열 표 형식만 확인하며 본문 티켓 수·ID·값은 비교하지 않는다. `티켓 상태`·`Progress 기준`의 설명 목록과 `Ticket Template`의 닫힌 Markdown 예제·기존 안내 문구도 정리한다. 템플릿 안의 날짜/지시/메모 예시는 함께 제거하고, 표·목록·예제 밖 추가 메모는 제목과 함께 보존한다. 미인식 구조와 실제 링크 때문에 남긴 영역은 `migration.retained`에 보고한다. 실제 Ticket List 본문은 바이트 단위로 유지하며 누락 필드·80%·알 수 없는 상태를 교정하지 않는다. 미지원/잘못된 형식 선언·메타데이터는 차단한다.

브라우저의 문서 정리는 체크박스 없이 누락 ID 발급·폴더에 맞춘 Owner 기록 교정·레거시 정리를 즉시 미리보기하고 적용 버튼에서만 선택 파일 하나를 쓴다. 취소·문서 전환·늦은 분석 응답·재시도는 저장하지 않는다. 선택 문서의 경로·hash/mtime와 적용 직전 참조 재분석으로 검토한 결과가 유지되는지 확인하고 IndexedDB 원본 복구를 제공한다. 문서 이동이나 새 참조로 정리 결과가 달라지면 다시 미리보기해야 하지만 다른 문서의 무관한 변경은 저장을 막지 않는다. 원본 PC 경로 연결·이동·PC 보정과는 별개이며 브라우저의 절대경로를 물리적 위치로 추측하지 않는다.

## 중단·재개·복구

```sh
pnpm document-cli list
pnpm document-cli verify --id "작업 id"
pnpm document-cli resume --id "작업 id" --approve "작업 id"
# 또는, 검증한 원래 내용과 배치로 되돌린다.
pnpm document-cli recover --id "작업 id" --approve "작업 id"
```

각 worktree의 Git 관리 디렉터리 아래 `alpha-kanban-document-operations/`에 비공개 권한의 journal·원본 바이트·단계별 예상 결과를 저장한다. linked worktree는 자신의 Git 관리 경로를 사용한다. 첫 문서 변경 전에 원본 전체를 저장·파일 동기화하고 공개된 journal을 다시 읽어 확인하며 Git index·commit·개인 설정·브라우저 IndexedDB는 변경하지 않는다. 미해결 기록과 원본 백업을 자동 삭제하지 않는다.

macOS/Linux는 폴더도 fsync한다. Windows는 Node의 읽기 전용 폴더 핸들에 fsync를 호출하지 않고, 문서·journal·잠금 파일에 `O_SYNC` write-through와 파일 fsync를 사용한다. 폴더 존재/종류·journal readback·문서 결과 검사는 유지하며 실제 파일 flush·권한·읽기 오류는 중단 사유다. 작업 결과의 `persistence`에 이 차이를 기록하며 Windows의 `directorySync`는 `unavailable`이다. 기존 journal에는 이 필드가 없을 수 있다. 프로세스 중단 후 명시적 재개/복구와 OS 정지·전원 차단은 다른 조건이며, 전원 차단 뒤 복구를 보장하지 않는다. 이 동작은 [libuv의 Windows O_SYNC 정의](https://docs.libuv.org/en/v1.x/fs.html#c.UV_FS_O_SYNC)와 [Windows 파일 flush 조건](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)에 따른다.

완료 검증은 당시 스캔에 결합되어 후속 작업으로 참조 문서가 바뀌면 과거 영수증이 `REFERENCE_CHANGED`를 반환할 수 있다. 이를 자동 복구 사유로 삼지 않고 당시 승인 결과와 현재 변경을 구분한다. 반복 분석의 `document-operation-receipt-1`은 `noop/already-applied` 영수증이며 새 apply 계획이 아니다.

동일 파일시스템에서 목적지의 배타적 hard link를 만든 뒤 링크/Owner 내용을 적용하고 close·readback과 원본을 다시 확인해 원래 경로를 제거한다. 이 과정은 다중 파일 원자적 이동이 아니며, 중간에는 양쪽 경로가 보일 수 있다. 완료/실패 보고의 단계와 파일 목록을 확인한다. 기존 hard link·symlink·목적지 점유·다른 파일시스템은 거부한다. 폴더 ACL/flags/다른 소유권처럼 보존 근거가 없는 경우도 쓰기 전에 거부한다. 파일별 64 MiB, 작업별 원본 256 MiB 한도를 넘으면 작업을 나눈다. 제외 경로 외 스캔이 20,000개 항목을 넘는 worktree에서는 분석을 완료하지 않는다.

적용 중간 실패는 자동 재시도하거나 자동 롤백하지 않는다. 현재 내용이 journal의 검증된 이전/이후 결과와 다르면 새 편집을 보존하고 `UNCERTAIN_STEP`/`EXTERNAL_CHANGE`를 반환한다. 이 경우 원본 백업을 이용한 수동 검토가 필요하다. `recover`도 외부 편집을 덮어쓰는 강제 복원 명령이 아니다. 복구를 시작한 뒤에는 복구만 이어갈 수 있다. `reconcile` 복구는 CLI 실행 직전의 현재 위치와 내용을 복원하며 사용자가 먼저 수행한 수동 이동까지 되돌리지 않는다.

프로세스 강제 종료로 잠금이 남으면 `lock-info`로 토큰을 확인하고 `unlock --token "확인한 token"`을 명시적으로 호출한다. 같은 호스트의 소유 프로세스가 종료됐음을 확인할 수 있을 때만 잠금을 해제한다. 실행 중이거나 다른 호스트의 잠금은 해제하지 않는다. 잠금 해제는 문서를 재개/복구하지 않으며 journal을 지우지도 않는다.

CLI 잠금은 브라우저나 외부 편집기를 배제하지 않는다. 적용과 재개 중 파일 해시·mtime·식별자, 역참조 문서와 참조 대상의 변경을 재검증하지만 최종 검사와 OS 작업 사이를 외부 프로세스와 원자적으로 잠그지는 않는다. 불확실한 결과를 완료로 보고하지 않고 원본과 journal을 남긴다.

## 검증 범위

격리된 실제 macOS 폴더/Git worktree에서 이동·인수·등록·PC 보정·재실행·복구, 파일 inode/mode/xattr와 자원 바이트 보존, 실제 권한 오류, 단계 실패 주입과 프로세스 종료 후 재개를 검증한다. 기존 24·25 문서는 격리 복사본으로 번호와 이력 보존을 확인한다. 운영 문서를 실제로 옮긴 결과나 Windows OS native 검증으로 확대하지 않는다. Windows 드라이브·UNC·다른 PC 배치는 공용 순수 계산 fixture로 별도 검증한다. 현재 폴더 속성 검사 어댑터는 macOS용이며 검사할 수 없는 플랫폼의 폴더 전체 이동은 보류한다. 개별 파일은 원래 inode를 유지하는 방식만 사용한다.

브라우저 재발견은 기존 AKD-02/03의 소유자·UUID·handle 규약을 사용한다. 브라우저의 기존 handle이 유지되면 로컬 ID를 유지하고 새 handle이면 UUID만으로 예전 경로/로컬 ID를 합치지 않는다. 실제 OS의 FSA handle 유지 여부는 native CLI 테스트나 fake handle 테스트만으로 보장하지 않는다.

### 페이즈 4 검증

2026-11-01, macOS의 격리 Git 폴더와 설치본에서 확인했다.

- 공용/웹 전체 회귀 후 최종 삭제 규칙과 참조 분석 39개, 브라우저/번역 10개, native migration 4개, CLI 추가 migration 1개 검사가 통과했다. 티켓 수·ID·값이 다른 표, 메모 보존, 앵커 변화, 미지원 형식, UUID 고정, 중단·재개·복구를 포함한다.
- 배포/설치 검사 9개가 JSON·ZIP·설치 파일·영수증의 해시/출처와 실패 시 보존을 검증했다. 그 안에서 원본 저장소 밖에 실행 파일 하나만 복사한 CLI로 11개 실제 이동·인수·경로 보정·정리·복구 시나리오를 통과했다. Node.js 24와 Git 외 런타임 의존성이 없다.
- 컨텍스트/설정 28개 회귀 검사와 독립 agent 3개로 기본 작성·선택적 UUID, 외부 worktree의 참조/인수/명시적 구현 구분, 중단 작업 재개·PC 보정·레거시 정리를 확인했다. 기존 번호/UUID/티켓 이력·다른 worktree·범위 밖 파일을 보존했다. 상세 설정·번호의 기존 agent 기준은 [페이즈 1 검증](team_documents_validation.md)을 재사용했다.
- 격리 Chrome의 OPFS 문서에서 본문 2개 티켓과 다른 ID 1개짜리 표를 미리보기 후 삭제했다. 본문 바이트와 미리보기 UUID를 보존하고, 미리보기 후 외부 변경은 거부했다. 한영·라이트/다크·좁은 화면을 확인하고 `typecheck`·빌드·스킬 형식·번들 재현 검사를 통과했다.
- 안내·템플릿 추가 정리와 자동 미리보기 변경은 공용 110개·웹 165개·native migration 5개·독립 CLI 1개와 `typecheck`·번들 재현 검사를 통과했다. 기존 Chrome의 허용된 실제 폴더에 둔 레거시 복사본에서 미리보기 중 미저장, 적용 후 세 영역 삭제·계획 UUID 유지·실제 티켓 본문 바이트 보존과 보드 4개 티켓 유지, 재실행 시 변경 없음 및 적용 비활성화를 확인했다. 원본 문서 해시는 유지됐다.

Chrome OPFS 검증은 실제 OS 폴더 권한이나 Windows 실기 근거가 아니다. 운영 문서 변환·개인 전역 스킬 교체·공개 배포는 하지 않았다. 새 묶음의 공개 전 설치/업데이트 게이트는 [릴리즈 검증](release_skill_validation.md)에 유지한다.

2026-11-02 정리 범위 수정은 공용 118개·웹 167개·native migration 6개·독립 CLI 1개, 타입 검사와 번들 재현 검사를 통과했다. 무관한 위키/HTML/절대경로 오류를 무시하고 실제 참조 섹션만 남기며, 동명 제목의 주소를 유지하기 위해 필요한 섹션만 보존한다. 기존 Chrome의 실제 폴더 복사본에서 Progress Board 참조를 추가해 해당 영역은 그대로 남고 나머지 세 영역 삭제·계획 UUID 저장·실제 티켓 본문 바이트와 17개 카드 유지·재실행 변경 없음을 확인했다. 선택하지 않은 문서와 링크는 쓰지 않았다.

### 페이즈 5 CLI와 Chrome 통합

2026-11-03, macOS의 실제 Git 폴더와 일반 Chrome의 별도 테스트 프로필에서 열린 티켓의 미저장 지시를 남긴 채 CLI로 `docs/@alice/24_move_tickets.md`를 `docs/@bob/24_move_tickets.md`로 인수했다. 브라우저의 이전 파일 핸들이 사라지자 상세창과 초안도 사라지는 문제를 재현했다.

이미 읽은 티켓은 파일 재발견 여부와 별개로 상세창에 유지하도록 수정했다. 이전 경로를 다시 읽지 못하면 외부 변경 경고와 저장 차단을 해제하지 않는다. UUID만으로 새 파일을 찾아 초안을 자동 저장하거나 기존 딥링크를 다른 문서로 바꾸지 않는다. 이 조건의 회귀 검사가 수정 전 실패하고 수정 후 통과했으며, 관련 브라우저 검사 150개·typecheck·PWA 통합 검사도 통과했다.

수정된 앱의 실제 폴더 재검증에서 초안 유지·저장 차단과 실패한 다시 불러오기 후 동일한 보호를 확인했다. 이동된 문서를 명시적으로 선택하면 소유자 `@bob`과 완료 티켓 1개가 보이며 보정된 상대 링크가 원래 peer 문서를 연다. 파일 비교에서 Owner와 참조 경로만 바뀌고 번호·UUID·티켓 본문·상태·완료 시각·이력은 유지됐다. 미저장 초안은 파일에 쓰이지 않았다.

AKD-09의 설정·agent·소유자 검증은 [페이즈 1의 격리 native/agent 결과](team_documents_validation.md), AKD-02의 Chrome·OPFS 소유자/일반 수정 검증, AKD-05/06의 native 정합화·실패/복구 검증, 페이즈 4의 독립 설치본·agent 결과와 현재 자동 회귀를 함께 대조했다. 이번 실행을 새 독립 agent 검증으로 기록하지 않는다. 후속 standalone CLI 8개와 실제 Chrome 인수 검증이 단계 간 연결을 보완한다.

같은 날 전달받은 Windows 실기 결과 JSON은 Node.js 24.21.0에서 원문 보존 32/32, CLI 2/8 통과였다. 보존 JSON의 기대값·실제값을 전달한 fixture의 해시와 모두 대조했다. 나머지 6개는 `EPERM: operation not permitted, fsync`로 실패했으며 Windows 측의 읽기 전용 디렉터리 `FileHandle.sync()` 단독 재현 보고와 기존 `syncDirectory`가 일치한다. 이 Windows 실행을 macOS에서 직접 재현한 것으로 기록하지 않는다.

이를 수정해 위 OS별 저장 계약과 journal readback을 적용했다. 오류를 포괄적으로 무시하지 않으며 파일 fsync 실패·POSIX 폴더 fsync 실패·journal readback 불일치를 별도 회귀로 검사했다. 재검사 묶음은 기존 8개에 프로세스 종료 후 명시적 unlock/resume·unlock/recover 2개를 추가했다.

2026-11-03 받은 재검사 ZIP의 JSON에서 Windows Node.js 24.21.0의 CLI 10/10 통과를 확인했다. 전달한 검증 ZIP의 SHA-256과 보고서의 입력 ZIP 해시가 일치하며, 실행 스크립트는 파일 fsync·write-through 활성화·폴더 sync 미지원 표기도 검증한다. 이전 EPERM은 재발하지 않았고, 실제 Git worktree의 이동·인수·정합화·PC 보정·선택 정리·외부 수정 거부와 프로세스 중단 후 명시적 재개/복구가 통과했다. 보존 결과의 32개 기대/실제 해시도 전달 fixture와 모두 일치했다. 이는 Windows 측 실행 보고의 검토이며 이 Mac에서 실행한 결과나 OS 정지·전원 차단 검증으로 확대하지 않는다. 브라우저 재검사와 조건부 미실행 한 건은 [브라우저 링크 검증](browser_link_connections.md)에 구분한다. 기존 macOS·독립 agent·자동 회귀 근거와 함께 AKD-09의 필수 통합 검증을 완료했다.

## 확인·결정이 필요한 사항

- 없음. 쓰기 범위·인계 의도·분석/적용 분리는 확정한 계획을 따르며 명령·필드명과 안전한 보류 조건은 구현 선택이다.
