#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { createSkillDistribution, sha256 } from "./lib/skill-distribution.mjs";
import { buildDocumentCli } from "./build-document-cli.mjs";
import { LEDGER_CONTRACT } from "../skills/implementation-ledger/scripts/lib/ledger-contract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "apps/web/public-browser/downloads");
await buildDocumentCli();
const { bundle, payloadSha256 } = await createSkillDistribution();
const version = bundle.version;
const files = Object.fromEntries(bundle.files.map((file) => ["implementation-ledger/" + file.path, strToU8(file.content)]));
const guide = `Implementation Ledger / Codex
Bundle version: ${version}
Source commit: ${bundle.source.commit}
Source kind: ${bundle.source.kind} (source provenance, not a publication claim)
Source: ${bundle.source.repository}/tree/${bundle.source.commit}/skills/implementation-ledger
Skill revision: ${LEDGER_CONTRACT.skillRevision}; document formats: ${LEDGER_CONTRACT.readFormats.join(", ")}
Payload SHA-256: ${payloadSha256}

한국어
1. implementation-ledger.zip을 내려받아 압축을 풉니다.
2. implementation-ledger 폴더 전체를 ~/.codex/skills/ 안에 넣습니다.
   CODEX_HOME을 따로 설정했다면 해당 폴더의 skills/를 사용합니다.
3. 같은 이름의 스킬이 이미 있다면 먼저 별도로 백업하고 변경 내용을 비교하세요.
   설치 폴더를 웹에 등록하면 변경 내용을 비교하고, 확인 후 백업·업데이트할 수 있습니다.
   등록 주소: https://kanban.giveit2.me/intro#updates
   PWA 업데이트 모달에서 변경 파일을 확인하고 함께 업데이트하도록 승인하면,
   새 앱을 불러온 뒤 등록된 스킬을 백업하고 교체합니다. Codex 작업이 끝난 뒤 누르세요.
   개인 수정이 있거나 권한이 없으면 스킬은 교체하지 않고 앱만 업데이트할 수 있습니다.
   폴더 등록만으로 파일을 바꾸거나 Codex를 실행하지 않습니다.
4. Codex를 다시 열고 $implementation-ledger로 만들고 싶은 것을 논의하며 플랜 초안을 만듭니다.
5. 플랜의 열린 질문을 읽고 이번 구현에 영향을 주는 질문부터 AI와 논의하세요.
   다음 작업에 관한 질문은 남겨둬도 됩니다. 합의한 범위와 완료 기준을 티켓에 반영해
   새로 작성하거나 갱신한 뒤 구현을 요청하세요.
6. 웹앱에서 프로젝트 폴더를 연결해 계획과 진행 상황을 확인합니다.
   작업은 Codex 채팅에서 이어가세요. 필요한 경우에만 보드에서 티켓을 옮기거나 지시를 남기고,
   Codex에 변경된 문서를 다시 읽어달라고 요청하세요.

agent의 문서 컨텍스트 판정·검증 및 ticket-md 보조 스크립트에는 Node.js 24가 필요합니다. 동봉된 문서 CLI는 Git도 사용하며 pnpm이나 원본 저장소가 필요 없습니다.
설정 없이 기본 작성할 수 있으며, 소유자별 작성은 references/document-context.md의 선택 설정을 사용합니다.

English
Extract the complete implementation-ledger folder into ~/.codex/skills/
(or $CODEX_HOME/skills/). Back up and compare an existing installation first.
Optionally register the installed folder at https://kanban.giveit2.me/intro#updates
to compare changes and confirm a backed-up update. In the PWA update dialog,
review the changed files and confirm updating both. After the new app loads,
it backs up and replaces the registered skill. Finish Codex tasks first.
Personal changes or missing permission leave the skill untouched; you can update
only the app. Folder registration alone never changes files or launches Codex.
Reopen Codex and invoke $implementation-ledger to discuss what you want to build and
draft a plan. Read its open questions and discuss those affecting this implementation;
questions about later work can stay open. Create or update tickets with the agreed
scope and completion criteria before requesting implementation.
Connect the project folder here to review the plan and progress.
Continue the work in Codex chat. Move tickets or leave instructions on the board only
when needed, then ask Codex to reread the changed Markdown.
Node.js 24 is used by the agent helpers, not the browser app. The bundled document CLI also uses Git, and needs neither pnpm nor the source repository.
Basic document creation needs no settings. Optional owner setup is described in references/document-context.md.
`;
// A BOM also identifies UTF-8 when a static server omits the text/plain charset.
const guideBytes = strToU8("\uFEFF" + guide);
files["INSTALL.txt"] = guideBytes;
const archive = zipSync(files, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, `implementation-ledger-${version}.json`), JSON.stringify(bundle));
await writeFile(path.join(destination, "implementation-ledger.zip"), archive);
await writeFile(path.join(destination, `implementation-ledger-${version}.zip`), archive);
await writeFile(path.join(destination, "INSTALL.txt"), guideBytes);
await writeFile(path.join(destination, "manifest.json"), JSON.stringify({ version, archive: `implementation-ledger-${version}.zip`, payloadSha256, archiveSha256: sha256(archive), source: bundle.source, ledger: LEDGER_CONTRACT, fileHashes: bundle.files.map(({ path, sha256 }) => ({ path, sha256 })), files: Object.keys(files) }, null, 2));
console.log(`Packaged implementation-ledger ${version} (${Object.keys(files).length} files).`);
