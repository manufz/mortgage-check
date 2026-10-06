import { assessMortgage } from "@repo/services/mortgage/rules";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { getTrpc } from "#/integrations/trpc/client";
import { chf, pct, toBase64, utc } from "#/lib/format";

export const Route = createFileRoute("/mortgage/")({
  component: MortgageHome,
  loader: () => getTrpc().mortgage.list.query(),
});

const DOC_FILES = [
  "01_Hypothekarantrag.pdf",
  "02_Lohnausweis_2025.pdf",
  "03_Steuererklaerung_2025_Zusammenfassung.pdf",
  "04_Betreibungsregisterauszug.pdf",
  "05_Vorsorgeausweis.pdf",
  "06_Vermoegensausweis_Bank.pdf",
  "07_Verkaufsdokumentation.pdf",
];

const DEMO_DOSSIERS = [
  { folder: "A1_Thomas_Meier", label: "A1 · Thomas Meier" },
  { folder: "A2_Nicole_Baumgartner", label: "A2 · Nicole Baumgartner" },
  { folder: "A3_Daniel_Schmid", label: "A3 · Daniel Schmid" },
];

function MortgageHome() {
  const cases = Route.useLoaderData();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(
    async (label: string, files: { name: string; blob: Blob }[]) => {
      setBusy(label);
      setError(null);
      try {
        const payload = await Promise.all(
          files.map(async (f) => ({
            data: await toBase64(f.blob),
            name: f.name,
          }))
        );
        const c = await getTrpc().mortgage.analyze.mutate({ files: payload });
        await navigate({ params: { id: c.id }, to: "/mortgage/$id" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The check failed.");
        setBusy(null);
      }
    },
    [navigate]
  );

  const runDemo = useCallback(
    async (folder: string, label: string) => {
      const files = await Promise.all(
        DOC_FILES.map(async (name) => {
          const res = await fetch(`/demo/${folder}/${name}`);
          return { blob: await res.blob(), name };
        })
      );
      await analyze(label, files);
    },
    [analyze]
  );

  const onDemoClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { folder, label } = event.currentTarget.dataset;
      if (folder && label) {
        runDemo(folder, label);
      }
    },
    [runDemo]
  );

  const onUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (list.length > 0) {
        await analyze(
          `${list.length} uploaded files`,
          list.map((f) => ({ blob: f, name: f.name }))
        );
      }
    },
    [analyze]
  );

  return (
    <main className="page-wrap px-4 py-12">
      <section className="max-w-3xl">
        <p className="island-kicker mb-3">Exercise 4 · Breakthrough track</p>
        <h1 className="display-title mb-4 text-4xl text-foreground sm:text-5xl">
          Mortgage check
        </h1>
        <p className="m-0 text-base text-muted-foreground leading-8">
          Drop in a home buyer's documents. Claude reads all of them at once and
          finds where they disagree. The Swiss rule sheet decides equity and
          affordability, Claude drafts the credit proposal, and the credit
          officer decides.
        </p>
      </section>

      <section className="island-shell mt-10 p-6 sm:p-8">
        <p className="island-kicker mb-4">New check</p>
        <div className="flex flex-wrap gap-3">
          {DEMO_DOSSIERS.map((d) => (
            <Button
              data-folder={d.folder}
              data-label={d.label}
              disabled={busy !== null}
              key={d.folder}
              onClick={onDemoClick}
              variant="outline"
            >
              <FileText />
              {d.label}
            </Button>
          ))}
          <Button asChild disabled={busy !== null} variant="secondary">
            <label className="cursor-pointer">
              <Upload />
              Upload PDFs
              <input
                accept="application/pdf"
                className="sr-only"
                disabled={busy !== null}
                multiple
                onChange={onUpload}
                type="file"
              />
            </label>
          </Button>
        </div>
        {busy ? (
          <p className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Claude is reading the documents of {busy}…
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-semibold text-lg">Cases</h2>
        {cases.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No checks yet. Start with one of the demo dossiers above.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Cost ratio</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => {
                const a = c.checks.assessment;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link params={{ id: c.id }} to="/mortgage/$id">
                        {c.applicantName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {a ? (
                        <Badge variant={a.passed ? "secondary" : "destructive"}>
                          {a.passed ? "Pass" : "Fail"}
                        </Badge>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell>
                      {a?.affordability ? pct(a.affordability.costRatio) : "–"}
                    </TableCell>
                    <TableCell>{c.checks.findings.length}</TableCell>
                    <TableCell className="capitalize">
                      {c.decision ?? "open"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {utc(c.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <WorkedExample />
    </main>
  );
}

/** The brief's worked example, computed live by the same rule engine. */
function WorkedExample() {
  const a = assessMortgage({
    pensionEquity: 0,
    price: 1_000_000,
    totalEquity: 200_000,
  });
  const rows: [string, number][] = [
    ["Purchase price", a.input.price],
    ["Equity (20%)", a.equity.required],
    ["Mortgage (80%)", a.mortgage],
    ["Second mortgage (above two thirds)", a.secondMortgage],
    ["Interest 5%", a.yearlyInterest],
    ["Maintenance 1%", a.yearlyMaintenance],
    [`Amortization ÷ ${a.amortizationYears} years`, a.yearlyAmortization],
    ["Total yearly cost", a.yearlyCost],
    ["Required gross income (× 3)", a.requiredIncome],
  ];
  return (
    <section className="mt-10 max-w-xl">
      <h2 className="mb-1 font-semibold text-lg">Rule sheet: worked example</h2>
      <p className="mb-3 text-muted-foreground text-sm">
        Computed by the app's rule engine. Matches the brief to the franc.
      </p>
      <Table>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {chf(value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
