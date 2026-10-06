import { describe, expect, test } from "bun:test";
import { assessMortgage, suggestFixes } from "./rules.ts";

describe("rule sheet", () => {
  test("reproduces the worked example exactly", () => {
    const a = assessMortgage({
      pensionEquity: 0,
      price: 1_000_000,
      totalEquity: 200_000,
    });

    expect(Math.round(a.equity.required)).toBe(200_000);
    expect(a.mortgage).toBe(800_000);
    expect(Math.round(a.secondMortgage)).toBe(133_333);
    expect(a.yearlyInterest).toBe(40_000);
    expect(a.yearlyMaintenance).toBe(10_000);
    expect(Math.round(a.yearlyAmortization)).toBe(8889);
    expect(Math.round(a.yearlyCost)).toBe(58_889);
    expect(Math.round(a.requiredIncome)).toBe(176_667);
  });

  // Numbers from the three demo dossiers, as the documents state them.
  test("A1 Thomas Meier passes at about 30.7%", () => {
    const a = assessMortgage({
      age: 38,
      grossIncome: 165_000,
      pensionEquity: 0,
      price: 900_000,
      totalEquity: 200_000,
    });

    expect(a.passed).toBe(true);
    expect(a.affordability?.costRatio).toBeCloseTo(0.307, 3);
    expect(suggestFixes(a)).toEqual([]);
  });

  test("A2 Nicole Baumgartner fails on hard equity only", () => {
    const a = assessMortgage({
      age: 44,
      grossIncome: 260_000,
      pensionEquity: 160_000,
      price: 1_100_000,
      totalEquity: 230_000,
    });

    expect(a.failedRules).toEqual(["hard_equity"]);
    expect(a.hardEquity).toBe(70_000);
    const [fix] = suggestFixes(a);
    expect(fix?.kind).toBe("more_hard_equity");
    expect(fix?.amount).toBe(40_000);
  });

  test("A3 Daniel Schmid fails on affordability with the verified income", () => {
    const a = assessMortgage({
      age: 41,
      grossIncome: 175_000,
      pensionEquity: 0,
      price: 1_250_000,
      totalEquity: 280_000,
    });

    expect(a.failedRules).toEqual(["affordability"]);
    expect(Math.round(a.requiredIncome)).toBe(210_333);
    const fixes = suggestFixes(a);
    expect(fixes.map((f) => f.kind)).toEqual([
      "lower_price",
      "co_borrower_income",
      "more_equity",
    ]);
    // Every suggestion really passes when applied.
    const lower = fixes.find((f) => f.kind === "lower_price")?.amount ?? 0;
    expect(
      assessMortgage({ ...a.input, price: Math.floor(lower) }).passed
    ).toBe(true);
    const more = fixes.find((f) => f.kind === "more_equity")?.amount ?? 0;
    expect(
      assessMortgage({
        ...a.input,
        totalEquity: a.input.totalEquity + more + 1,
      }).passed
    ).toBe(true);
  });

  test("A3 still fails with the income he stated (incl. bonus)", () => {
    const a = assessMortgage({
      age: 41,
      grossIncome: 190_000,
      pensionEquity: 0,
      price: 1_250_000,
      totalEquity: 280_000,
    });

    expect(a.failedRules).toEqual(["affordability"]);
  });

  test("amortization is shortened when retirement comes first", () => {
    const a = assessMortgage({
      age: 58,
      pensionEquity: 0,
      price: 1_000_000,
      totalEquity: 200_000,
    });

    expect(a.amortizationYears).toBe(7);
  });
});
