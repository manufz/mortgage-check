import type { MortgageCase } from "@repo/services/mortgage";
import type { Dossier, Finding } from "@repo/services/mortgage/dossier";
import type { MortgageAssessment } from "@repo/services/mortgage/rules";
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { getTrpc } from "#/integrations/trpc/client";
import { chf, pct, utc } from "#/lib/format";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/mortgage/$id")({
  component: CasePage,
  errorComponent: CaseError,
  loader: async ({ params }) => {
    const c = await getTrpc().mortgage.get.query({ id: params.id });
    if (!c) {
      throw notFound();
    }
    return c;
  },
});

const RULE_LABELS = {
  affordability: "Affordability",
  equity: "Equity 20%",
  hard_equity: "Hard equity 10%",
} as const;

function CasePage() {
  const c = Route.useLoaderData();
  const a = c.checks.assessment;
  return (
    <main className="page-wrap px-4 py-10">
      <Link
        className="mb-6 inline-flex items-center gap-1 text-muted-foreground text-sm"
        to="/mortgage"
      >
        <ArrowLeft className="size-4" /> All cases
      </Link>

      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="island-kicker mb-2">Mortgage check</p>
          <h1 className="display-title m-0 text-4xl text-foreground">
            {c.applicantName}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {c.fileNames.length} documents · checked {utc(c.createdAt)}
          </p>
        </div>
        {a ? <Verdict a={a} /> : null}
      </section>

      {a ? (
        <Checks a={a} />
      ) : (
        <p className="mt-8 text-destructive">
          No purchase price was found in the documents, so the rules could not
          run.
        </p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Findings c={c} />
        <Fixes c={c} />
      </div>

      <Extracted dossier={c.dossier} />
      <ProposalSection c={c} />
      <Decision c={c} />
    </main>
  );
}

function Verdict({ a }: { a: MortgageAssessment }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-6 py-4 text-right",
        a.passed
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-destructive/40 bg-destructive/10"
      )}
    >
      <p className="m-0 flex items-center justify-end gap-2 font-semibold text-2xl">
        {a.passed ? (
          <CheckCircle2 className="size-6 text-emerald-600" />
        ) : (
          <XCircle className="size-6 text-destructive" />
        )}
        {a.passed ? "Passes the rule sheet" : "Fails the rule sheet"}
      </p>
      {a.failedRules.length > 0 ? (
        <p className="m-0 mt-1 text-sm">
          Failed: {a.failedRules.map((r) => RULE_LABELS[r]).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function RuleCard({
  title,
  passed,
  main,
  sub,
}: {
  title: string;
  passed: boolean;
  main: string;
  sub: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        passed ? "border-border" : "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="m-0 font-medium text-sm">{title}</p>
        <Badge variant={passed ? "secondary" : "destructive"}>
          {passed ? "Pass" : "Fail"}
        </Badge>
      </div>
      <p className="m-0 mt-3 font-semibold text-3xl tabular-nums">{main}</p>
      <p className="m-0 mt-1 text-muted-foreground text-sm">{sub}</p>
    </div>
  );
}

function Checks({ a }: { a: MortgageAssessment }) {
  const aff = a.affordability;
  const { price } = a.input;
  return (
    <section className="mt-8">
      <div className="grid gap-4 md:grid-cols-3">
        <RuleCard
          main={pct(a.equity.actual / price)}
          passed={a.equity.passed}
          sub={`${chf(a.equity.actual)} of ${chf(a.equity.required)} required`}
          title="Equity (min. 20%)"
        />
        <RuleCard
          main={pct(a.hardEquity / price)}
          passed={a.hardEquityCheck.passed}
          sub={`${chf(a.hardEquity)} not from the pension fund, ${chf(a.hardEquityCheck.required)} required`}
          title="Hard equity (min. 10%)"
        />
        {aff ? (
          <RuleCard
            main={pct(aff.costRatio)}
            passed={aff.passed}
            sub={`${chf(a.yearlyCost)} per year on ${chf(aff.actual)} verified income (max. 33.3%)`}
            title="Affordability"
          />
        ) : null}
      </div>

      <div className="mt-6 max-w-xl">
        <Table>
          <TableBody>
            <Row label="Purchase price" value={price} />
            <Row label="Mortgage" value={a.mortgage} />
            <Row label="of which second mortgage" value={a.secondMortgage} />
            <Row label="Imputed interest 5%" value={a.yearlyInterest} />
            <Row label="Maintenance 1%" value={a.yearlyMaintenance} />
            <Row
              label={`Amortization over ${a.amortizationYears} years`}
              value={a.yearlyAmortization}
            />
            <Row bold label="Total yearly cost" value={a.yearlyCost} />
            <Row bold label="Required gross income" value={a.requiredIncome} />
            {aff ? (
              <Row label="Verified gross income" value={aff.actual} />
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <TableRow className={bold ? "font-semibold" : undefined}>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{chf(value)}</TableCell>
    </TableRow>
  );
}

const SEVERITY_ICON: Record<Finding["severity"], typeof Info> = {
  high: AlertTriangle,
  info: Info,
  medium: AlertTriangle,
};

function Findings({ c }: { c: MortgageCase }) {
  const { findings, missing } = c.checks;
  const { observations } = c.dossier;
  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">
        Where the documents disagree
      </h2>
      {findings.length === 0 && missing.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          All documents agree with each other.
        </p>
      ) : null}
      <ul className="m-0 list-none space-y-3 p-0">
        {missing.map((m) => (
          <li className="rounded-lg border border-destructive/40 p-4" key={m}>
            <p className="m-0 font-medium">Missing document: {m}</p>
          </li>
        ))}
        {findings.map((f) => {
          const Icon = SEVERITY_ICON[f.severity];
          return (
            <li
              className={cn(
                "rounded-lg border p-4",
                f.severity === "high"
                  ? "border-destructive/40"
                  : "border-amber-500/40"
              )}
              key={f.title + f.detail}
            >
              <p className="m-0 flex items-center gap-2 font-medium">
                <Icon
                  className={cn(
                    "size-4",
                    f.severity === "high"
                      ? "text-destructive"
                      : "text-amber-600"
                  )}
                />
                {f.title}
              </p>
              <p className="m-0 mt-1 text-muted-foreground text-sm">
                {f.detail}
              </p>
            </li>
          );
        })}
      </ul>
      {observations.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 font-medium text-sm">Claude also noticed</p>
          <ul className="m-0 space-y-1 pl-5 text-muted-foreground text-sm">
            {observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Fixes({ c }: { c: MortgageCase }) {
  const { fixes, assessment } = c.checks;
  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">What would make it pass</h2>
      {assessment?.passed ? (
        <p className="text-muted-foreground text-sm">
          Nothing to change: every rule passes.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {fixes.map((f) => (
            <li className="flex gap-3 rounded-lg border p-4" key={f.kind}>
              <Wrench className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SECTIONS: { key: keyof Omit<Dossier, "observations">; label: string }[] =
  [
    { key: "application", label: "Application form" },
    { key: "salaryCertificate", label: "Salary certificate" },
    { key: "taxReturn", label: "Tax return" },
    { key: "debtRegister", label: "Debt enforcement register" },
    { key: "pensionStatement", label: "Pension statement" },
    { key: "bankStatement", label: "Bank statement of assets" },
    { key: "salesDocumentation", label: "Sales documentation" },
  ];

const CAPITAL = /([A-Z])/g;
const FIRST_CHAR = /^./;
const humanize = (k: string) =>
  k.replace(CAPITAL, " $1").replace(FIRST_CHAR, (s) => s.toUpperCase());

function showValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "–";
  }
  if (typeof v === "number") {
    return v >= 1000 ? chf(v) : String(v);
  }
  if (Array.isArray(v)) {
    return v.length === 0
      ? "none"
      : v
          .map((e) =>
            typeof e === "object" && e
              ? Object.values(e as Record<string, unknown>).join(", ")
              : String(e)
          )
          .join("; ");
  }
  return String(v);
}

function Extracted({ dossier }: { dossier: Dossier }) {
  return (
    <details className="mt-10 rounded-xl border p-5">
      <summary className="cursor-pointer font-semibold">
        Numbers Claude read from the documents
      </summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {SECTIONS.map(({ key, label }) => {
          const doc = dossier[key] as Record<string, unknown> | null;
          return (
            <div key={key}>
              <p className="mb-1 font-medium text-sm">{label}</p>
              {doc ? (
                <Table>
                  <TableBody>
                    {Object.entries(doc).map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell className="text-muted-foreground">
                          {humanize(k)}
                        </TableCell>
                        <TableCell className="text-right">
                          {showValue(v)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-destructive text-sm">Not in the dossier.</p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

const RECOMMENDATION = {
  approve: "Approve",
  approve_with_conditions: "Approve with conditions",
  reject: "Reject",
} as const;

function ProposalSection({ c }: { c: MortgageCase }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const started = useRef(false);

  const draft = useCallback(async () => {
    setDrafting(true);
    setError(null);
    try {
      await getTrpc().mortgage.propose.mutate({ id: c.id });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drafting failed.");
    } finally {
      setDrafting(false);
    }
  }, [c.id, router]);

  // Draft automatically the first time a case is opened.
  useEffect(() => {
    if (!(c.proposal || started.current) && c.checks.assessment) {
      started.current = true;
      draft();
    }
  }, [c.proposal, c.checks.assessment, draft]);

  const p = c.proposal;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 font-semibold text-lg">Proposal and Kreditantrag</h2>
        {p ? (
          <Button disabled={drafting} onClick={draft} size="sm" variant="ghost">
            Redraft
          </Button>
        ) : null}
      </div>
      {drafting ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Claude is drafting the credit proposal…
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {p ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Badge
              className="h-7 px-3 text-sm"
              variant={
                p.recommendation === "reject" ? "destructive" : "secondary"
              }
            >
              Proposal: {RECOMMENDATION[p.recommendation]}
            </Badge>
            <p className="mt-4">{p.summary}</p>
            <ul className="mt-3 space-y-1 pl-5 text-sm">
              {p.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {p.conditions.length > 0 ? (
              <>
                <p className="mt-4 mb-1 font-medium text-sm">Conditions</p>
                <ul className="space-y-1 pl-5 text-sm">
                  {p.conditions.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <article className="prose prose-sm dark:prose-invert max-w-none rounded-xl border bg-card p-6">
            <Markdown remarkPlugins={[remarkGfm]}>{p.kreditantrag}</Markdown>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function Decision({ c }: { c: MortgageCase }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(
    async (decision: "approved" | "rejected") => {
      setSaving(true);
      setError(null);
      try {
        await getTrpc().mortgage.decide.mutate({ decision, id: c.id, note });
        await router.invalidate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      } finally {
        setSaving(false);
      }
    },
    [c.id, note, router]
  );
  const approve = useCallback(() => decide("approved"), [decide]);
  const reject = useCallback(() => decide("rejected"), [decide]);
  const onNote = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value),
    []
  );

  return (
    <section className="island-shell mt-10 p-6">
      <p className="island-kicker mb-3">Credit officer</p>
      {c.decision ? (
        <div>
          <p className="m-0 font-semibold text-xl capitalize">{c.decision}</p>
          {c.decisionNote ? (
            <p className="mt-1 text-muted-foreground">{c.decisionNote}</p>
          ) : null}
          <p className="mt-1 text-muted-foreground text-xs">
            {c.decidedAt ? utc(c.decidedAt) : null}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea
            onChange={onNote}
            placeholder="Reason for the decision"
            value={note}
          />
          <div className="flex gap-3">
            <Button disabled={saving} onClick={approve}>
              Approve
            </Button>
            <Button disabled={saving} onClick={reject} variant="destructive">
              Reject
            </Button>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CaseError({ error }: ErrorComponentProps) {
  return (
    <main className="page-wrap px-4 py-12">
      <p className="text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Link to="/mortgage">Back to all cases</Link>
    </main>
  );
}
