// The mortgage check as one service: documents in, Claude extracts, the rule
// engine decides the numbers, Claude drafts the text, a person decides.
import type { Database } from "@repo/db";
import {
  getMortgageCase,
  insertMortgageCase,
  listMortgageCases,
  type MortgageCaseRow,
  updateMortgageCase,
} from "@repo/db/mortgage";
import { z } from "zod";
import {
  createClaude,
  draftProposal,
  extractDossier,
  type Proposal,
} from "./claude.ts";
import {
  checkConsistency,
  type Dossier,
  type Finding,
  missingDocuments,
  toMortgageInput,
} from "./dossier.ts";
import {
  assessMortgage,
  type Fix,
  type MortgageAssessment,
  suggestFixes,
} from "./rules.ts";

const MAX_FILES = 12;
// Base64 of a 5 MB PDF. The demo files are a few KB each.
const MAX_FILE_CHARS = 7_000_000;

export const analyzeInput = z.object({
  files: z
    .array(
      z.object({
        data: z.string().min(1).max(MAX_FILE_CHARS, "A file is too large."),
        name: z.string().min(1).max(200),
      })
    )
    .min(1, "Add at least one PDF.")
    .max(MAX_FILES, `At most ${MAX_FILES} files.`),
});

export const caseIdInput = z.object({ id: z.coerce.number().int().positive() });

export const decideInput = caseIdInput.extend({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000),
});

export interface Checks {
  /** null when the documents give no price, so no rule can run. */
  assessment: MortgageAssessment | null;
  findings: Finding[];
  fixes: Fix[];
  missing: string[];
}

/** A case as it leaves the service: plain JSON. */
export interface MortgageCase {
  applicantName: string;
  checks: Checks;
  createdAt: string;
  decidedAt: string | null;
  decision: "approved" | "rejected" | null;
  decisionNote: string | null;
  dossier: Dossier;
  fileNames: string[];
  id: string;
  proposal: Proposal | null;
}

function fromRow(r: MortgageCaseRow): MortgageCase {
  return {
    applicantName: r.applicantName,
    checks: JSON.parse(r.checksJson) as Checks,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    decision: r.decision as MortgageCase["decision"],
    decisionNote: r.decisionNote,
    dossier: JSON.parse(r.dossierJson) as Dossier,
    fileNames: JSON.parse(r.fileNames) as string[],
    id: r.id,
    proposal: r.proposalJson ? (JSON.parse(r.proposalJson) as Proposal) : null,
  };
}

/** Every deterministic check on an extracted dossier. */
export function runChecks(dossier: Dossier, today = new Date()): Checks {
  const input = toMortgageInput(dossier, today);
  const assessment = input ? assessMortgage(input) : null;
  return {
    assessment,
    findings: checkConsistency(dossier),
    fixes: assessment ? suggestFixes(assessment) : [],
    missing: missingDocuments(dossier),
  };
}

export interface MortgageService {
  analyze: (input: z.input<typeof analyzeInput>) => Promise<MortgageCase>;
  decide: (input: z.input<typeof decideInput>) => Promise<MortgageCase>;
  get: (input: z.input<typeof caseIdInput>) => Promise<MortgageCase | null>;
  list: () => Promise<MortgageCase[]>;
  propose: (input: z.input<typeof caseIdInput>) => Promise<MortgageCase>;
}

export const createMortgageService = (
  db: Database,
  apiKey: string | undefined
): MortgageService => {
  const load = async (id: number) => {
    const row = await getMortgageCase(db, id);
    if (!row) {
      throw new Error(`No case ${id}.`);
    }
    return fromRow(row);
  };

  return {
    analyze: async (raw) => {
      const { files } = analyzeInput.parse(raw);
      const dossier = await extractDossier(createClaude(apiKey), files);
      const checks = runChecks(dossier);
      const row = await insertMortgageCase(db, {
        applicantName:
          dossier.application?.applicantName ??
          dossier.salaryCertificate?.employeeName ??
          "Unknown applicant",
        checksJson: JSON.stringify(checks),
        dossierJson: JSON.stringify(dossier),
        fileNames: JSON.stringify(files.map((f) => f.name)),
      });
      return fromRow(row);
    },

    decide: async (raw) => {
      const { id, decision, note } = decideInput.parse(raw);
      await updateMortgageCase(db, id, {
        decidedAt: new Date().toISOString(),
        decision,
        decisionNote: note,
      });
      return load(id);
    },

    get: async (raw) => {
      const { id } = caseIdInput.parse(raw);
      const row = await getMortgageCase(db, id);
      return row ? fromRow(row) : null;
    },

    list: async () => (await listMortgageCases(db)).map(fromRow),

    propose: async (raw) => {
      const { id } = caseIdInput.parse(raw);
      const c = await load(id);
      if (!c.checks.assessment) {
        throw new Error("No purchase price in the documents, so no proposal.");
      }
      const proposal = await draftProposal(createClaude(apiKey), {
        assessment: c.checks.assessment,
        dossier: c.dossier,
        findings: c.checks.findings,
        fixes: c.checks.fixes,
        missing: c.checks.missing,
      });
      await updateMortgageCase(db, id, {
        proposalJson: JSON.stringify(proposal),
      });
      return { ...c, proposal };
    },
  };
};
