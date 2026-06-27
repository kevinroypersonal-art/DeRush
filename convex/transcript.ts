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
  "word",
  "utf8",
  "punctuated_word",
  "display",
  "snippet",
  "phrase",
];
const START_KEYS = [
  "startms",
  "start_ms",
  "start",
  "start_time",
  "starttime",
  "start_offset",
  "startoffset",
  "begin",
  "from",
  "offset",
  "offsetms",
  "tstartms",
  "tstart",
  "tcin",
  "in",
  "ts",
  "time",
  "timestamp",
];
// Nested arrays whose elements carry the actual words/segments of a cue.
const TEXT_CONTAINER_KEYS = ["segs", "words", "tokens", "items", "chunks"];
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
  "ddurationms",
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
  // Google STT writes "1.500s"; tolerate a trailing unit.
  const s = raw.trim().replace(/s$/i, "");
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

// Coerce a value to milliseconds. Numbers/strings via strToMs; objects via the
// protobuf-style { seconds, nanos } shape (Google Speech-to-Text).
function valToMs(v: unknown, ms: boolean): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return ms ? v : v * 1000;
  if (typeof v === "string") return strToMs(v, ms);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const sec = typeof o.seconds === "number" ? o.seconds : Number(o.seconds);
    const nanos = typeof o.nanos === "number" ? o.nanos : Number(o.nanos);
    if (Number.isFinite(sec) || Number.isFinite(nanos)) {
      return (Number.isFinite(sec) ? sec : 0) * 1000 +
        (Number.isFinite(nanos) ? nanos / 1e6 : 0);
    }
  }
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

// Pull a cue's text from an item: a direct text field, the first transcript of
// an `alternatives` list, or the joined words/segments of a nested container.
function itemText(lc: Map<string, unknown>): string | null {
  const direct = pick(lc, TEXT_KEYS);
  if (direct && typeof direct.value === "string" && direct.value.trim()) {
    return direct.value;
  }
  if (lc.has("alternatives")) {
    const alts = lc.get("alternatives");
    if (Array.isArray(alts) && alts[0] && typeof alts[0] === "object") {
      const t = pick(lcKeyMap(alts[0] as Record<string, unknown>), TEXT_KEYS);
      if (t && typeof t.value === "string" && t.value.trim()) return t.value;
    }
  }
  for (const k of TEXT_CONTAINER_KEYS) {
    const arr = lc.get(k);
    if (!Array.isArray(arr)) continue;
    const parts = arr
      .map((el) => {
        if (typeof el === "string") return el;
        if (el && typeof el === "object") {
          const t = pick(lcKeyMap(el as Record<string, unknown>), TEXT_KEYS);
          return t && typeof t.value === "string" ? t.value : "";
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return null;
}

// First/last timed entry of a nested word/segment container (for shapes that put
// the text on the item but the timings only on its words).
function containerTime(
  lc: Map<string, unknown>,
  keys: string[],
  fromEnd: boolean
): number | null {
  for (const k of TEXT_CONTAINER_KEYS) {
    const arr = lc.get(k);
    if (!Array.isArray(arr)) continue;
    const order = fromEnd ? [...arr].reverse() : arr;
    for (const el of order) {
      if (el && typeof el === "object") {
        const f = pick(lcKeyMap(el as Record<string, unknown>), keys);
        if (f) {
          const v = valToMs(f.value, isMsKey(f.key));
          if (v != null) return v;
        }
      }
    }
  }
  return null;
}

// Extract one cue from an arbitrary item, or null if it has no text+start.
function cueFromItem(
  item: unknown
): { startMs: number; endMs: number | null; text: string } | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const lc = lcKeyMap(item as Record<string, unknown>);

  const text = itemText(lc);
  if (text == null || clean(text) === "") return null;

  const sf = pick(lc, START_KEYS);
  let startMs = sf ? valToMs(sf.value, isMsKey(sf.key)) : null;
  if (startMs == null) startMs = containerTime(lc, START_KEYS, false);
  if (startMs == null) return null;

  const ef = pick(lc, END_KEYS);
  let endMs = ef ? valToMs(ef.value, isMsKey(ef.key)) : null;
  if (endMs == null) {
    const df = pick(lc, DUR_KEYS);
    const d = df ? valToMs(df.value, isMsKey(df.key)) : null;
    if (d != null) endMs = startMs + d;
  }
  if (endMs == null) endMs = containerTime(lc, END_KEYS, true);

  return { startMs, endMs, text };
}

// Recursively locate the array of cue-like objects anywhere in the JSON, so we
// don't depend on a fixed top-level shape (Whisper, YouTube json3, Google STT,
// Deepgram, AssemblyAI, plain arrays… all converge here).
const CONTAINER_HINT_KEYS = [
  "segments",
  "cues",
  "results",
  "items",
  "transcript",
  "events",
  "monologues",
  "utterances",
  "words",
];

function findCueArray(node: unknown, depth = 0): unknown[] | null {
  if (node == null || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.some((el) => cueFromItem(el) != null)) return node;
    for (const el of node) {
      const found = findCueArray(el, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    const lc = lcKeyMap(node as Record<string, unknown>);
    for (const k of CONTAINER_HINT_KEYS) {
      const v = lc.get(k);
      if (Array.isArray(v) && v.some((el) => cueFromItem(el) != null)) return v;
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = findCueArray(v, depth + 1);
      if (found) return found;
    }
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
  const arr = findCueArray(data);
  if (!arr) {
    throw new Error(
      "Couldn't find timecoded text in the JSON. Each entry needs some text and a start time."
    );
  }
  const cues: ParsedCue[] = [];
  for (const it of arr) {
    const c = cueFromItem(it);
    if (c) finalizeCue(cues, c.startMs, c.endMs, c.text);
  }
  if (cues.length === 0) {
    throw new Error("No timecoded text found in the JSON transcript.");
  }
  return rescaleIfImplausible(cues);
}

// Numeric times on plainly-named keys (start/end) are ambiguous: seconds or
// milliseconds? We assume seconds. If that yields a physically impossible
// timeline (> 24h), the values were almost certainly milliseconds — rescale.
// This never fires on legitimate ≤24h second-based data.
const MAX_PLAUSIBLE_MS = 24 * 3600 * 1000;
function rescaleIfImplausible(cues: ParsedCue[]): ParsedCue[] {
  const maxEnd = cues.reduce((m, c) => Math.max(m, c.endMs), 0);
  if (maxEnd <= MAX_PLAUSIBLE_MS) return cues;
  return cues.map((c) => ({
    ...c,
    startMs: Math.round(c.startMs / 1000),
    endMs: Math.round(c.endMs / 1000),
  }));
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
  return rescaleIfImplausible(cues);
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
