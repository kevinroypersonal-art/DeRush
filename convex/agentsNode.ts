"use node";

import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

// Synthesis is intelligence-sensitive and runs once per onboarding, so latency
// and cost are not hot-path — Opus is justified. `claude-sonnet-4-6` is a cheaper
// option for the XML extraction step if cost becomes a concern.
const MODEL = "claude-opus-4-8";

// Guard against blowing the context window / cost on large project XMLs.
const MAX_XML_CHARS = 500_000;

// The intake fields, as a JSON-schema property map. Shared by the XML-analysis
// output schema below. NOTE: strict structured outputs branch on every OPTIONAL
// property, so an object with many optionals trips Anthropic's "Schema is too
// complex" guard. We therefore mark every field `required` (see INTAKE_KEYS) and
// instruct the model to emit "" / false for anything it can't infer.
const INTAKE_PROPERTIES = {
  subject: { type: "string" },
  rushLength: { type: "string" },
  finalLength: { type: "string" },
  keepDiscardRules: { type: "string" },
  editingStyle: { type: "string" },
  storyMessage: { type: "string" },
  narrativeStructure: { type: "string" },
  tone: { type: "string" },
  audience: { type: "string" },
  motionDesign: { type: "boolean" },
  colorGrading: { type: "string" },
  cuttingStyle: { type: "string" },
  bRoll: { type: "string" },
  zoomPunchIns: { type: "boolean" },
  music: { type: "string" },
};

const INTAKE_KEYS = Object.keys(INTAKE_PROPERTIES);

// `new Anthropic()` reads ANTHROPIC_API_KEY from the Convex deployment env.
// Set it with: npx convex env set ANTHROPIC_API_KEY sk-ant-...
function client() {
  return new Anthropic();
}

// Pull the JSON text block out of a Messages response.
function jsonFromResponse(resp: Anthropic.Message): unknown {
  const block = resp.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "{}";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Model did not return valid JSON");
  }
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Analyze the uploaded edit XML and prefill the questionnaire. Format-agnostic:
// Claude reads FCPXML / Premiere XML / EDL alike from the raw text.
export const analyzeXml = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const ownerId = await requireUserId(ctx);
    const profile = await ctx.runQuery(
      internal.onboarding._getProfileForUser,
      { ownerId }
    );
    if (!profile || !profile.xmlStorageId) {
      throw new Error("No XML uploaded");
    }
    const blob = await ctx.storage.get(profile.xmlStorageId);
    if (!blob) {
      throw new Error("Uploaded XML not found");
    }
    let xmlText = await blob.text();
    if (xmlText.length > MAX_XML_CHARS) {
      xmlText = xmlText.slice(0, MAX_XML_CHARS) + "\n…[truncated]";
    }

    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["intake", "analysisNotes"],
            properties: {
              intake: {
                type: "object",
                additionalProperties: false,
                required: INTAKE_KEYS,
                properties: INTAKE_PROPERTIES,
              },
              analysisNotes: { type: "string" },
            },
          },
        },
      },
      system:
        "You are a senior video editor analyzing an exported editing-project file. " +
        "The format is unknown (could be FCPXML, Premiere Pro XML, EDL, or another). " +
        "Extract style signals: pacing, cut density, use of b-roll, color/motion cues, " +
        "and overall structure. From those signals infer sensible defaults for an intake " +
        "questionnaire that describes how this editor works. Do not invent facts the file " +
        "does not support — for any field you genuinely cannot infer, return an empty " +
        "string (or false for the yes/no fields) rather than guessing.",
      messages: [
        {
          role: "user",
          content:
            "Here is the exported edit file. Fill in the intake fields you can infer " +
            "(empty string when unknown), and summarize what you found in analysisNotes.\n\n" +
            xmlText,
        },
      ],
    });

    const parsed = jsonFromResponse(resp) as {
      intake?: Record<string, unknown>;
      analysisNotes?: string;
    };
    const intake = (parsed.intake ?? {}) as Record<string, unknown>;
    await ctx.runMutation(internal.agents.setXmlAnalysis, {
      ownerId,
      // Validators on setXmlAnalysis enforce the shape; pass through what we got.
      intake: intake as any,
      analysisRaw: parsed.analysisNotes ?? "",
    });
    return intake;
  },
});

// Generate the 3 specialized agent system prompts from the user's intake.
export const generateAgents = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const profile = await ctx.runQuery(
      internal.onboarding._getProfileForUser,
      { ownerId }
    );
    if (!profile || !profile.intake) {
      throw new Error("No questionnaire answers to generate from");
    }
    const source = profile.source === "xml" ? "xml" : "scratch";

    let userContent =
      "Here are the editor's intake answers as JSON:\n\n" +
      JSON.stringify(profile.intake, null, 2);
    if (profile.xmlAnalysisRaw) {
      userContent +=
        "\n\nAdditional signals extracted from their uploaded edit file:\n" +
        profile.xmlAnalysisRaw;
    }

    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["derush", "storytelling", "editing_style"],
            properties: {
              derush: { type: "string" },
              storytelling: { type: "string" },
              editing_style: { type: "string" },
            },
          },
        },
      },
      system:
        "You write system prompts for three specialized AI video-editing agents that will " +
        "operate on a user's raw footage. Given the user's intake answers, produce a focused, " +
        "operational, directive system prompt for each agent — concrete enough to be used as-is.\n\n" +
        "- derush: decides which parts of the rush are kept vs discarded (filler, silences, " +
        "retakes, tangents, pacing).\n" +
        "- storytelling: shapes the storyline from the editor's vision/message, narrative " +
        "structure (hook/build/payoff), tone, and audience.\n" +
        "- editing_style: image-level editing — motion design, colorimetry, cutting style, " +
        "b-roll placement, zoom/punch-ins, and music.\n\n" +
        "Write each prompt in the second person ('You are...'). Keep each to a few tight paragraphs.",
      messages: [{ role: "user", content: userContent }],
    });

    const parsed = jsonFromResponse(resp) as {
      derush: string;
      storytelling: string;
      editing_style: string;
    };

    await ctx.runMutation(internal.agents.upsertAgents, {
      ownerId,
      source,
      agents: [
        { kind: "derush", systemPrompt: parsed.derush },
        { kind: "storytelling", systemPrompt: parsed.storytelling },
        { kind: "editing_style", systemPrompt: parsed.editing_style },
      ],
    });
  },
});
