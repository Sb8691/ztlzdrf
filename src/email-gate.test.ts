import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WINDOW_CONFIG } from "./config.js";
import { emailDecision, parseMarker, recordEmailSent, type EmailMarker, type GateInput } from "./email-gate.js";

/*
 * Which run sends the day's e-mail. The cases are the days that actually went wrong or nearly did:
 * 23 Sep 2026 had no e-mail slot at all, and the UTC/Vienna midnight offset is where a
 * "one e-mail a day" rule quietly becomes zero or two.
 */

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const at = (iso: string) => Date.parse(iso);
const marker = (date: string): EmailMarker => ({ date, sentAt: `${date}T05:00:00.000Z`, trigger: "schedule", runId: "1" });

function decide(over: Partial<GateInput> & { nowMs: number }) {
  return emailDecision({ event: "schedule", manualSend: false, marker: null, cfg: WINDOW_CONFIG, ...over });
}

test("23. 9. by s poistkou e-mail dostal: plánovaný beh o 01:29 UTC so včerajším záznamom posiela", () => {
  const d = decide({ nowMs: at("2026-09-23T01:29:35Z"), marker: marker("2026-09-22") });
  assert.equal(d.send, true);
  assert.equal(d.date, "2026-09-23");
});

test("keď dnešný e-mail už odišiel, ďalšie plánované behy v ten deň mlčia", () => {
  const d = decide({ nowMs: at("2026-09-23T15:27:18Z"), marker: marker("2026-09-23") });
  assert.equal(d.send, false);
  assert.match(d.reason, /už odišiel/);
});

test("pred 02:00 viedenského času sa neposiela, od 02:00 áno – aj keď je v UTC ešte včera", () => {
  // 23:30 UTC on the 23rd is 01:30 on the 24th in Vienna: a new calendar day, but still the 23rd's
  // e-mail day, and too early to send anyway.
  const early = decide({ nowMs: at("2026-09-23T23:30:00Z") });
  assert.equal(early.send, false);
  assert.equal(early.date, "2026-09-23");
  // 00:30 UTC on the 24th is 02:30 in Vienna: the 23rd's record does not block the 24th.
  const onTime = decide({ nowMs: at("2026-09-24T00:30:00Z"), marker: marker("2026-09-23") });
  assert.equal(onTime.send, true);
  assert.equal(onTime.date, "2026-09-24");
});

test("beh rozhodnutý o 23:59 miestneho času patrí k tomu dňu, nie k nasledujúcemu", () => {
  const d = decide({ nowMs: at("2026-09-23T21:59:00Z"), marker: marker("2026-09-22") });
  assert.equal(d.send, true);
  assert.equal(d.date, "2026-09-23");
});

test("ručný beh posiela len so zaškrtnutím – vtedy aj keď dnešný e-mail už odišiel", () => {
  const now = at("2026-09-24T08:00:00Z");
  assert.equal(decide({ nowMs: now, event: "workflow_dispatch", manualSend: true, marker: marker("2026-09-24") }).send, true);
  assert.equal(decide({ nowMs: now, event: "workflow_dispatch", manualSend: false }).send, false);
  // The 02:00 floor is for schedules only; a person pressing the button means it.
  assert.equal(decide({ nowMs: at("2026-09-23T23:30:00Z"), event: "workflow_dispatch", manualSend: true }).send, true);
});

test("ručný e-mail po polnoci (00:28, ako 23. 9.) patrí k predošlému dňu a ranný e-mail nezruší", () => {
  const manual = decide({ nowMs: at("2026-09-22T22:28:02Z"), event: "workflow_dispatch", manualSend: true });
  assert.equal(manual.send, true);
  assert.equal(manual.date, "2026-09-22");
  const morning = decide({ nowMs: at("2026-09-23T04:00:00Z"), marker: marker(manual.date) });
  assert.equal(morning.send, true);
  assert.equal(morning.date, "2026-09-23");
});

test("iné spustenia než plán a ručné tlačidlo e-mail neposielajú", () => {
  assert.equal(decide({ nowMs: at("2026-09-24T08:00:00Z"), event: "push" }).send, false);
  assert.equal(decide({ nowMs: at("2026-09-24T08:00:00Z"), event: "local" }).send, false);
});

test("po skončení okna sa neposiela nič, ani ručne; posledný deň okna ešte áno", () => {
  // 22:00 UTC on 5 Oct is midnight in Vienna: the window 1-5 Oct is over.
  const after = at("2026-10-05T22:00:00Z");
  assert.equal(decide({ nowMs: after }).send, false);
  assert.equal(decide({ nowMs: after, event: "workflow_dispatch", manualSend: true }).send, false);
  const lastDay = decide({ nowMs: at("2026-10-05T21:59:00Z"), marker: marker("2026-10-04") });
  assert.equal(lastDay.send, true);
  assert.equal(lastDay.date, "2026-10-05");
});

test("chýbajúci alebo poškodený záznam znamená „ešte neodišiel“ – radšej dva e-maily než žiadny", () => {
  for (const text of [null, "", "{}", "nie je json", '{"date":"včera"}', "[]", "null"]) {
    assert.equal(parseMarker(text), null, `záznam ${JSON.stringify(text)}`);
    assert.equal(decide({ nowMs: at("2026-09-24T08:00:00Z"), marker: parseMarker(text) }).send, true);
  }
});

test("záznam sa zapíše s dátumom od brány a nič iné v ňom nie je", () => {
  const dir = mkdtempSync(join(tmpdir(), "email-gate-"));
  const path = join(dir, "email-sent.json");
  // Sent just after midnight for a day the gate decided on the evening before.
  const written = recordEmailSent({ date: "2026-09-23", nowMs: at("2026-09-23T22:03:00Z"), timeZone: WINDOW_CONFIG.timezone, trigger: "schedule", runId: "42", path });
  assert.equal(written.date, "2026-09-23");
  const onDisk = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(Object.keys(onDisk).sort(), ["date", "runId", "sentAt", "trigger"]);
  assert.deepEqual(parseMarker(readFileSync(path, "utf8")), written);

  // No usable date from the gate (a local run, or a gate that failed open): the e-mail day of the
  // moment of sending - 00:03 local still belongs to the day before, 08:00 to its own day.
  const fallback = recordEmailSent({ date: "", nowMs: at("2026-09-23T22:03:00Z"), timeZone: WINDOW_CONFIG.timezone, trigger: "local", runId: null, path });
  assert.equal(fallback.date, "2026-09-23");
  const morning = recordEmailSent({ nowMs: at("2026-09-24T06:00:00Z"), timeZone: WINDOW_CONFIG.timezone, trigger: "local", runId: null, path });
  assert.equal(morning.date, "2026-09-24");
});

test("CLI brány zapíše send a date do GITHUB_OUTPUT a nepadne bez záznamu", () => {
  const dir = mkdtempSync(join(tmpdir(), "email-gate-cli-"));
  const output = join(dir, "github-output");
  writeFileSync(output, "");
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/should-send-email.ts", join(dir, "chyba.json")], {
    cwd: REPO_ROOT,
    // A manual run without the checkbox answers "no" on any date, so the test does not age.
    env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", MANUAL_SEND: "false", GITHUB_OUTPUT: output },
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(r.status, 0, r.stderr);
  const out = readFileSync(output, "utf8");
  assert.match(out, /^send=false$/m);
  assert.match(out, /^date=\d{4}-\d{2}-\d{2}$/m);
  assert.match(r.stdout, /E-mail v tomto behu: nie/);
});

test("workflow už neporovnáva reťazce cronov a e-mail riadi brána", () => {
  const path = join(REPO_ROOT, ".github", "workflows", "watchdog.yml");
  assert.ok(existsSync(path));
  const yml = readFileSync(path, "utf8");
  assert.doesNotMatch(yml, /EMAIL_RUN/);
  assert.doesNotMatch(yml, /github\.event\.schedule\s*==/);
  // A depth-1 fetch of main would cut the history the push loops rebase against.
  assert.doesNotMatch(yml, /--depth/);
  assert.equal(yml.match(/id: gate\b/g)?.length, 1);
  assert.match(yml, /^\s+queue: max$/m);
  // Fail-open: every e-mail step runs unless the gate explicitly said "false".
  assert.equal(yml.match(/steps\.gate\.outputs\.send != 'false'/g)?.length, 3);
  assert.doesNotMatch(yml, /steps\.gate\.outputs\.send == /);
  assert.equal(yml.match(/RECORD_EMAIL: "true"/g)?.length, 1);
  // Anchored to send_email's own block: a looser pattern would run on into force_render's default.
  assert.match(yml, /^\s+send_email:\n\s+description:.*\n\s+type: boolean\n\s+default: false$/m);
});
