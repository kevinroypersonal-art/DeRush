// Deterministic SRT / (loose) VTT parser. Pure — imported by the parse action.

export type ParsedCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

// Reject absurdly large uploads before parsing.
export const MAX_SRT_CHARS = 2_000_000;

// Matches both SRT ("HH:MM:SS,mmm") and VTT ("HH:MM:SS.mmm") timestamps.
const TS = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

function toMs(h: string, m: string, s: string, ms: string): number {
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms);
}

export function parseSrt(input: string): ParsedCue[] {
  if (input.length > MAX_SRT_CHARS) {
    throw new Error("Transcript is too large to process.");
  }
  // Normalize newlines, strip a BOM and an optional WEBVTT header line.
  const text = input
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^WEBVTT.*\n/, "");

  const blocks = text.split(/\n{2,}/);
  const cues: ParsedCue[] = [];
  let idx = 0;

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    // The first line may be a numeric counter (SRT) or the timing line (VTT);
    // find the line that actually carries the "-->" range.
    const timingLine = lines.find((l) => l.includes("-->"));
    if (!timingLine) continue;

    const [lhs, rhs] = timingLine.split("-->");
    const a = TS.exec(lhs ?? "");
    const b = TS.exec(rhs ?? "");
    if (!a || !b) continue;

    const startMs = toMs(a[1], a[2], a[3], a[4]);
    const endMs = toMs(b[1], b[2], b[3], b[4]);
    if (endMs <= startMs) continue; // skip degenerate cues

    const textLines = lines.slice(lines.indexOf(timingLine) + 1);
    const cueText = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip basic tags
      .replace(/\s+/g, " ")
      .trim();
    if (!cueText) continue;

    cues.push({ index: idx++, startMs, endMs, text: cueText });
  }

  return cues;
}
