import { desc, eq } from "drizzle-orm";
import { type Database, mortgageCases } from "./schema.ts";

/** A stored case with ids as strings and the JSON columns still as text. */
export interface MortgageCaseRow {
  applicantName: string;
  checksJson: string;
  createdAt: string;
  decidedAt: string | null;
  decision: string | null;
  decisionNote: string | null;
  dossierJson: string;
  fileNames: string;
  id: string;
  proposalJson: string | null;
}

function toRow(r: typeof mortgageCases.$inferSelect): MortgageCaseRow {
  return { ...r, id: String(r.id) };
}

export async function insertMortgageCase(
  db: Database,
  values: Pick<
    MortgageCaseRow,
    "applicantName" | "checksJson" | "dossierJson" | "fileNames"
  >
): Promise<MortgageCaseRow> {
  const [row] = await db
    .insert(mortgageCases)
    .values({ ...values, createdAt: new Date().toISOString() })
    .returning();
  if (!row) {
    throw new Error("Case was inserted but could not be read back.");
  }
  return toRow(row);
}

export async function getMortgageCase(
  db: Database,
  id: number
): Promise<MortgageCaseRow | null> {
  const [row] = await db
    .select()
    .from(mortgageCases)
    .where(eq(mortgageCases.id, id));
  return row ? toRow(row) : null;
}

export async function listMortgageCases(
  db: Database
): Promise<MortgageCaseRow[]> {
  const rows = await db
    .select()
    .from(mortgageCases)
    .orderBy(desc(mortgageCases.id))
    .limit(50);
  return rows.map(toRow);
}

export async function updateMortgageCase(
  db: Database,
  id: number,
  values: Partial<
    Pick<
      MortgageCaseRow,
      "proposalJson" | "decision" | "decisionNote" | "decidedAt"
    >
  >
): Promise<void> {
  await db.update(mortgageCases).set(values).where(eq(mortgageCases.id, id));
}
