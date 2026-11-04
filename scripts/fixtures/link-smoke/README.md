# 격리 링크·문서 검증

Node.js 24 이상, Git, 데스크톱 Chrome이 필요하다. 이 디렉터리는 전부 테스트용이다. 개인 Chrome 프로필이나 실제 프로젝트를 연결하지 않는다. 앱은 미리 빌드되어 있어 pnpm 설치나 저장소 clone이 필요 없다.

## 시작

1. ZIP을 짧은 경로의 새 폴더에 푼다. Windows 예: `C:\ak-smoke`.
2. 그 폴더의 PowerShell/터미널에서 `node serve.mjs`를 실행한다. 전용 주소는 `http://127.0.0.1:4197`이다.
3. **새 테스트 Chrome 프로필**로 해당 주소를 연다. 기존 사용자 프로필은 사용하지 않는다. 브라우저 재시작 검증을 위해 다음처럼 별도 user-data-dir로 띄우는 편이 안전하다.

```powershell
# Windows PowerShell, 압축을 푼 폴더 안에서 실행
$smokeProfile = Join-Path (Get-Location) 'chrome-profile'
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" "--user-data-dir=$smokeProfile" --no-first-run http://127.0.0.1:4197
```

Chrome 설치 경로가 다르면 실제 chrome.exe 경로를 사용한다. 기존 프로필 경로를 지정하지 않는다.

4. 앱에서 `fixtures`를 workspace로 등록하고 `remote-docs` 프로젝트의 `01_colleague_context_plan.md`를 Markdown으로 연다. 원본 문서에 들어 있는 Mac·Windows·UNC·Linux 주소가 타인의 PC를 가정한 fixture다.

## 확인할 결과

| 동작 | 기대 결과 |
| --- | --- |
| Mac 동료 링크 클릭 | 원래 폴더를 `/Users/alice/work/product`로, 내 폴더를 `local-workspace/harness/apps/team/deep/renamed-product`로 선택하면 `RIGHT PRODUCT LOCAL`이 보인다. 후보가 하나가 아니어도 임의 선택하지 않는다. |
| 같은 Mac 경로의 다음 문서 | 다시 연결하지 않고 `RIGHT PRODUCT NEXT`가 보인다. |
| 연결된 문서 안의 다음 문서 | 같은 로컬 repo의 상대 링크로 열린다. |
| Windows 드라이브·UNC·Linux 주소 | 각 옛 product 폴더를 같은 로컬 product에 연결한다. 한글 파일은 `RIGHT PRODUCT UNICODE`가 보인다. |
| Git 없는 폴더 | 폴더 직접 선택으로 `fixtures/plain-notes`를 연결하면 `PLAIN FOLDER REPORT`가 보인다. |
| 없는 파일 | 파일이 없다고 표시한다. fork나 다른 checkout의 동명 파일로 대신 열지 않는다. |
| 정상 상대 링크 | `NORMAL RELATIVE LINK`가 보인다. |
| 접근 가능한 repo 상대 링크 | 원본 repo 경로가 확인되므로 연결 창에서 선택하지 않고 올바른 문서가 열린다. |
| 언어/테마 변경 | 연결 입력과 열린 문서를 유지한다. 한영 문구·오류가 번역된다. |
| 로컬 폴더의 연결 변경/해제 | 명시한 연결만 변경된다. 취소하면 유지된다. 해제 후 다시 누르면 연결을 요청한다. |

## 권한·재시작·업데이트

모든 조작은 **전용 프로필의 127.0.0.1:4197**에만 수행한다.

1. 테스트 브라우저를 완전히 종료하고 같은 `chrome-profile`로 다시 실행한다. 저장된 연결은 남고, 필요한 권한만 재승인하면 같은 문서가 열린다.
2. 주소창 사이트 설정에서 테스트 폴더 권한을 제거한다. 저장된 링크는 다른 폴더로 갈아타지 않으며 재승인 버튼 또는 재선택으로 복구된다.
3. 서버 터미널에 `b`를 입력한다. 앱 업데이트 확인 → 적용 후에도 연결을 재사용한다. 업데이트를 기다리는 동안 다른 URL의 실제 앱에는 접근하지 않는다.
4. 테스트 사이트의 저장 데이터를 삭제하고 새로 연다. 연결이 사라져 새로 폴더를 연결해야 한다. 기존 프로필·다른 사이트 데이터는 삭제하지 않는다.
5. `node verify.mjs`로 Markdown·agent·Git 설정과 경계 fixture 32개가 원문 그대로인지 확인한다. 결과는 `preservation-플랫폼.json`에 기록된다.

## CLI 통합

`node native-cli.mjs`는 새로운 `cli-run-*` 폴더에서만 실제 Git 저장소/worktree를 만들고 이동·인수·PC 경로 보정·정리·복구와 설정 상속을 검사한다. 총 10개이며, 작업 중 별도 프로세스를 종료한 뒤 명시적으로 잠금을 해제하고 이어 하기·되돌리기를 실행하는 두 경우도 포함한다. `native-interrupt.mjs`는 이 중단 검사용 프로그램이며 제품 CLI에는 중단 스위치가 없다. `fixtures`와 다른 저장소, 전역 Git/스킬 설정은 변경하지 않는다. 결과는 `native-cli-플랫폼.json`이다. 실패·미지원 검사는 성공으로 바꾸지 말고 결과를 그대로 전달한다.

Windows의 파일·복구 기록은 write-through와 파일 fsync를 사용한다. 폴더 fsync는 지원되지 않아 실행하지 않으며, 결과의 `persistence.directorySync`는 `unavailable`이다. 실제 파일 저장 오류는 작업을 중단시킨다. 이 검사는 프로세스 중단 복구를 확인하며 OS 정지·전원 차단 후 복구를 보장하는 검사가 아니다.

Windows 확인 후 위 두 JSON과 어떤 브라우저 항목이 성공/실패했는지 알려주면 된다. 실제 OS 검증을 하지 않은 항목은 체크하지 않는다.

## 실제 폴더 A/B 비교

제품과 별개의 검증 화면이다. PWA가 없는 주소에서 열도록 다른 PowerShell 창에서 아래 명령으로 실행한다.

```powershell
$env:AK_SMOKE_PORT = '4198'
node serve.mjs
```

같은 테스트 Chrome 프로필에서 `http://127.0.0.1:4198/native-ab.html`을 연다. `fixtures 폴더 선택` 후 `다음 사례 실행`을 네 번 진행한다. A는 매번 폴더 선택창에서 `fixtures/local-workspace/harness/apps/team/deep/renamed-product`를 지정한다. B의 옛 절대주소는 발견된 목록에서 같은 repo를 고르고, 접근 가능한 상대주소는 선택 없이 열려야 한다. fork나 second-checkout을 정답 대신 고르면 실패다.

`PASS 4/4`와 `wrong: 0`, `unresolved: 0`을 확인하고 `결과 JSON 다운로드`를 누른다. 이 화면은 실제 폴더 핸들과 IndexedDB를 쓰며 각 실험의 저장 공간·탐색 캐시를 분리한다. 최초 선택 횟수, 탐색·열기·재사용 시간을 따로 기록하고 인간의 선택 대기 시간은 기술적인 열기 시간에서 제외한다. 한 번의 로컬 측정을 일반적인 성능 수치로 해석하지 않는다. `native-link-ab.json`도 Windows 결과에 함께 첨부한다.

## Git 경계·불완전 탐색

같은 서버의 `http://127.0.0.1:4198/native-boundaries.html`에서 `boundary-fixtures 폴더 선택` 후 `경계 검사 실행`을 누른다. `PASS 8/8`을 확인하고 결과 JSON을 내려받는다. 실제 폴더와 IndexedDB로 제품의 연결 도구를 호출하며, UI 전체를 자동 조작하는 검사는 아니다.

허용된 폴더 안의 상대 gitdir/commondir, 밖을 가리키는 gitdir, remote 부재, 없는 파일, 기본 깊이 제한과 취소를 검사한다. 알 수 없는 repo를 부모 repo로 대신 연결하거나, 불완전한 탐색을 자동 연결 근거로 쓰면 실패다. 확인한 폴더를 직접 연결하는 경로와 저장 후 재사용은 계속 가능해야 한다. `native-link-boundaries.json`도 Windows 결과에 함께 첨부한다.
