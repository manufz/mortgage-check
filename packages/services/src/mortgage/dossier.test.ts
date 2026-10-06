// The deterministic half of the pipeline on the three demo dossiers, with
// the values typed in from the PDFs. If Claude extracts these values, the
// app gives these results.
import { describe, expect, test } from "bun:test";
import type { Dossier } from "./dossier.ts";
import { runChecks } from "./index.ts";

const TODAY = new Date("2026-10-06T12:00:00Z");

function dossier(p: {
  name: string;
  birthDate: string;
  price: number;
  bank: number;
  securities: number;
  wef: number;
  statedIncome: number;
  incomeNote: string | null;
  gross: number;
  net: number;
  debtEntries?: NonNullable<Dossier["debtRegister"]>["entries"];
}): Dossier {
  return {
    application: {
      applicantName: p.name,
      bankSavings: p.bank,
      birthDate: p.birthDate,
      pensionWithdrawal: p.wef,
      propertyAddress: "Somewhere",
      purchasePrice: p.price,
      requestedMortgage: p.price - p.bank - p.securities - p.wef,
      securities: p.securities,
      statedGrossIncome: p.statedIncome,
      statedIncomeNote: p.incomeNote,
      totalEquity: p.bank + p.securities + p.wef,
      yearlyDebtObligations: 0,
    },
    bankStatement: {
      cash: p.bank,
      customerName: p.name,
      date: "2026-08-31",
      securities: p.securities,
      total: p.bank + p.securities,
    },
    debtRegister: {
      entries: p.debtEntries ?? [],
      extractDate: "2026-09-15",
      personName: p.name,
    },
    observations: [],
    pensionStatement: {
      alreadyWithdrawn: 0,
      insuredName: p.name,
      maxHomeWithdrawal: 400_000,
      requestedWithdrawal: p.wef,
      retirementSavings: 400_000,
    },
    salaryCertificate: {
      baseSalary: p.gross,
      bonus: 0,
      employeeName: p.name,
      grossSalaryTotal: p.gross,
      netSalary: p.net,
      year: 2025,
    },
    salesDocumentation: {
      description: null,
      price: p.price,
      propertyAddress: "Somewhere",
    },
    taxReturn: {
      bankAssets: p.bank,
      debts: 0,
      netSalary: p.net,
      securities: p.securities,
      taxpayerName: p.name,
    },
  };
}

describe("demo dossiers", () => {
  test("A1 Thomas Meier: pass, no findings", () => {
    const c = runChecks(
      dossier({
        bank: 140_000,
        birthDate: "1988-05-11",
        gross: 165_000,
        incomeNote: null,
        name: "Thomas Meier",
        net: 144_780.45,
        price: 900_000,
        securities: 60_000,
        statedIncome: 165_000,
        wef: 0,
      }),
      TODAY
    );

    expect(c.assessment?.passed).toBe(true);
    expect(c.assessment?.affordability?.costRatio).toBeCloseTo(0.307, 3);
    expect(c.findings).toEqual([]);
    expect(c.missing).toEqual([]);
  });

  test("A2 Nicole Baumgartner: fails hard equity, no findings", () => {
    const c = runChecks(
      dossier({
        bank: 70_000,
        birthDate: "1982-01-27",
        gross: 260_000,
        incomeNote: null,
        name: "Nicole Baumgartner",
        net: 228_807.95,
        price: 1_100_000,
        securities: 0,
        statedIncome: 260_000,
        wef: 160_000,
      }),
      TODAY
    );

    expect(c.assessment?.failedRules).toEqual(["hard_equity"]);
    expect(c.findings).toEqual([]);
    expect(c.fixes[0]?.amount).toBe(40_000);
  });

  test("A3 Daniel Schmid: fails affordability, exactly 2 findings", () => {
    const c = runChecks(
      dossier({
        bank: 180_000,
        birthDate: "1984-12-03",
        debtEntries: [
          {
            amount: 2340,
            creditor: "Steueramt des Kantons Zürich",
            date: "2024-03-12",
            status: "Payment order served, claim paid on 2024-05-02",
          },
        ],
        gross: 175_000,
        incomeNote: "inkl. erwarteter Bonus",
        name: "Daniel Schmid",
        net: 153_625.45,
        price: 1_250_000,
        securities: 100_000,
        statedIncome: 190_000,
        wef: 0,
      }),
      TODAY
    );

    expect(c.assessment?.failedRules).toEqual(["affordability"]);
    // Uses the salary certificate, not the stated 190k.
    expect(c.assessment?.affordability?.actual).toBe(175_000);
    expect(c.assessment?.amortizationYears).toBe(15);
    expect(c.findings.map((f) => f.title)).toEqual([
      "Stated income is higher than the salary certificate",
      "Entry in the debt enforcement register",
    ]);
  });
});
