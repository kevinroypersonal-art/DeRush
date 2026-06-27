// Pure, runtime-agnostic edit helpers shared by the Convex query/mutation layer
// (projects.ts) and the Node action layer (projectsNode.ts). Keeping these in one
// place avoids drift in the integrity-critical selection/trim logic. No "use node"
// so it imports cleanly from both runtimes (like xmeml.ts).
import { Id } from "./_generated/dataModel";
import { XmemlClip } from "./xmeml";

export type Selection = {
  segmentId: Id<"segments">;
  order: number;
  trimStartMs: number;
  trimEndMs: number;
  rationale: string;
};

// Ordered cue indices → editPlan selections (untrimmed). Integrity-safe: only
// indices present in byIndex survive, de-duplicated, preserving play order.
export function selectionsFromIndexes(
  indexes: number[],
  byIndex: Map<number, { _id: Id<"segments"> }>
): Selection[] {
  const seen = new Set<number>();
  const out: Selection[] = [];
  for (const ix of indexes) {
    const seg = byIndex.get(ix);
    if (!seg || seen.has(ix)) continue;
    seen.add(ix);
    out.push({
      segmentId: seg._id,
      order: out.length,
      trimStartMs: 0,
      trimEndMs: 0,
      rationale: "",
    });
  }
  return out;
}

// Clamp head/tail trims to the segment's duration and produce the source clip.
// A trim that would consume the whole segment is dropped (no trim).
export function clipFromSegment(
  seg: { startMs: number; endMs: number },
  trimStartMs: number,
  trimEndMs: number
): { clip: XmemlClip; trimStartMs: number; trimEndMs: number } {
  const dur = seg.endMs - seg.startMs;
  let ts = Math.max(0, Math.round(trimStartMs || 0));
  let te = Math.max(0, Math.round(trimEndMs || 0));
  if (ts + te >= dur) {
    ts = 0;
    te = 0;
  }
  return {
    clip: { sourceStartMs: seg.startMs + ts, sourceEndMs: seg.endMs - te },
    trimStartMs: ts,
    trimEndMs: te,
  };
}
