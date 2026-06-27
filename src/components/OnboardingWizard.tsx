"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

// ---- shared shape -----------------------------------------------------------

type Intake = {
  subject?: string;
  rushLength?: string;
  finalLength?: string;
  keepDiscardRules?: string;
  editingStyle?: string;
  storyMessage?: string;
  narrativeStructure?: string;
  tone?: string;
  audience?: string;
  motionDesign?: boolean;
  colorGrading?: string;
  cuttingStyle?: string;
  bRoll?: string;
  zoomPunchIns?: boolean;
  music?: string;
};

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500";
const textareaClass = inputClass + " resize-y";
const primaryBtn =
  "rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 disabled:opacity-50";
const labelClass = "mb-1 block text-xs font-medium text-neutral-400";

const AGENT_LABELS: Record<string, string> = {
  derush: "DeRush agent",
  storytelling: "Storytelling agent",
  editing_style: "Editing-style agent",
};
const AGENT_BLURB: Record<string, string> = {
  derush: "Decides what to keep vs cut — filler, silences, retakes, tangents.",
  storytelling: "Shapes your storyline, vision and message into a narrative.",
  editing_style:
    "Image-level editing — motion design, color, cuts, b-roll, zoom, music.",
};

// ---- small field helpers ----------------------------------------------------

function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const missing = !!required && !value.trim();
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
        {hint ? <span className="text-neutral-600"> — {hint}</span> : null}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass + (missing ? " border-red-800/70" : "")}
      />
    </div>
  );
}

function AreaField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const missing = !!required && !value.trim();
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
        {hint ? <span className="text-neutral-600"> — {hint}</span> : null}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className={textareaClass + (missing ? " border-red-800/70" : "")}
      />
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-white"
      />
      {label}
    </label>
  );
}

function SliderField({
  label,
  hint,
  min,
  max,
  step,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  const current = Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : min;
  return (
    <div>
      <label className={labelClass + " flex items-baseline justify-between"}>
        <span>
          {label}
          {hint ? <span className="text-neutral-600"> — {hint}</span> : null}
        </span>
        <span className="text-sm font-medium text-neutral-200">
          {current} {unit}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(`${e.target.value} ${unit}`)}
        className="w-full accent-white"
      />
    </div>
  );
}

// Sensible starting answers so the questionnaire is pre-filled, not blank.
const SLIDER_DEFAULTS = { rushLength: "60 min", finalLength: "10 min" };
const PRESET_INTAKE: Intake = {
  subject: "Talking-head tutorials on woodworking",
  ...SLIDER_DEFAULTS,
  keepDiscardRules:
    "Cut filler words, long silences, retakes and tangents. Keep strong hooks and clear explanations.",
  editingStyle: "Tight and punchy, with a little breathing room",
  storyMessage:
    "Teach one useful idea the viewer can act on, and make it feel worth their time.",
  narrativeStructure: "Hook / build / payoff",
  tone: "Warm and conversational",
  audience: "Hobbyists and beginners getting into the craft",
  motionDesign: false,
  colorGrading: "Warm and natural",
  cuttingStyle: "Jump cuts with occasional J/L cuts",
  bRoll: "Over explanations and to cover cuts",
  zoomPunchIns: true,
  music: "Subtle background bed, lifting in the intro and outro",
};

// Fields the user must fill (sliders and checkboxes always carry a value).
const REQUIRED_BY_STEP: (keyof Intake)[][] = [
  ["subject"],
  ["keepDiscardRules", "editingStyle"],
  ["storyMessage", "narrativeStructure", "tone", "audience"],
  ["colorGrading", "cuttingStyle", "bRoll", "music"],
];

// ---- path choice ------------------------------------------------------------

function PathChoice({
  onPick,
}: {
  onPick: (source: "scratch" | "xml") => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Set up your editing agents</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-400">
        DeRush builds three AI agents tuned to how you edit. Pick how you want to
        get started.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="cursor-not-allowed rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 opacity-50">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Templates</h3>
            <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500">
              Coming soon
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-500">
            Start from a curated editing style.
          </p>
        </div>

        <button
          onClick={() => onPick("scratch")}
          className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-left transition hover:border-neutral-600"
        >
          <h3 className="font-medium">From scratch</h3>
          <p className="mt-2 text-sm text-neutral-400">
            Answer a few questions about your subject, lengths and editing
            style.
          </p>
        </button>

        <button
          onClick={() => onPick("xml")}
          className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-left transition hover:border-neutral-600"
        >
          <h3 className="font-medium">From your XML</h3>
          <p className="mt-2 text-sm text-neutral-400">
            Upload an edit export and let the AI learn your style, then review.
          </p>
        </button>
      </div>
    </div>
  );
}

// ---- questionnaire ----------------------------------------------------------

function ScratchForm({
  initial,
  onDone,
}: {
  initial?: Intake;
  onDone: () => void;
}) {
  const saveIntake = useMutation(api.onboarding.saveIntake);
  const generateAgents = useAction(api.agentsNode.generateAgents);

  const [form, setForm] = useState<Intake>(
    initial
      ? { motionDesign: false, zoomPunchIns: false, ...SLIDER_DEFAULTS, ...initial }
      : { ...PRESET_INTAKE }
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Intake>) => setForm((f) => ({ ...f, ...patch }));

  const filled = (k: keyof Intake) => String(form[k] ?? "").trim().length > 0;
  const stepComplete = REQUIRED_BY_STEP[step].every(filled);
  const allComplete = REQUIRED_BY_STEP.flat().every(filled);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!allComplete) {
      setError("Please fill in every field before generating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveIntake({ intake: form });
      await generateAgents();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const last = step === 3;

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3 flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={
              "h-1.5 flex-1 rounded-full " +
              (i <= step ? "bg-white" : "bg-neutral-800")
            }
          />
        ))}
      </div>
      <p className="mb-4 text-xs text-neutral-600">Every field is required.</p>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        {step === 0 && (
          <>
            <h2 className="text-sm font-semibold">The basics</h2>
            <TextField
              required
              label="Subject"
              hint="what the video is about"
              value={form.subject ?? ""}
              onChange={(v) => set({ subject: v })}
              placeholder="e.g. talking-head tutorials on woodworking"
            />
            <SliderField
              label="Rush length"
              hint="raw footage to de-rush"
              min={5}
              max={240}
              step={5}
              unit="min"
              value={form.rushLength ?? "60 min"}
              onChange={(v) => set({ rushLength: v })}
            />
            <SliderField
              label="Final length"
              hint="desired result"
              min={1}
              max={60}
              step={1}
              unit="min"
              value={form.finalLength ?? "10 min"}
              onChange={(v) => set({ finalLength: v })}
            />
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-sm font-semibold">De-rush rules</h2>
            <AreaField
              required
              label="Keep / discard rules"
              hint="what to cut, what to always keep"
              value={form.keepDiscardRules ?? ""}
              onChange={(v) => set({ keepDiscardRules: v })}
              placeholder="Cut filler words, long silences, retakes and tangents. Keep strong hooks and clear explanations."
            />
            <TextField
              required
              label="Editing pace"
              hint="overall feel"
              value={form.editingStyle ?? ""}
              onChange={(v) => set({ editingStyle: v })}
              placeholder="e.g. tight and punchy, with a little breathing room"
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-sm font-semibold">Storytelling</h2>
            <AreaField
              required
              label="Vision / message"
              hint="the why of the video"
              value={form.storyMessage ?? ""}
              onChange={(v) => set({ storyMessage: v })}
              placeholder="What should the viewer feel or take away?"
            />
            <TextField
              required
              label="Narrative structure"
              value={form.narrativeStructure ?? ""}
              onChange={(v) => set({ narrativeStructure: v })}
              placeholder="e.g. hook / build / payoff"
            />
            <TextField
              required
              label="Tone"
              value={form.tone ?? ""}
              onChange={(v) => set({ tone: v })}
              placeholder="e.g. warm and conversational"
            />
            <TextField
              required
              label="Audience"
              value={form.audience ?? ""}
              onChange={(v) => set({ audience: v })}
              placeholder="who it's for"
            />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-sm font-semibold">Image-level editing</h2>
            <div className="flex flex-wrap gap-6 py-1">
              <CheckField
                label="Use motion design / animated text"
                checked={form.motionDesign ?? false}
                onChange={(v) => set({ motionDesign: v })}
              />
              <CheckField
                label="Use zoom / punch-ins on emphasis"
                checked={form.zoomPunchIns ?? false}
                onChange={(v) => set({ zoomPunchIns: v })}
              />
            </div>
            <TextField
              required
              label="Color grading"
              value={form.colorGrading ?? ""}
              onChange={(v) => set({ colorGrading: v })}
              placeholder="e.g. warm filmic, natural"
            />
            <TextField
              required
              label="Cutting style"
              value={form.cuttingStyle ?? ""}
              onChange={(v) => set({ cuttingStyle: v })}
              placeholder="e.g. jump cuts, J/L cuts, match cuts"
            />
            <TextField
              required
              label="B-roll"
              value={form.bRoll ?? ""}
              onChange={(v) => set({ bRoll: v })}
              placeholder="when and where to place b-roll"
            />
            <TextField
              required
              label="Music"
              value={form.music ?? ""}
              onChange={(v) => set({ music: v })}
              placeholder="style and when to use it"
            />
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className={secondaryBtn}
        >
          Back
        </button>
        {last ? (
          <button
            type="submit"
            disabled={submitting || !allComplete}
            className={primaryBtn}
          >
            {submitting ? "Generating your agents…" : "Generate agents"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={!stepComplete}
            className={primaryBtn}
          >
            Next
          </button>
        )}
      </div>
    </form>
  );
}

// ---- XML upload -------------------------------------------------------------

function XmlUpload({ onDone }: { onDone: () => void }) {
  const generateUploadUrl = useMutation(api.onboarding.generateUploadUrl);
  const recordXmlUpload = useMutation(api.onboarding.recordXmlUpload);
  const analyzeXml = useAction(api.agentsNode.analyzeXml);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"upload" | "analyzing" | "edit">("upload");
  const [prefill, setPrefill] = useState<Intake>({});
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!file) return;
    setPhase("analyzing");
    setError(null);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "text/xml" },
        body: file,
      });
      const { storageId } = await res.json();
      await recordXmlUpload({ storageId, filename: file.name });
      const intake = (await analyzeXml()) as Intake;
      setPrefill(intake ?? {});
      setPhase("edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("upload");
    }
  }

  if (phase === "edit") {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Review your style</h1>
        <p className="mb-6 text-sm text-neutral-400">
          We prefilled these from your edit. Tweak anything, then generate your
          agents.
        </p>
        <ScratchForm initial={prefill} onDone={onDone} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Learn from your XML</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Upload an edit export (FCPXML, Premiere XML or EDL). The AI reads it and
        prefills your style.
      </p>
      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <input
          type="file"
          accept=".xml,.fcpxml,.edl,text/xml,application/xml"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={handleAnalyze}
          disabled={!file || phase === "analyzing"}
          className={primaryBtn}
        >
          {phase === "analyzing" ? "Analyzing…" : "Analyze & continue"}
        </button>
      </div>
    </div>
  );
}

// ---- agent review -----------------------------------------------------------

function AgentCard({
  id,
  kind,
  systemPrompt,
}: {
  id: Id<"agents">;
  kind: string;
  systemPrompt: string;
}) {
  const editAgentPrompt = useMutation(api.agents.editAgentPrompt);
  const [value, setValue] = useState(systemPrompt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await editAgentPrompt({ agentId: id, systemPrompt: value });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div>
        <h3 className="font-medium">{AGENT_LABELS[kind] ?? kind}</h3>
        <p className="text-xs text-neutral-500">{AGENT_BLURB[kind]}</p>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={8}
        className={textareaClass}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className={secondaryBtn}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-neutral-500">Saved</span>}
      </div>
    </div>
  );
}

function AgentReview() {
  const state = useQuery(api.onboarding.getState);
  const generateAgents = useAction(api.agentsNode.generateAgents);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);
  const router = useRouter();

  const [regenerating, setRegenerating] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = state?.agents ?? [];
  const ordered = ["derush", "storytelling", "editing_style"]
    .map((k) => agents.find((a) => a.kind === k))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  async function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await completeOnboarding();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish");
      setFinishing(false);
    }
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      await generateAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  if (state === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Your agents</h1>
      <p className="mb-6 text-sm text-neutral-400">
        These three agents are the heart of DeRush. Edit any prompt, then finish
        to activate them.
      </p>
      <div className="space-y-4">
        {ordered.map((a) => (
          <AgentCard
            key={a._id}
            id={a._id}
            kind={a.kind}
            systemPrompt={a.systemPrompt}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={handleRegenerate}
          disabled={regenerating || finishing}
          className={secondaryBtn}
        >
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
        <button
          onClick={handleFinish}
          disabled={finishing || ordered.length < 3}
          className={primaryBtn}
        >
          {finishing ? "Finishing…" : "Finish & activate"}
        </button>
      </div>
    </div>
  );
}

// ---- wizard state machine ---------------------------------------------------

type Step = "choose" | "scratch" | "xml" | "review";

function Wizard() {
  const state = useQuery(api.onboarding.getState);
  const startOnboarding = useMutation(api.onboarding.startOnboarding);
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);

  // Derive the initial step once the profile loads, and bounce finished users.
  useEffect(() => {
    if (state === undefined || step !== null) return;
    const status = state.profile?.status;
    if (status === "completed") {
      router.replace("/dashboard");
    } else if (status === "agents_generated") {
      setStep("review");
    } else {
      setStep("choose");
    }
  }, [state, step, router]);

  async function pick(source: "scratch" | "xml") {
    await startOnboarding({ source });
    setStep(source);
  }

  if (state === undefined || step === null) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  switch (step) {
    case "choose":
      return <PathChoice onPick={pick} />;
    case "scratch":
      return <ScratchForm onDone={() => setStep("review")} />;
    case "xml":
      return <XmlUpload onDone={() => setStep("review")} />;
    case "review":
      return <AgentReview />;
  }
}

export function OnboardingWizard() {
  return (
    <>
      <AuthLoading>
        <p className="text-sm text-neutral-500">Connecting…</p>
      </AuthLoading>
      <Authenticated>
        <Wizard />
      </Authenticated>
    </>
  );
}
