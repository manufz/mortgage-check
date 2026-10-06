// What Claude reads out of an applicant's documents, and the deterministic
// checks that compare the documents with each other. The schema doubles as
// the structured-output format, so Claude's reply always has this shape.
import { z } from "zod";
import type { MortgageInput } from "./rules.ts";

const chf = z.number().nullable().describe("Amount in CHF, or null if absent");
const name = z.string().nullable().describe("Person's name as printed");

export const dossierSchema = z.object({
  application: z
    .object({
      applicantName: name,
      bankSavings: chf,
      birthDate: z.string().nullable().describe("ISO date YYYY-MM-DD"),
      pensionWithdrawal: chf.describe("Vorbezug Pensionskasse (WEF), CHF"),
      propertyAddress: z.string().nullable(),
      purchasePrice: chf,
      requestedMortgage: chf,
      securities: chf,
      statedGrossIncome: chf,
      statedIncomeNote: z
        .string()
        .nullable()
        .describe("Any remark next to the stated income, verbatim"),
      totalEquity: chf,
      yearlyDebtObligations: chf.describe("Leasing, loans, alimony per year"),
    })
    .nullable()
    .describe("01 Hypothekarantrag (application form)"),
  bankStatement: z
    .object({
      cash: chf.describe("Sum of all account balances"),
      customerName: name,
      date: z.string().nullable().describe("ISO date"),
      securities: chf,
      total: chf,
    })
    .nullable()
    .describe("06 Vermögensausweis (bank statement of assets)"),
  debtRegister: z
    .object({
      entries: z.array(
        z.object({
          amount: z.number(),
          creditor: z.string(),
          date: z.string().describe("ISO date"),
          status: z.string().describe("Status text, translated to English"),
        })
      ),
      extractDate: z.string().nullable().describe("ISO date"),
      personName: name,
    })
    .nullable()
    .describe("04 Betreibungsregisterauszug (debt enforcement register)"),
  observations: z
    .array(z.string())
    .describe(
      "Anything else a mortgage advisor should notice across the documents, in English, one sentence each. Empty if nothing."
    ),
  pensionStatement: z
    .object({
      alreadyWithdrawn: chf,
      insuredName: name,
      maxHomeWithdrawal: chf.describe("Maximal möglicher WEF-Vorbezug"),
      requestedWithdrawal: chf.describe("Beantragter WEF-Vorbezug"),
      retirementSavings: chf.describe("Altersguthaben"),
    })
    .nullable()
    .describe("05 Vorsorgeausweis (pension statement)"),
  salaryCertificate: z
    .object({
      baseSalary: chf,
      bonus: chf.describe("Unregelmässige Leistungen"),
      employeeName: name,
      grossSalaryTotal: chf.describe("8. Bruttolohn total"),
      netSalary: chf,
      year: z.number().nullable(),
    })
    .nullable()
    .describe("02 Lohnausweis (salary certificate)"),
  salesDocumentation: z
    .object({
      description: z.string().nullable().describe("One short line"),
      price: chf,
      propertyAddress: z.string().nullable(),
    })
    .nullable()
    .describe("07 Verkaufsdokumentation (sales documentation)"),
  taxReturn: z
    .object({
      bankAssets: chf,
      debts: chf,
      netSalary: chf,
      securities: chf,
      taxpayerName: name,
    })
    .nullable()
    .describe("03 Steuererklärung summary"),
});

export type Dossier = z.infer<typeof dossierSchema>;

export const DOCUMENT_KEYS = [
  "application",
  "salaryCertificate",
  "taxReturn",
  "debtRegister",
  "pensionStatement",
  "bankStatement",
  "salesDocumentation",
] as const satisfies readonly (keyof Dossier)[];

export const DOCUMENT_LABELS: Record<(typeof DOCUMENT_KEYS)[number], string> = {
  application: "Application form",
  bankStatement: "Bank statement of assets",
  debtRegister: "Debt enforcement register",
  pensionStatement: "Pension statement",
  salaryCertificate: "Salary certificate 2025",
  salesDocumentation: "Sales documentation",
  taxReturn: "Tax return 2025",
};

export interface Finding {
  detail: string;
  severity: "high" | "medium" | "info";
  /** Which documents disagree, by DOCUMENT_KEYS. */
  sources: string[];
  title: string;
}

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const fmt = (n: number) =>
  `CHF ${Math.round(n).toString().replace(THOUSANDS, "'")}`;

/** Differences under 1% (or CHF 100) are rounding, not a finding. */
const differs = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === "number" &&
  typeof b === "number" &&
  Math.abs(a - b) > Math.max(100, 0.01 * Math.max(a, b));

const WHITESPACE = /\s+/g;
const normName = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(WHITESPACE, " ").trim();

export function missingDocuments(d: Dossier): string[] {
  return DOCUMENT_KEYS.filter((k) => !d[k]).map((k) => DOCUMENT_LABELS[k]);
}

const PAID_STATUS = /paid|bezahlt|settled/i;

type Check = (d: Dossier) => Finding[];

const incomeCheck: Check = ({ application: app, salaryCertificate: sal }) => {
  if (!(app && sal && differs(app.statedGrossIncome, sal.grossSalaryTotal))) {
    return [];
  }
  const note = app.statedIncomeNote ? ` ("${app.statedIncomeNote}")` : "";
  const bonusNote =
    (sal.bonus ?? 0) === 0 ? " The salary certificate shows no bonus." : "";
  return [
    {
      detail: `The application states ${fmt(app.statedGrossIncome ?? 0)}${note}, the salary certificate shows ${fmt(sal.grossSalaryTotal ?? 0)}.${bonusNote} Affordability uses the documented figure.`,
      severity: "high",
      sources: ["application", "salaryCertificate"],
      title: "Stated income is higher than the salary certificate",
    },
  ];
};

const netSalaryCheck: Check = ({ salaryCertificate: sal, taxReturn: tax }) =>
  sal && tax && differs(sal.netSalary, tax.netSalary)
    ? [
        {
          detail: `Net salary is ${fmt(sal.netSalary ?? 0)} on the salary certificate but ${fmt(tax.netSalary ?? 0)} in the tax return.`,
          severity: "medium",
          sources: ["salaryCertificate", "taxReturn"],
          title: "Salary certificate and tax return disagree",
        },
      ]
    : [];

const ownFundsCheck: Check = ({ application: app, bankStatement: bank }) => {
  if (!(app && bank)) {
    return [];
  }
  const appAssets = (app.bankSavings ?? 0) + (app.securities ?? 0);
  return differs(appAssets, bank.total)
    ? [
        {
          detail: `The application lists ${fmt(appAssets)} in accounts and securities, the bank statement shows ${fmt(bank.total ?? 0)}.`,
          severity: "high",
          sources: ["application", "bankStatement"],
          title: "Own funds are not covered by the bank statement",
        },
      ]
    : [];
};

const priceCheck: Check = ({ application: app, salesDocumentation: sales }) =>
  app && sales && differs(app.purchasePrice, sales.price)
    ? [
        {
          detail: `The application says ${fmt(app.purchasePrice ?? 0)}, the sales documentation ${fmt(sales.price ?? 0)}.`,
          severity: "high",
          sources: ["application", "salesDocumentation"],
          title: "Purchase price differs",
        },
      ]
    : [];

const pensionCheck: Check = ({ application: app, pensionStatement: pen }) => {
  if (!(app && pen)) {
    return [];
  }
  const out: Finding[] = [];
  const requested = app.pensionWithdrawal ?? 0;
  const allowed = pen.maxHomeWithdrawal;
  if (allowed !== null && requested > allowed + 1) {
    out.push({
      detail: `The application uses ${fmt(requested)} from the pension fund, the statement allows at most ${fmt(allowed)}.`,
      severity: "high",
      sources: ["application", "pensionStatement"],
      title: "Pension withdrawal exceeds what the fund allows",
    });
  }
  if (differs(requested, pen.requestedWithdrawal ?? 0)) {
    out.push({
      detail: `The application uses ${fmt(requested)} from the pension fund, the pension statement records ${fmt(pen.requestedWithdrawal ?? 0)} as requested.`,
      severity: "medium",
      sources: ["application", "pensionStatement"],
      title: "Pension withdrawal not confirmed by the fund",
    });
  }
  return out;
};

const debtRegisterCheck: Check = ({ debtRegister }) =>
  (debtRegister?.entries ?? []).map(
    (e): Finding => ({
      detail: `${e.date}: ${e.creditor}, ${fmt(e.amount)}. Status: ${e.status}.`,
      severity: PAID_STATUS.test(e.status) ? "medium" : "high",
      sources: ["debtRegister"],
      title: "Entry in the debt enforcement register",
    })
  );

const samePersonCheck: Check = (d) => {
  const names = [
    d.application?.applicantName,
    d.salaryCertificate?.employeeName,
    d.taxReturn?.taxpayerName,
    d.debtRegister?.personName,
    d.pensionStatement?.insuredName,
    d.bankStatement?.customerName,
  ].filter((n): n is string => !!n);
  return new Set(names.map(normName)).size > 1
    ? [
        {
          detail: `Names found: ${[...new Set(names)].join(", ")}.`,
          severity: "high",
          sources: [],
          title: "Documents name different people",
        },
      ]
    : [];
};

const CHECKS: Check[] = [
  incomeCheck,
  netSalaryCheck,
  ownFundsCheck,
  priceCheck,
  pensionCheck,
  debtRegisterCheck,
  samePersonCheck,
];

/** Compares the documents with each other. Deterministic: same input, same findings. */
export function checkConsistency(d: Dossier): Finding[] {
  return CHECKS.flatMap((check) => check(d));
}

/** Age in whole years on a given day. */
export function ageOn(birthDate: string, today: Date): number | undefined {
  const b = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) {
    return;
  }
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < b.getUTCMonth() ||
    (today.getUTCMonth() === b.getUTCMonth() &&
      today.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/**
 * The rule-engine input, taken from the documents rather than from what the
 * applicant claims: price from the sales documentation, income from the
 * salary certificate, own funds from the bank statement.
 */
export function toMortgageInput(d: Dossier, today: Date): MortgageInput | null {
  const price = d.salesDocumentation?.price ?? d.application?.purchasePrice;
  if (price === null || price === undefined) {
    return null;
  }
  const pensionEquity = d.application?.pensionWithdrawal ?? 0;
  const ownFunds =
    d.bankStatement?.total ??
    (d.application?.bankSavings ?? 0) + (d.application?.securities ?? 0);
  // Own funds the applicant puts in, capped by what the bank confirms.
  const declaredOwn = d.application
    ? (d.application.totalEquity ?? ownFunds + pensionEquity) - pensionEquity
    : ownFunds;
  const hard = Math.min(declaredOwn, ownFunds);
  const birthDate = d.application?.birthDate;
  return {
    age: birthDate ? ageOn(birthDate, today) : undefined,
    grossIncome:
      d.salaryCertificate?.grossSalaryTotal ??
      d.application?.statedGrossIncome ??
      undefined,
    pensionEquity,
    price,
    totalEquity: hard + pensionEquity,
  };
}
