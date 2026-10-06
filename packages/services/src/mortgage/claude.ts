// The two model steps. Claude reads the documents and writes the text; the
// numbers and pass/fail come from rules.ts and dossier.ts, never from here.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { type Dossier, dossierSchema, type Finding } from "./dossier.ts";
import type { Fix, MortgageAssessment } from "./rules.ts";

export const MODEL = "claude-opus-5-5";

/** A file as the browser sends it. */
export interface PdfFile {
  /** Base64 without the data: prefix. */
  data: string;
  name: string;
}

const EXTRACT_PROMPT = `You are reading the mortgage dossier of one applicant at a Swiss bank. The documents are in German.
Identify each document by its content (not its file name) and fill in the matching section of the schema. Copy numbers exactly as printed, as plain numbers in CHF without separators. Use null for a document or field that is not in the dossier. Dates as YYYY-MM-DD.
Under observations, note anything a mortgage advisor should notice when comparing the documents with each other. Do not judge the application against any lending rules; that happens later.
Reply with one JSON object and nothing else, matching this JSON Schema:
${JSON.stringify(z.toJSONSchema(dossierSchema))}`;

const JSON_FENCE = /^```(?:json)?\s*|\s*```$/g;

export const proposalSchema = z.object({
  conditions: z
    .array(z.string())
    .describe("Conditions or open points before payout; empty if none"),
  kreditantrag: z.string().describe("The one-page credit proposal in Markdown"),
  reasons: z.array(z.string()).describe("One sentence each, cite the numbers"),
  recommendation: z.enum(["approve", "approve_with_conditions", "reject"]),
  summary: z
    .string()
    .describe("Two or three plain sentences for the credit officer"),
});

export type Proposal = z.infer<typeof proposalSchema>;

const PROPOSAL_PROMPT = `You are a mortgage advisor at Bank Zürichsee AG writing for the credit officer.
You get the data extracted from the applicant's documents, the result of the bank's rule engine, the consistency findings, and the fixes the rule engine computed. The rule engine is authoritative: do not recompute or contradict its numbers or its pass/fail. Recommend reject when any rule fails, unless a computed fix is already agreed in the documents. A paid debt-register entry is a point to clarify, not a reason to reject.
Write the kreditantrag (credit proposal) in English Markdown, one page, with these sections: Applicant, Property and financing, Equity, Affordability (show interest, maintenance, amortization, total, ratio), Findings from the documents, Recommendation, Conditions. Use CHF with apostrophes as thousands separators (CHF 1'250'000). Keep German document names in parentheses where helpful.`;

export function createClaude(apiKey: string | undefined): Anthropic {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Put it in apps/web/.dev.vars for local development."
    );
  }
  return new Anthropic({ apiKey });
}

function ensureNotRefused(stopReason: string | null) {
  if (stopReason === "refusal") {
    throw new Error("Claude declined this request.");
  }
  if (stopReason === "max_tokens") {
    throw new Error("Claude's answer was cut off. Try again.");
  }
}

/** Step 1: read all documents in one call. */
export async function extractDossier(
  client: Anthropic,
  files: PdfFile[]
): Promise<Dossier> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = files.flatMap((f) => [
    { text: `Document file: ${f.name}`, type: "text" as const },
    {
      source: {
        data: f.data,
        media_type: "application/pdf" as const,
        type: "base64" as const,
      },
      type: "document" as const,
    },
  ]);
  content.push({ text: EXTRACT_PROMPT, type: "text" });

  const response = await client.beta.messages.parse({
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 16_000,
    messages: [{ content, role: "user" }],
    model: MODEL,
    // No strict format here: the dossier schema compiles to a grammar that
    // the API rejects as too large, so we validate with zod instead.
    output_config: { effort: "medium" },
  });
  ensureNotRefused(response.stop_reason);
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim()
    .replace(JSON_FENCE, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error("Claude's extraction was not valid JSON. Try again.", {
      cause: error,
    });
  }
  const parsed = dossierSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Claude's extraction did not match the schema.");
  }
  return parsed.data;
}

/** Step 2: the decision proposal and the Kreditantrag, from the checked facts. */
export async function draftProposal(
  client: Anthropic,
  facts: {
    dossier: Dossier;
    assessment: MortgageAssessment;
    findings: Finding[];
    fixes: Fix[];
    missing: string[];
  }
): Promise<Proposal> {
  const response = await client.beta.messages.parse({
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 16_000,
    messages: [
      {
        content: `${PROPOSAL_PROMPT}\n\n<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>`,
        role: "user",
      },
    ],
    model: MODEL,
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(proposalSchema),
    },
  });
  ensureNotRefused(response.stop_reason);
  if (!response.parsed_output) {
    throw new Error("Claude's proposal did not match the schema.");
  }
  return response.parsed_output;
}
