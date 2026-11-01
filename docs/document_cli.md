# 문서 이동·정합화·PC 경로 보정 도구

페이즈 3의 저장소 내 Node CLI와 공용 분석 계약이다. 현재 worktree의 명시한 `docs`만 쓰며, 다른 repo는 사용자가 지정한 현재 위치의 참조 대상만 검사한다. 독립 스킬 설치본 동봉은 AKD-08에서 다룬다.

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

프로토콜 상대 `//host/path`는 웹 URL로 유지한다. UNC는 명시적 `file://host/share/path`를 사용한다. 파서가 링크 목적지의 정확한 원문 범위를 입증하지 못하는 복잡한 label은 검토 대상으로 남긴다. Owner만 등록할 때도 대상 문서의 지원 로컬 링크를 검사하지만 이미 유효한 경로를 불필요하게 정규화하지 않는다.

| 결과 | 적용 조건 |
| --- | --- |
| `ready` | 정확한 대상·쓰기 범위·원본/목적지를 확인했고 필요한 검토가 해당 입력에 결합되어 있음 |
| `review` | HTML/위키 구문, 제외 경로, 외부 worktree·repo·채팅·임의 본문 역참조 등 검사 한계를 검토해야 함 |
| `blocked` | 범위 밖에 필요한 수정, 대상 부재·모호함, 손상 형식, 경로/ID 충돌 등 해결 전 적용 불가 |
| `noop` | 실제 변경 없음. 모든 참조의 무결성을 검증했다는 뜻은 아님 |

검토를 마쳤다면 분석 결과의 해당 `fingerprint`만 요청의 `acknowledgements`에 넣어 재분석한다. fingerprint는 요청·worktree·스캔 원문에 결합된다. `blocked`를 확인 처리로 무시할 수 없으며 단순히 결과를 출력했거나 apply를 호출했다는 이유로 `review`를 승인하지 않는다. 승인한 계획은 해시 ID와 원본/예정문·파일 속성·정확한 변경 목록을 포함한다.

현재 worktree의 접근 가능한 Markdown을 역참조 검사한다. `.git`, 의존성·빌드·캐시·출력 디렉터리, symlink·중첩 저장소·읽기 실패는 별도로 보고한다. 지정 쓰기 범위 안에 미검사 경계가 있으면 보류한다. README/AGENTS 등 범위 밖 참조를 고쳐야 하는 이동도 보류한다.

후속 섹션 정리용 공용 분석은 정확한 heading 경계의 삭제와 보존된 중복 제목의 앵커 번호 변화를 처리한다. 평문 한글/영문/숫자/공백/하이픈/밑줄 제목을 지원하며, 복잡한 heading/HTML 앵커나 삭제 대상의 참조가 있으면 삭제를 보류한다. 이 페이즈의 CLI에는 섹션 삭제 명령을 노출하지 않는다.

## 중단·재개·복구

```sh
pnpm document-cli list
pnpm document-cli verify --id "작업 id"
pnpm document-cli resume --id "작업 id" --approve "작업 id"
# 또는, 검증한 원래 내용과 배치로 되돌린다.
pnpm document-cli recover --id "작업 id" --approve "작업 id"
```

각 worktree의 Git 관리 디렉터리 아래 `alpha-kanban-document-operations/`에 비공개 권한의 journal·원본 바이트·단계별 예상 결과를 저장한다. linked worktree는 자신의 Git 관리 경로를 사용한다. 첫 문서 변경 전에 원본 전체를 저장·동기화하며 Git index·commit·개인 설정·브라우저 IndexedDB는 변경하지 않는다. 미해결 기록과 원본 백업을 자동 삭제하지 않는다.

동일 파일시스템에서 목적지의 배타적 hard link를 만든 뒤 링크/Owner 내용을 적용하고 close·readback과 원본을 다시 확인해 원래 경로를 제거한다. 이 과정은 다중 파일 원자적 이동이 아니며, 중간에는 양쪽 경로가 보일 수 있다. 완료/실패 보고의 단계와 파일 목록을 확인한다. 기존 hard link·symlink·목적지 점유·다른 파일시스템은 거부한다. 폴더 ACL/flags/다른 소유권처럼 보존 근거가 없는 경우도 쓰기 전에 거부한다. 파일별 64 MiB, 작업별 원본 256 MiB 한도를 넘으면 작업을 나눈다. 제외 경로 외 스캔이 20,000개 항목을 넘는 worktree에서는 분석을 완료하지 않는다.

적용 중간 실패는 자동 재시도하거나 자동 롤백하지 않는다. 현재 내용이 journal의 검증된 이전/이후 결과와 다르면 새 편집을 보존하고 `UNCERTAIN_STEP`/`EXTERNAL_CHANGE`를 반환한다. 이 경우 원본 백업을 이용한 수동 검토가 필요하다. `recover`도 외부 편집을 덮어쓰는 강제 복원 명령이 아니다. 복구를 시작한 뒤에는 복구만 이어갈 수 있다. `reconcile` 복구는 CLI 실행 직전의 현재 위치와 내용을 복원하며 사용자가 먼저 수행한 수동 이동까지 되돌리지 않는다.

프로세스 강제 종료로 잠금이 남으면 `lock-info`로 토큰을 확인하고 `unlock --token "확인한 token"`을 명시적으로 호출한다. 같은 호스트의 소유 프로세스가 종료됐음을 확인할 수 있을 때만 잠금을 해제한다. 실행 중이거나 다른 호스트의 잠금은 해제하지 않는다. 잠금 해제는 문서를 재개/복구하지 않으며 journal을 지우지도 않는다.

CLI 잠금은 브라우저나 외부 편집기를 배제하지 않는다. 적용과 재개 중 파일 해시·mtime·식별자, 역참조 문서와 참조 대상의 변경을 재검증하지만 최종 검사와 OS 작업 사이를 외부 프로세스와 원자적으로 잠그지는 않는다. 불확실한 결과를 완료로 보고하지 않고 원본과 journal을 남긴다.

## 검증 범위

격리된 실제 macOS 폴더/Git worktree에서 이동·인수·등록·PC 보정·재실행·복구, 파일 inode/mode/xattr와 자원 바이트 보존, 실제 권한 오류, 단계 실패 주입과 프로세스 종료 후 재개를 검증한다. 기존 24·25 문서는 격리 복사본으로 번호와 이력 보존을 확인한다. 운영 문서를 실제로 옮긴 결과나 Windows OS native 검증으로 확대하지 않는다. Windows 드라이브·UNC·다른 PC 배치는 공용 순수 계산 fixture로 별도 검증한다. 현재 폴더 속성 검사 어댑터는 macOS용이며 검사할 수 없는 플랫폼의 폴더 전체 이동은 보류한다. 개별 파일은 원래 inode를 유지하는 방식만 사용한다.

브라우저 재발견은 기존 AKD-02/03의 소유자·UUID·handle 규약을 사용한다. 브라우저의 기존 handle이 유지되면 로컬 ID를 유지하고 새 handle이면 UUID만으로 예전 경로/로컬 ID를 합치지 않는다. 실제 OS의 FSA handle 유지 여부는 native CLI 테스트나 fake handle 테스트만으로 보장하지 않는다.

## 확인·결정이 필요한 사항

- 없음. 쓰기 범위·인계 의도·분석/적용 분리는 확정한 계획을 따르며 명령·필드명과 안전한 보류 조건은 구현 선택이다.
