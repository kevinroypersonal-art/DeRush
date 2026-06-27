// Deterministic Premiere Pro XMEML (xmeml v4) builder. Pure — imported by the
// generate action. We only have a transcript, so this is a "paper edit": every
// clip references one shared placeholder media file that the editor relinks on
// import. Timeline is sequential (no gaps), in the order chosen by the agents.

export type XmemlClip = {
  sourceStartMs: number; // in-point into the source media (cue start + head trim)
  sourceEndMs: number; // out-point (cue end - tail trim)
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildXmeml(opts: {
  name: string;
  srtFilename: string;
  fps: number;
  sourceDurationMs: number;
  clips: XmemlClip[];
}): string {
  const { name, srtFilename, fps, sourceDurationMs, clips } = opts;
  const f = (ms: number) => Math.max(0, Math.round((ms / 1000) * fps));
  const fileDur = Math.max(1, f(sourceDurationMs));
  const clipName = esc(srtFilename || "source");
  const pathurl = esc(
    `file://localhost/RELINK_ME/${encodeURIComponent(srtFilename || "source")}`
  );

  const fileBlock = (first: boolean) =>
    first
      ? `<file id="src-media">
              <name>${clipName}</name>
              <pathurl>${pathurl}</pathurl>
              <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
              <duration>${fileDur}</duration>
              <media><video/><audio/></media>
            </file>`
      : `<file id="src-media"/>`;

  const links = (i: number) =>
    `<link><linkclipref>v-${i}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>
            <link><linkclipref>a-${i}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>`;

  const videoItems: string[] = [];
  const audioItems: string[] = [];
  let cursor = 0;

  clips.forEach((c, i) => {
    const inF = f(c.sourceStartMs);
    const outF = Math.max(inF + 1, f(c.sourceEndMs));
    const dur = outF - inF;
    const start = cursor;
    const end = cursor + dur;
    cursor = end;

    videoItems.push(`<clipitem id="v-${i}">
            <name>${clipName}</name>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${fileDur}</duration>
            <in>${inF}</in><out>${outF}</out>
            <start>${start}</start><end>${end}</end>
            ${fileBlock(i === 0)}
            ${links(i)}
          </clipitem>`);

    audioItems.push(`<clipitem id="a-${i}">
            <name>${clipName}</name>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <duration>${fileDur}</duration>
            <in>${inF}</in><out>${outF}</out>
            <start>${start}</start><end>${end}</end>
            <file id="src-media"/>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            ${links(i)}
          </clipitem>`);
  });

  const total = cursor;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${esc(name)}</name>
    <duration>${total}</duration>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <width>1920</width>
            <height>1080</height>
          </samplecharacteristics>
        </format>
        <track>
          ${videoItems.join("\n          ")}
        </track>
      </video>
      <audio>
        <track>
          ${audioItems.join("\n          ")}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`;
}
