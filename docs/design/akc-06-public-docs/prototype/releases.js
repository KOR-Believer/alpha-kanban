// User-selected release examples; original record fields are unchanged.
window.AK_RELEASES = {
  "stable": [
    {
      "id": "2026-10-26-updates",
      "sequence": 1,
      "date": "2026-10-30",
      "notify": true,
      "notes": {
        "ko": [
          "앱에서 고른 테마에 맞춰 설치 앱의 창 색상이 바뀝니다.",
          "업데이트 알림에서 적용할 버전의 변경 내용을 읽고, 업데이트 내역에서 다시 확인할 수 있습니다.",
          "업데이트 후 프로젝트 선택 화면에서 아직 읽지 않은 변경 내용을 한 번 보여줍니다. 열어 둔 문서에서는 작업을 방해하지 않습니다.",
          "워크스페이스·프로젝트·스킬 폴더를 등록할 때 읽기·쓰기 권한을 함께 요청합니다. 등록만으로 파일을 변경하지는 않습니다.",
          "설치된 implementation-ledger 폴더를 선택적으로 등록해 변경 내용을 비교하고, 확인 후 백업·업데이트하거나 원본으로 복원할 수 있습니다. 개인 수정이 있는 설치본은 덮어쓰지 않습니다.",
          "스킬 다운로드는 실행 중인 앱과 같은 묶음을 제공합니다. 오프라인 사용 준비가 끝난 설치 앱에서도 내려받을 수 있습니다."
        ],
        "en": [
          "The installed app's window color follows your chosen theme.",
          "Read the prepared version's changes from its update notice and revisit them in Update history.",
          "After updating, unread changes appear once on the project selector, without interrupting an open document.",
          "Registering a workspace, project, or skill folder requests read and write access together. Registration alone does not change files.",
          "Optionally register an installed implementation-ledger folder to compare changes, confirm a backed-up update, or restore the original. Customized installations are not overwritten.",
          "Skill downloads match the running app's bundle and remain available in an offline-ready installed app."
        ]
      },
      "skill": {
        "compatibility": "compatible",
        "notes": {
          "ko": [
            "이번 배포는 설치된 스킬을 관리하는 기능을 추가하며, 동봉 스킬의 규칙과 플랜·티켓·인벤토리 문서 형식은 바꾸지 않습니다. 스킬 파일을 업데이트할 때는 앱 업데이트와 별도로 확인을 받습니다."
          ],
          "en": [
            "This release adds management of installed skills without changing the bundled skill's rules or plan, ticket, and inventory document formats. Updating skill files requires separate confirmation from app updates."
          ]
        }
      }
    },
    {
      "id": "2026-10-30-skill-with-app",
      "sequence": 2,
      "date": "2026-10-30",
      "notify": true,
      "notes": {
        "ko": [
          "프로젝트 선택 화면과 보드 상단에서 스킬 업데이트를 바로 열 수 있습니다.",
          "PWA 업데이트 모달에서 변경 파일을 확인하고 한 번 승인하면, 새 앱을 불러온 뒤 등록된 스킬도 백업하고 업데이트합니다. Codex에서 해당 스킬을 사용하는 작업이 끝난 뒤 눌러주세요.",
          "개인 수정이나 권한 문제가 있는 스킬은 교체하지 않고 앱만 업데이트할 수 있습니다. 백업은 스킬 업데이트에서 복원할 수 있습니다."
        ],
        "en": [
          "Open Skill updates directly from the project selector and board headers.",
          "Review changed files and confirm once in the PWA update dialog. After the new app loads, your registered skill is backed up and updated too. Finish any Codex task using the skill first.",
          "When personal changes or permission issues prevent a skill update, you can update only the app. Backups can be restored from Skill updates."
        ]
      },
      "skill": {
        "compatibility": "compatible",
        "notes": {
          "ko": [
            "동봉 스킬의 규칙과 문서 형식은 그대로입니다. 설치본이 이번 묶음과 이미 같으면 스킬 파일을 변경하지 않습니다."
          ],
          "en": [
            "The bundled skill's rules and document formats are unchanged. Skill files already matching this bundle are left untouched."
          ]
        }
      }
    }
  ],
  "canary": [
    {
      "id": "2026-11-03-canary-baseline",
      "sequence": 1,
      "date": "2026-11-03",
      "notify": false,
      "notes": {
        "ko": [
          "소유자별 문서를 모아 보고, 다른 PC 경로로 된 문서 링크를 내 로컬 폴더에 연결할 수 있습니다."
        ],
        "en": [
          "Filter documents by owner and connect document links from another PC to your local folders."
        ]
      },
      "skill": {
        "compatibility": "unknown",
        "notes": {
          "ko": [
            "기존 스킬을 교체하려면 변경 내용을 비교하고 백업한 뒤 확인하세요."
          ],
          "en": [
            "Compare changes and back up an existing skill before confirming replacement."
          ]
        }
      }
    }
  ]
};
