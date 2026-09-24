import { join } from "node:path";
import { DOCS_DIR, writeIfChanged } from "./outlook-store.js";
import { addDays, localDateOf, localHourOf, localMidnightMs } from "./window-core.js";

/**
 * Which run sends the day's e-mail.
 *
 * GitHub starts scheduled runs hours late and occasionally not at all, so tying the e-mail to one
 * cron entry means one lost run costs the whole day. Instead every scheduled run may send, and the
 * first one of the Europe/Vienna day (from 02:00 local on) that finds no record of today's e-mail
 * does. The record is docs/data/email-sent.json, written only after Resend accepted the e-mail and
 * committed by the workflow with the rest of docs/.
 *
 * Every doubt resolves towards sending: a missing or unreadable record means "not sent yet". The
 * worst a fault here can do is a second e-mail, never a missing one.
 */

export const EMAIL_MARKER_PATH = join(DOCS_DIR, "data", "email-sent.json");

/** A scheduled run before this local hour never sends: an e-mail at one in the morning helps nobody,
 * and 02:13 local is the nominal e-mail slot anyway. */
export const EARLIEST_SCHEDULED_LOCAL_HOUR = 2;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day an e-mail sent now counts for. Before 02:00 local it is still the previous day's e-mail:
 * scheduled runs do not send then at all, and a manual send at 00:30 must not stand in for the
 * morning e-mail of the day that has only just begun.
 */
export function emailDayOf(nowMs: number, timeZone: string): string {
  const date = localDateOf(nowMs, timeZone);
  return localHourOf(nowMs, timeZone) < EARLIEST_SCHEDULED_LOCAL_HOUR ? addDays(date, -1) : date;
}

/** Published with the site, so it carries nothing but when and from which run. */
export interface EmailMarker {
  /** The local date the e-mail was sent for. */
  date: string;
  sentAt: string;
  trigger: string;
  runId: string | null;
}

export function parseMarker(text: string | null | undefined): EmailMarker | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.date === "string" && ISO_DATE.test(parsed.date)) return parsed as EmailMarker;
  } catch {
    // Unreadable is the same as absent.
  }
  return null;
}

export function markerFor(date: string, nowMs: number, trigger: string, runId: string | null): EmailMarker {
  return { date, sentAt: new Date(nowMs).toISOString(), trigger, runId };
}

export interface GateInput {
  /** GITHUB_EVENT_NAME: "schedule", "workflow_dispatch", or anything else for a local run. */
  event: string;
  /** The manual run's "send the e-mail" checkbox. */
  manualSend: boolean;
  marker: EmailMarker | null;
  nowMs: number;
  cfg: { timezone: string; end: string };
}

export interface GateDecision {
  send: boolean;
  /** The local day this decision is about. It goes into the record, so a run decided at 23:59 and
   * sent after midnight still counts for the day it was decided on and blocks nothing tomorrow. */
  date: string;
  reason: string;
}

export function emailDecision(input: GateInput): GateDecision {
  const { cfg, nowMs, marker } = input;
  const date = emailDayOf(nowMs, cfg.timezone);
  const no = (reason: string): GateDecision => ({ send: false, date, reason });
  const yes = (reason: string): GateDecision => ({ send: true, date, reason });

  if (nowMs >= localMidnightMs(addDays(cfg.end, 1), cfg.timezone)) return no(`okno do ${cfg.end} už uplynulo`);

  if (input.event === "workflow_dispatch") {
    return input.manualSend ? yes("ručné spustenie so zaškrtnutým e-mailom") : no("ručné spustenie bez e-mailu");
  }
  if (input.event !== "schedule") return no(`spustenie „${input.event}“ e-mail neposiela`);

  if (localHourOf(nowMs, cfg.timezone) < EARLIEST_SCHEDULED_LOCAL_HOUR) {
    return no(`pred ${String(EARLIEST_SCHEDULED_LOCAL_HOUR).padStart(2, "0")}:00 miestneho času`);
  }
  if (marker?.date === date) return no(`dnešný e-mail už odišiel (${marker.sentAt}, ${marker.trigger})`);
  return yes(marker ? `posledný e-mail je z ${marker.date}, dnešný ešte neodišiel` : "žiadny záznam o odoslanom e-maile");
}

/** Called only after the e-mail really went out. A date the gate did not supply (a local run, or a
 * gate that failed open) falls back to the e-mail day of the moment of sending. */
export function recordEmailSent(opts: {
  date?: string;
  nowMs: number;
  timeZone: string;
  trigger: string;
  runId: string | null;
  path?: string;
}): EmailMarker {
  const date = opts.date && ISO_DATE.test(opts.date) ? opts.date : emailDayOf(opts.nowMs, opts.timeZone);
  const marker = markerFor(date, opts.nowMs, opts.trigger, opts.runId);
  writeIfChanged(opts.path ?? EMAIL_MARKER_PATH, `${JSON.stringify(marker, null, 1)}\n`);
  return marker;
}
