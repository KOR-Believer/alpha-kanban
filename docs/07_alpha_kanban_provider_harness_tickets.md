# Alpha Kanban Provider Harness 티켓

## Status

- 작성일: 2026-06-25
- 기준 문서: `docs/06_alpha_kanban_provider_harness_plan.md`
- 목적: Codex skill/CLI 중심 실행 구조를 Alpha Kanban native run contract와 provider adapter 구조로 분리한다.
- 범위: `apps/server`, `apps/web`, `packages/shared`, `scripts/ticket-md.mjs`, `docs`
- 현재 진행률: `1 / 9 tickets`

## 티켓 상태

- `TODO`: 아직 시작하지 않음
- `READY`: 정책/선행 조건이 충분해 바로 구현 가능
- `IN_PROGRESS`: 현재 구현 또는 검증 중
- `BLOCKED`: 정책, schema, infra, upstream 확인 필요
- `DONE`: 구현 및 검증 완료
- `DEFERRED`: 의도적으로 후순위 보류

## Progress 기준

- `0%`: 티켓 초안만 있음
- `25%`: 영향 범위와 구현 지점 확인 완료
- `50%`: 핵심 구현 완료, local 단위 검증 전
- `75%`: 단위 검증 완료, cross-repo 통합 검증 전
- `100%`: 구현, 검증, 문서/운영 메모 완료

## 운영 원칙

- provider-neutral contract와 provider-specific adapter를 분리한다.
- Codex CLI는 첫 adapter로 유지하되, plan/ticket 규칙의 source of truth를 Codex skill에만 두지 않는다.
- workspaceRoots, read-only/edit, yolo 같은 권한 boundary는 adapter보다 server orchestration 계층에서 먼저 검증한다.
- ticket Markdown 갱신은 가능한 한 `pnpm ticket-md` 또는 동등한 deterministic tool을 사용한다.
- UI는 provider 원본 log가 아니라 normalized run event schema를 우선 렌더링한다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### AKH-000. Ticket Title

Status: IN_PROGRESS
Progress: 50%
Repository:

- `apps/server`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `AKH-000`

목표:

- 이 티켓이 끝났을 때 달라져야 하는 상태를 적는다.

현재 문제:

- 지금 없는 것, 위험한 것, 결정되지 않은 것을 적는다.

구현 범위:

- 실제로 수정할 API, route, schema, adapter, component를 적는다.

제외 범위:

- 이번 티켓에서 하지 않을 일을 적는다.

완료 기준:

- [ ] 기능 관점의 완료 조건
- [ ] 회귀 방지 조건

검증:

- [ ] unit/API test
- [ ] manual smoke

사용자 지시:

- 2026-06-25: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- 2026-06-25: 초안 작성.
```

## Ticket List

### AKH-00. Provider harness 방향 확정

Status: DONE
Progress: 100%
Completed at: 2026-06-25T20:05:00+09:00
Repository:

- `docs`

Priority: P0
Type: Policy / Design
Depends on:

- 없음

목표:

- 여러 LLM provider 또는 local model 지원을 위해 Codex skill 의존을 Alpha Kanban native run contract로 분리할지 결정한다.

현재 문제:

- 현재 구조는 Codex App/CLI skill harness와 Codex JSONL에 강하게 기대고 있어 Claude, OpenAI-compatible API, local model runner로 확장하기 어렵다.
- plan-ticketing 규칙이 Codex skill 내부에만 있으면 다른 provider가 같은 문서 규칙을 안정적으로 따를 수 없다.

구현 범위:

- provider-neutral run contract와 provider adapter 구조를 새 plan/ticket 문서로 분리한다.
- Codex skill은 즉시 폐기하지 않고 compatibility layer로 유지한다는 원칙을 문서화한다.

제외 범위:

- 실제 provider adapter 구현
- 실제 UI 변경
- 기존 Codex run path 리팩터링

완료 기준:

- [x] 기존 multi-workspace ticket에 묻지 않고 별도 provider harness plan/ticket 묶음으로 분리한다.
- [x] Codex skill 의존을 provider-neutral workflow pack으로 옮기는 방향을 기록한다.
- [x] Codex, Claude, OpenAI-compatible/local provider를 adapter 후보로 분류한다.

검증:

- [x] `docs/06_alpha_kanban_provider_harness_plan.md`에 목표, 비목표, architecture, error policy를 작성한다.
- [x] `docs/07_alpha_kanban_provider_harness_tickets.md`에 후속 구현 ticket을 작성한다.

사용자 지시:

- 2026-06-25: Codex skill에 강하게 의존하는 현재 구조에서 여러 LLM provider나 local model을 지원하려면 자체 skill 문법과 harness가 필요한지 논의했다.
- 2026-06-25: 거시적 계획은 기존 티켓에 추가하기보다 새 plan/ticket 묶음으로 분리하는 방향이 적절한지 확인했다.

진행 메모:

- 2026-06-25: 새 provider harness plan/ticket 묶음을 `06/07` 문서로 분리했다.

### AKH-01. Run Contract v1 schema 정의

Status: READY
Progress: 25%
Repository:

- `packages/shared`
- `apps/server`

Priority: P0
Type: API / Design
Depends on:

- `AKH-00`

목표:

- provider에게 전달할 실행 입력을 긴 prompt 문자열이 아니라 Alpha Kanban native Run Contract v1로 구조화한다.

현재 문제:

- 현재 run input은 Codex prompt 구성에 직접 묶여 있어 scope, mode, ticket update policy, provider options가 한 덩어리 문자열로 섞인다.
- provider가 달라지면 같은 규칙을 재사용하기 어렵고, prompt preview와 실제 실행 payload의 차이를 검증하기 어렵다.

구현 범위:

- Run Contract v1 TypeScript 타입 또는 schema를 정의한다.
- workspace, document, ticket, scope, mode, permissions, user draft, related docs, update policy, tools, expected output 필드를 포함한다.
- 기존 workspace chat과 ticket chat에서 생성하는 prompt 입력을 contract로 매핑한다.

제외 범위:

- Codex adapter의 전체 migration
- local model adapter 구현

완료 기준:

- [ ] Run Contract v1 schema가 shared layer에 추가된다.
- [ ] workspace chat과 ticket chat이 같은 contract builder를 사용할 수 있다.
- [ ] prompt preview가 contract에서 생성된다는 테스트가 있다.

검증:

- [ ] schema validation unit test
- [ ] ticket scope/document scope/workspace scope fixture test
- [ ] read-only/edit-files/yolo permission fixture test

사용자 지시:

- 2026-06-25: `@workspace`, `@tickets`, `@t:ID` 같은 scope 표현은 UI/parser가 정규화하고 provider prompt에는 해석된 scope를 넣는 방향을 논의했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-02. Provider adapter registry와 capability manifest

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: API / Feature
Depends on:

- `AKH-01`

목표:

- Codex CLI, Claude Code, OpenAI-compatible API, local model runner를 같은 server orchestration에서 다룰 수 있는 adapter boundary를 만든다.

현재 문제:

- 현재 model catalog, reasoning effort, fast tier, CLI path, yolo flag 같은 설정이 Codex CLI 중심으로 흩어져 있다.
- provider가 지원하지 않는 옵션을 UI가 명확히 알 수 있는 capability schema가 없다.

구현 범위:

- provider adapter interface를 정의한다.
- provider registry와 capability manifest endpoint를 추가한다.
- Codex CLI adapter를 기존 구현 위에 얇게 감싼다.
- provider별 support: model list, reasoning, fast tier, streaming, cancellation, file edit, shell, yolo, skill compatibility를 표현한다.

제외 범위:

- Claude/OpenAI/local adapter의 완성 구현
- provider settings UI 전체 개편

완료 기준:

- [ ] server가 provider 목록과 capability manifest를 반환한다.
- [ ] Codex adapter가 기존 설정과 run path를 adapter interface로 노출한다.
- [ ] unsupported option은 run 전에 preflight error로 반환된다.

검증:

- [ ] provider registry unit test
- [ ] Codex capability manifest snapshot test
- [ ] unsupported model/option preflight test

사용자 지시:

- 2026-06-25: model 리스트와 fast/reasoning 지원 여부를 CLI로 확인하고 API로 감싸는 방향을 논의했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-03. Codex CLI adapter migration

Status: TODO
Progress: 0%
Repository:

- `apps/server`

Priority: P0
Type: Feature
Depends on:

- `AKH-01`
- `AKH-02`

목표:

- 기존 Codex run path를 Run Contract v1과 provider adapter interface를 사용하는 구조로 이전한다.

현재 문제:

- Codex 실행 prompt 생성, CLI args, stderr/stdout 처리, JSONL 저장, 실패 상태 처리가 한 provider에 특화된 형태로 남아 있다.
- CLI process 시작 전 실패에서도 ticket Markdown에 사용자 지시가 남는 문제가 있었다.

구현 범위:

- Run Contract v1에서 Codex prompt를 생성하는 prompt builder를 만든다.
- Codex CLI args 생성, CODEX_BIN fallback, trusted directory failure, yolo flag 변환을 adapter 안으로 모은다.
- process start 전 preflight failure와 process start 후 runtime failure를 분리한다.
- 기존 run endpoint는 public contract를 유지하되 내부 구현만 adapter 기반으로 바꾼다.

제외 범위:

- Codex prompt 내용의 대대적 재작성
- 다른 provider adapter 구현

완료 기준:

- [ ] 기존 ticket run과 workspace run이 Codex adapter를 통해 동작한다.
- [ ] process 시작 전 실패는 ticket Markdown에 사용자 지시를 남기지 않는다.
- [ ] 기존 `.alpha-kanban/runs/*.jsonl` debug artifact가 유지된다.

검증:

- [ ] Codex prompt builder snapshot test
- [ ] binary missing/preflight failure regression test
- [ ] 기존 ticket edit run manual smoke

사용자 지시:

- 2026-06-25: CLI 시작 전 실패는 사용자 지시를 Markdown에 남기지 않는 방향이 맞다고 정리했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-04. Normalized run event와 chat transcript schema

Status: READY
Progress: 25%
Repository:

- `packages/shared`
- `apps/server`
- `apps/web`

Priority: P0
Type: API / UX
Depends on:

- `AKH-01`
- `AKH-02`

목표:

- UI가 Codex JSONL 원본에 의존하지 않고 provider-neutral activity timeline과 chat transcript를 표시하게 한다.

현재 문제:

- run activity가 Codex event를 단순 요약하면 "Step started/completed"처럼 사용자가 얻는 정보가 적다.
- workspace chat과 ticket chat 모두 응답별 activity를 기대하지만, run log와 chat message의 연결이 아직 약하다.

구현 범위:

- normalized run event schema를 정의한다.
- provider 원본 log를 normalized event로 변환하는 adapter mapper를 만든다.
- chat message와 run id, assistant answer, retry/delete state, activity collapse state를 연결한다.
- UI는 응답 전 activity 펼침, 응답 후 activity 접힘을 기본값으로 둔다.

제외 범위:

- 내부 chain-of-thought 원문 표시
- provider 원본 log 전체 UI 노출

완료 기준:

- [ ] workspace chat message마다 연결된 run activity가 보인다.
- [ ] ticket chat message마다 연결된 run activity가 보인다.
- [ ] activity는 provider-neutral event만 사용해 렌더링된다.
- [ ] failed message retry/delete가 run id와 일관되게 동작한다.

검증:

- [ ] normalized event mapper unit test
- [ ] chat transcript API test
- [ ] workspace chat UI smoke
- [ ] ticket chat UI smoke

사용자 지시:

- 2026-06-25: 사고과정 원문이 아니라 Codex 앱처럼 이해 가능한 실행 흐름, 도구 실행, 파일 변경, 검증 흐름을 보고 싶다고 했다.
- 2026-06-25: activity는 응답당 연결되고, 응답 전에는 펼침, 응답 후에는 접힘이 기본이면 좋겠다고 했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-05. Deterministic tool bridge와 ticket-md 통합

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `scripts/ticket-md.mjs`
- `docs`

Priority: P0
Type: Feature / Safety
Depends on:

- `AKH-01`

목표:

- provider가 Markdown을 직접 grep/replace하다가 잘못된 ticket 영역을 바꾸지 않도록 deterministic tool bridge를 만든다.

현재 문제:

- 긴 ticket 문서에서 유사 텍스트가 반복되면 LLM이 wrong range를 patch할 위험이 있다.
- `pnpm ticket-md`는 생겼지만, server/provider run contract 안에서 공식 tool로 노출되지는 않았다.

구현 범위:

- server-side tool bridge 인터페이스를 정의한다.
- `ticket-md check/show/status/append-user/append-note`를 tool bridge에 연결한다.
- run contract에 사용 가능한 deterministic tools와 read-only/edit 권한을 포함한다.
- Codex prompt에는 Alpha Kanban repo 내부 ticket 문서 수정 시 `pnpm ticket-md`를 우선 사용하라는 지시를 생성한다.

제외 범위:

- 모든 Markdown 구조를 block id/tag 기반으로 재작성
- 외부 repository에 자동으로 `ticket-md`를 설치

완료 기준:

- [ ] server가 ticket update를 `ticket-md` 기반으로 수행할 수 있다.
- [ ] read-only run에서는 append/status tool이 차단된다.
- [ ] Codex adapter prompt에 deterministic tool 사용 규칙이 포함된다.
- [ ] wrong ticket range regression fixture가 있다.

검증:

- [ ] duplicate ticket id failure test
- [ ] dry-run line range report test
- [ ] read-only permission denial test
- [ ] status/progress/top-level count consistency test

사용자 지시:

- 2026-06-25: ticket 문서 수정 시 `pnpm ticket-md`가 있으면 사용한다는 규칙을 안정화 후 skill이나 AGENTS에 넣는 방향을 논의했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-06. Provider settings와 capability-aware composer UI

Status: TODO
Progress: 0%
Repository:

- `apps/web`
- `apps/server`
- `packages/shared`

Priority: P1
Type: UX / API
Depends on:

- `AKH-02`

목표:

- workspace chat과 ticket chat composer에서 provider, model, reasoning, fast tier, yolo, read-only/edit options를 capability 기반으로 즉시 선택하게 한다.

현재 문제:

- 설정이 별도 modal에 있거나 저장 버튼을 요구하면 채팅 입력 시점의 선택 흐름과 맞지 않는다.
- provider별로 지원하지 않는 옵션이 있을 때 사용자가 run 전에 알기 어렵다.

구현 범위:

- composer 하단 compact options를 provider capability manifest에 연결한다.
- 설정 변경은 저장 버튼 없이 즉시 local/server state에 반영한다.
- unsupported option은 disabled state와 짧은 이유를 표시한다.
- workspace chat과 ticket chat이 같은 composer control을 재사용한다.

제외 범위:

- provider adapter 구현
- 전체 settings page 재설계

완료 기준:

- [ ] workspace chat composer에서 provider/model/reasoning/fast/yolo를 선택할 수 있다.
- [ ] ticket chat composer에서도 같은 UX가 동작한다.
- [ ] unsupported option이 run 전 disabled 또는 warning으로 보인다.
- [ ] 선택값이 reload 후 유지된다.

검증:

- [ ] component state unit test
- [ ] provider capability fixture test
- [ ] manual visual smoke

사용자 지시:

- 2026-06-25: model/reasoning/fast 설정은 별도 구석 modal보다 채팅창 아래에서 Codex 앱처럼 즉각 바뀌는 방식이 맞다고 했다.
- 2026-06-25: yolo 체크박스를 workspace chat과 ticket 내부 chat 모두에 넣자고 했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-07. OpenAI-compatible/local provider adapter spike

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `packages/shared`

Priority: P1
Type: Feature / Spike
Depends on:

- `AKH-01`
- `AKH-02`
- `AKH-04`

목표:

- DeepSeek, Gemma, Ollama, vLLM 등 OpenAI-compatible endpoint나 local runner를 Alpha Kanban provider adapter로 붙일 수 있는 최소 경로를 검증한다.

현재 문제:

- local model은 Codex/Claude처럼 skill harness와 autonomous file editing environment를 기본 제공하지 않는다.
- file edit와 shell execution까지 맡길 수 있는지, read-only answer부터 시작해야 하는지 결정이 필요하다.

구현 범위:

- OpenAI-compatible chat/completions 또는 responses-style adapter spike를 만든다.
- Run Contract v1을 read-only answer prompt로 변환한다.
- streaming message와 final answer를 normalized event로 저장한다.
- tool use/file edit는 server-mediated 방식으로 가능한지 별도 note를 남긴다.

제외 범위:

- local model 자동 코드 수정 완성
- model별 prompt tuning
- GPU/runtime 설치 자동화

완료 기준:

- [ ] OpenAI-compatible base URL/API key/model 설정으로 read-only workspace chat이 동작한다.
- [ ] local provider run이 normalized events와 chat transcript를 남긴다.
- [ ] file edit 미지원 상태가 capability manifest에 명확히 표시된다.

검증:

- [ ] mock OpenAI-compatible server test
- [ ] read-only workspace chat manual smoke
- [ ] unsupported edit-files preflight test

사용자 지시:

- 2026-06-25: DeepSeek, Gemma 같은 local serving model을 CLI로 호출할 때 Codex/Claude skill 같은 표준 문법이 있는지 질문했다.

진행 메모:

- 2026-06-25: 초안 작성.

### AKH-08. Claude Code adapter와 skill compatibility spike

Status: DEFERRED
Progress: 0%
Repository:

- `apps/server`
- `docs`

Priority: P2
Type: Feature / Spike
Depends on:

- `AKH-01`
- `AKH-02`
- `AKH-04`

목표:

- Claude Code를 provider adapter로 붙일 때 skill/project instruction compatibility를 어떻게 다룰지 검증한다.

현재 문제:

- Codex skill과 Claude skill/project instruction은 같은 표준이 아니다.
- provider별 instruction packaging 차이를 Alpha Kanban native workflow pack으로 흡수할 수 있는지 확인해야 한다.

구현 범위:

- Claude Code CLI 실행 가능 여부와 기본 args/cwd/session behavior를 조사한다.
- Alpha Kanban workflow pack을 Claude용 instruction prompt로 투영하는 방식을 설계한다.
- Codex skill과 Claude instruction 사이에 공통으로 유지할 수 있는 최소 규칙을 정리한다.

제외 범위:

- Claude adapter production 구현
- Claude 전용 UI 최적화

완료 기준:

- [ ] Claude Code adapter feasibility note가 작성된다.
- [ ] skill compatibility layer 초안이 docs에 반영된다.
- [ ] Codex-only 규칙과 provider-neutral 규칙이 분리된다.

검증:

- [ ] CLI invocation dry-run 또는 조사 결과 기록
- [ ] compatibility matrix review

사용자 지시:

- 2026-06-25: 여러 provider를 지원하려면 자체 skill 문법과 harness가 필요한지 논의했다.

진행 메모:

- 2026-06-25: 초안 작성. 우선순위는 Codex adapter 안정화와 OpenAI-compatible/local spike 이후로 둔다.
