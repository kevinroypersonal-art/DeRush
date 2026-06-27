// Format-flexible transcript ingestion. DeRush only needs TEXT linked to a
// TIMECODE — so we accept SRT/VTT, plain TXT with leading timecodes, CSV/TSV
// with a text + time column, and JSON (arrays or {segments|cues|...}). All
// parsers are pure (no "use node") and converge on ParsedCue[].
import { ParsedCue, parseSrt, MAX_SRT_CHARS } from "./srt";

export type { ParsedCue };
export { MAX_SRT_CHARS };

// When a source gives a start but no end/duration, fall back to this length so
// the cue still maps to a clip.
const DEFAULT_CUE_MS = 4000;

const TEXT_KEYS = [
  "text",
  "content",
  "caption",
  "value",
  "transcript",
  "line",
  "sentence",
  "utterance",
  "body",
];
const START_KEYS = [
  "startms",
  "start_ms",
  "start",
  "start_time",
  "starttime",
  "begin",
  "from",
  "offset",
  "tstartms",
  "tstart",
  "in",
  "ts",
  "time",
  "timestamp",
];
const END_KEYS = [
  "endms",
  "end_ms",
  "end",
  "end_time",
  "endtime",
  "to",
  "tendms",
  "out",
  "stop",
];
const DUR_KEYS = [
  "durationms",
  "duration_ms",
  "duration",
  "dur",
  "length",
];

// A key whose lowercased name signals milliseconds rather than seconds.
function isMsKey(key: string): boolean {
  const k = key.toLowerCase();
  return k.endsWith("ms") || k.includes("milli");
}

// Parse a flexible timecode string into ms: "HH:MM:SS,mmm", "MM:SS.mmm",
// or a bare seconds value ("12.5"). Returns null if unparseable.
function strToMs(raw: string, ms: boolean): number | null {
  const s = raw.trim();
  if (!s) return null;
  const tc = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s);
  if (tc) {
    const h = tc[1] ? Number(tc[1]) : 0;
    const m = Number(tc[2]);
    const sec = Number(tc[3]);
    const frac = tc[4] ? Number(tc[4].padEnd(3, "0")) : 0;
    return ((h * 60 + m) * 60 + sec) * 1000 + frac;
  }
  const n = Number(s);
  if (Number.isFinite(n)) return ms ? n : n * 1000;
  return null;
}

function valToMs(v: unknown, ms: boolean): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return ms ? v : v * 1000;
  if (typeof v === "string") return strToMs(v, ms);
  return null;
}

function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function finalizeCue(
  cues: ParsedCue[],
  startMs: number,
  endMs: number | null,
  text: string
): void {
  const t = clean(text);
  if (!t) return;
  let end = endMs == null ? startMs + DEFAULT_CUE_MS : endMs;
  if (end <= startMs) end = startMs + DEFAULT_CUE_MS;
  cues.push({ index: cues.length, startMs: Math.round(startMs), endMs: Math.round(end), text: t });
}

// ---- JSON -----------------------------------------------------------------

function lcKeyMap(obj: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const k of Object.keys(obj)) m.set(k.toLowerCase(), obj[k]);
  return m;
}

function pick(
  lc: Map<string, unknown>,
  keys: string[]
): { key: string; value: unknown } | null {
  for (const k of keys) {
    if (lc.has(k)) return { key: k, value: lc.get(k) };
  }
  return null;
}

function parseJsonTranscript(input: string): ParsedCue[] {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    throw new Error("Could not read the JSON transcript.");
  }
  let arr: unknown;
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    arr =
      o.segments ?? o.cues ?? o.results ?? o.items ?? o.transcript ?? o.events;
  }
  if (!Array.isArray(arr)) {
    throw new Error(
      "JSON transcript needs a list of cues (top-level array or a segments/cues field)."
    );
  }
  const cues: ParsedCue[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const lc = lcKeyMap(it as Record<string, unknown>);
    const textField = pick(lc, TEXT_KEYS);
    if (!textField || typeof textField.value !== "string") continue;
    const startField = pick(lc, START_KEYS);
    if (!startField) continue;
    const startMs = valToMs(startField.value, isMsKey(startField.key));
    if (startMs == null) continue;
    const endField = pick(lc, END_KEYS);
    let endMs = endField ? valToMs(endField.value, isMsKey(endField.key)) : null;
    if (endMs == null) {
      const durField = pick(lc, DUR_KEYS);
      const dur = durField ? valToMs(durField.value, isMsKey(durField.key)) : null;
      if (dur != null) endMs = startMs + dur;
    }
    finalizeCue(cues, startMs, endMs, textField.value);
  }
  if (cues.length === 0) {
    throw new Error("No timecoded text found in the JSON transcript.");
  }
  return cues;
}

// ---- CSV / TSV ------------------------------------------------------------

function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = {
    ",": (headerLine.match(/,/g) || []).length,
    ";": (headerLine.match(/;/g) || []).length,
    "\t": (headerLine.match(/\t/g) || []).length,
  };
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

// Minimal RFC-4180-ish splitter: handles quoted fields and doubled quotes.
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.includes(h.toLowerCase()));
}

function parseCsvTranscript(input: string): ParsedCue[] {
  const lines = input.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV transcript needs a header row and at least one cue.");
  }
  const delim = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delim);
  const textCol = findCol(header, TEXT_KEYS);
  const startCol = findCol(header, START_KEYS);
  const endCol = findCol(header, END_KEYS);
  const durCol = findCol(header, DUR_KEYS);
  if (textCol < 0 || startCol < 0) {
    throw new Error(
      "CSV transcript needs a text column and a start/timecode column."
    );
  }
  const startMsKey = isMsKey(header[startCol]);
  const endMsKey = endCol >= 0 ? isMsKey(header[endCol]) : false;
  const durMsKey = durCol >= 0 ? isMsKey(header[durCol]) : false;
  const cues: ParsedCue[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i], delim);
    const text = row[textCol];
    if (!text) continue;
    const startMs = valToMs(row[startCol], startMsKey);
    if (startMs == null) continue;
    let endMs = endCol >= 0 ? valToMs(row[endCol], endMsKey) : null;
    if (endMs == null && durCol >= 0) {
      const dur = valToMs(row[durCol], durMsKey);
      if (dur != null) endMs = startMs + dur;
    }
    finalizeCue(cues, startMs, endMs, text);
  }
  if (cues.length === 0) {
    throw new Error("No timecoded rows found in the CSV transcript.");
  }
  return cues;
}

// ---- Plain TXT with leading timecodes -------------------------------------

const LEADING_TC = /^\s*[[(]?(\d{1,2}(?::\d{1,2}){1,2}(?:[.,]\d{1,3})?)[\])]?\s*[-–—)\]]*\s*(.*)$/;

function parseTxtTranscript(input: string): ParsedCue[] {
  // A "-->" anywhere means it's really an SRT/VTT body.
  if (input.includes("-->")) return parseSrt(input);

  const lines = input.split(/\r?\n/);
  const entries: Array<{ startMs: number; text: string }> = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = LEADING_TC.exec(line);
    if (!m) continue;
    const startMs = strToMs(m[1], false);
    if (startMs == null) continue;
    const text = clean(m[2] ?? "");
    if (!text) continue;
    entries.push({ startMs, text });
  }
  if (entries.length === 0) {
    throw new Error(
      "No timecodes found. Each line needs a timecode like [00:01:23] followed by text."
    );
  }
  const cues: ParsedCue[] = [];
  entries.forEach((e, i) => {
    const next = entries[i + 1];
    const endMs = next && next.startMs > e.startMs ? next.startMs : null;
    finalizeCue(cues, e.startMs, endMs, e.text);
  });
  return cues;
}

// ---- dispatcher -----------------------------------------------------------

// Parse any supported transcript into ParsedCue[]. Dispatch by filename
// extension first, then by content sniffing, with SRT/VTT as the default.
export function parseTranscript(input: string, filename?: string): ParsedCue[] {
  if (input.length > MAX_SRT_CHARS) {
    throw new Error("Transcript is too large to process.");
  }
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  const head = input.replace(/^﻿/, "").trimStart();

  if (ext === "json") {
    return parseJsonTranscript(input);
  }
  if (ext === "csv" || ext === "tsv") {
    return parseCsvTranscript(input);
  }
  if (ext === "srt" || ext === "vtt" || input.includes("-->")) {
    return parseSrt(input);
  }
  // Content sniff for JSON — but only commit to it when the body actually
  // parses as JSON (a TXT line like "[00:01:23] text" also starts with "[").
  if (head.startsWith("{") || head.startsWith("[")) {
    let isJson = true;
    try {
      JSON.parse(input);
    } catch {
      isJson = false;
    }
    if (isJson) return parseJsonTranscript(input);
  }
  // .txt or unknown: try timecoded lines; if the file is actually delimited
  // with a header, fall back to CSV before giving up.
  try {
    return parseTxtTranscript(input);
  } catch (err) {
    if (/[,;\t]/.test(input.split(/\r?\n/)[0] ?? "")) {
      return parseCsvTranscript(input);
    }
    throw err;
  }
}
