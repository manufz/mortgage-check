// The rule sheet from the exercise brief, as plain arithmetic. No I/O and no
// model: every number the app shows for equity and affordability comes from
// here, so the tests can pin it to the worked example.

export const RULES = {
  /** The first mortgage covers up to this share of the property value. */
  firstMortgageShare: 2 / 3,
  /** Imputed (kalkulatorischer) interest on the whole mortgage. */
  imputedInterestRate: 0.05,
  /** Maintenance and running costs per year, as a share of the price. */
  maintenanceRate: 0.01,
  /** The second mortgage is repaid within this many years... */
  maxAmortizationYears: 15,
  /** Yearly costs may not exceed this share of gross income. */
  maxCostToIncome: 1 / 3,
  /** Total equity as a share of the price. */
  minEquityShare: 0.2,
  /** Equity not taken from the pension fund, as a share of the price. */
  minHardEquityShare: 0.1,
  /** ...or by this age, whichever comes first. */
  retirementAge: 65,
} as const;

export interface MortgageInput {
  /** Applicant's age today. Omit and amortization runs the full 15 years. */
  age?: number;
  /** Verified gross yearly income (CHF). Omit to only compute the costs. */
  grossIncome?: number;
  /** The part of `totalEquity` that comes from the pension fund (CHF). */
  pensionEquity: number;
  /** Purchase price (CHF). The property value for the first mortgage limit. */
  price: number;
  /** All equity brought in, including any pension withdrawal (CHF). */
  totalEquity: number;
}

export interface CheckResult {
  /** What the applicant has. */
  actual: number;
  passed: boolean;
  /** What the rule asks for (CHF or a share, see the field). */
  required: number;
}

export interface MortgageAssessment {
  /** null when no income was given. `actual` is the cost-to-income ratio. */
  affordability: (CheckResult & { costRatio: number }) | null;
  amortizationYears: number;
  equity: CheckResult;
  failedRules: ("equity" | "hard_equity" | "affordability")[];
  firstMortgage: number;
  hardEquity: number;
  hardEquityCheck: CheckResult;
  input: MortgageInput;
  mortgage: number;
  passed: boolean;
  /** Gross income at which the cost is exactly one third. */
  requiredIncome: number;
  secondMortgage: number;
  yearlyAmortization: number;
  yearlyCost: number;
  yearlyInterest: number;
  yearlyMaintenance: number;
}

export function amortizationYears(age?: number): number {
  if (age === undefined) {
    return RULES.maxAmortizationYears;
  }
  const untilRetirement = RULES.retirementAge - age;
  return Math.max(1, Math.min(RULES.maxAmortizationYears, untilRetirement));
}

/** Yearly cost of a mortgage on a property at a given price. */
function costs(price: number, mortgage: number, years: number) {
  const firstMortgage = Math.min(mortgage, price * RULES.firstMortgageShare);
  const secondMortgage = Math.max(0, mortgage - firstMortgage);
  const yearlyInterest = mortgage * RULES.imputedInterestRate;
  const yearlyMaintenance = price * RULES.maintenanceRate;
  const yearlyAmortization = secondMortgage / years;
  return {
    firstMortgage,
    secondMortgage,
    yearlyAmortization,
    yearlyCost: yearlyInterest + yearlyMaintenance + yearlyAmortization,
    yearlyInterest,
    yearlyMaintenance,
  };
}

export function assessMortgage(input: MortgageInput): MortgageAssessment {
  const { price, totalEquity, pensionEquity, grossIncome } = input;
  const mortgage = Math.max(0, price - totalEquity);
  const years = amortizationYears(input.age);
  const c = costs(price, mortgage, years);
  const requiredIncome = c.yearlyCost / RULES.maxCostToIncome;
  const hardEquity = totalEquity - pensionEquity;

  const equity: CheckResult = {
    actual: totalEquity,
    passed: totalEquity >= price * RULES.minEquityShare - 0.005,
    required: price * RULES.minEquityShare,
  };
  const hardEquityCheck: CheckResult = {
    actual: hardEquity,
    passed: hardEquity >= price * RULES.minHardEquityShare - 0.005,
    required: price * RULES.minHardEquityShare,
  };
  const affordability =
    grossIncome === undefined
      ? null
      : {
          actual: grossIncome,
          costRatio: grossIncome > 0 ? c.yearlyCost / grossIncome : 1,
          passed: grossIncome >= requiredIncome - 0.005,
          required: requiredIncome,
        };

  const failedRules: MortgageAssessment["failedRules"] = [];
  if (!equity.passed) {
    failedRules.push("equity");
  }
  if (!hardEquityCheck.passed) {
    failedRules.push("hard_equity");
  }
  if (affordability && !affordability.passed) {
    failedRules.push("affordability");
  }

  return {
    ...c,
    affordability,
    amortizationYears: years,
    equity,
    failedRules,
    hardEquity,
    hardEquityCheck,
    input,
    mortgage,
    passed: failedRules.length === 0,
    requiredIncome,
  };
}

export type FixKind =
  | "more_hard_equity"
  | "more_equity"
  | "lower_price"
  | "co_borrower_income";

export interface Fix {
  /** CHF amount: extra equity, extra income, or the new maximum price. */
  amount: number;
  kind: FixKind;
  /** One plain sentence, ready to show. */
  text: string;
}

const chf = (n: number) =>
  `CHF ${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

/** Largest x in [lo, hi] with ok(x) true, assuming ok is monotone (true then false). */
function searchMax(lo: number, hi: number, ok: (x: number) => boolean) {
  if (!ok(lo)) {
    return lo;
  }
  let a = lo;
  let b = hi;
  for (let i = 0; i < 100; i += 1) {
    const mid = (a + b) / 2;
    if (ok(mid)) {
      a = mid;
    } else {
      b = mid;
    }
  }
  return a;
}

/**
 * Concrete changes that would make a failing application pass, each computed
 * with the same rules. Empty when it already passes.
 */
export function suggestFixes(a: MortgageAssessment): Fix[] {
  if (a.passed) {
    return [];
  }
  const { input } = a;
  const fixes: Fix[] = [];

  const shortHard = a.hardEquityCheck.required - a.hardEquity;
  const shortTotal = a.equity.required - input.totalEquity;
  if (shortHard > 0 || shortTotal > 0) {
    // Hard equity counts towards the total too, so one top-up can fix both.
    const topUp = Math.max(shortHard, shortTotal);
    fixes.push({
      amount: topUp,
      kind: shortHard > 0 ? "more_hard_equity" : "more_equity",
      text:
        shortHard > 0
          ? `Bring in ${chf(topUp)} more own funds that do not come from the pension fund (savings, securities, a gift or an inheritance advance).`
          : `Bring in ${chf(topUp)} more equity.`,
    });
  }

  // Highest price that passes every rule with the equity and income on file.
  const passesAt = (price: number) =>
    assessMortgage({ ...input, price }).passed;
  const maxPrice = searchMax(0, input.price, passesAt);
  if (maxPrice > 0 && maxPrice < input.price) {
    fixes.push({
      amount: maxPrice,
      kind: "lower_price",
      text: `With the current equity and income, the price can be at most ${chf(Math.floor(maxPrice / 1000) * 1000)}.`,
    });
  }

  if (a.affordability && !a.affordability.passed && a.equity.passed) {
    const missingIncome = a.requiredIncome - a.affordability.actual;
    fixes.push({
      amount: missingIncome,
      kind: "co_borrower_income",
      text: `Add a co-borrower with at least ${chf(Math.ceil(missingIncome / 100) * 100)} gross income per year.`,
    });

    // More equity lowers the mortgage, the interest and the amortization.
    const passesWithExtra = (topUp: number) =>
      !assessMortgage({
        ...input,
        totalEquity: input.totalEquity + topUp,
      }).failedRules.includes("affordability");
    // The smallest passing top-up is just above the largest failing one.
    const extra = searchMax(0, input.price, (x) => !passesWithExtra(x));
    if (extra > 0 && extra < input.price) {
      fixes.push({
        amount: extra,
        kind: "more_equity",
        text: `Or bring in ${chf(Math.ceil(extra / 1000) * 1000)} more equity, which lowers the mortgage enough to pass.`,
      });
    }
  }
  return fixes;
}
