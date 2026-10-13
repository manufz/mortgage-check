# Rule sheet

These are the rules from the Exercise 4 brief, used as given. The brief cites Swiss Life, PostFinance and Raiffeisen as sources. They live in `packages/services/src/mortgage/rules.ts` as `RULES`, and nothing else in the app computes equity or affordability.

| Rule | Value |
| --- | --- |
| Minimum equity (Eigenmittel) | 20% of the purchase price |
| Minimum hard equity, not from the pension fund | 10% of the purchase price |
| Imputed interest (kalkulatorischer Zins) | 5% on the full mortgage |
| Maintenance and running costs | 1% of the purchase price per year |
| First mortgage | Up to two thirds of the property value, no repayment required |
| Second mortgage | The part above two thirds, repaid within 15 years or by age 65, whichever is earlier |
| Affordability (Tragbarkeit) | Interest + maintenance + amortization at most one third of gross income |

## Worked example

The brief requires these exact numbers. `rules.test.ts` checks them, and the `/mortgage` page shows them computed live by the same code.

| Item | CHF |
| --- | --- |
| Purchase price | 1'000'000 |
| Equity (20%) | 200'000 |
| Mortgage (80%) | 800'000 |
| Second mortgage (800'000 − 666'667) | 133'333 |
| Interest 5% × 800'000 | 40'000 per year |
| Maintenance 1% × 1'000'000 | 10'000 per year |
| Amortization 133'333 ÷ 15 | 8'889 per year |
| Total yearly cost | 58'889 |
| Required gross income (× 3) | 176'667 |

## Which numbers go in

The rules run on what the documents prove, not on what the applicant states:

- **Price** comes from the sales documentation, or from the application form if the sales documentation is missing.
- **Income** comes from the gross total on the salary certificate (Lohnausweis). A higher figure on the application is reported as a finding.
- **Own funds** are what the application declares, capped at the total on the bank statement of assets.
- **Pension money** is the pension withdrawal (WEF-Vorbezug) on the application. It counts toward the 20% but not toward the 10%.
- **Age**, for the amortization period, comes from the birth date on the application.

## Fixes

When a rule fails, `suggestFixes` searches for the smallest change that makes the case pass:

- **Hard equity short:** how much more own money, not from the pension fund.
- **Total equity short:** how much more equity.
- **Affordability fails:** the highest price that passes with the current equity and income, the income a co-borrower would need to add, or the extra equity that lowers the mortgage enough.

Each suggestion is tested by running the rules again with the change applied.
