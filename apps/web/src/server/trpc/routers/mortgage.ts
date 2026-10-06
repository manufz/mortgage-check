import {
  analyzeInput,
  caseIdInput,
  decideInput,
} from "@repo/services/mortgage";
import { publicProcedure, router } from "../init.ts";

export const mortgageRouter = router({
  /** Claude reads the PDFs, then the rules run. Stores a new case. */
  analyze: publicProcedure
    .input(analyzeInput)
    .mutation(({ ctx, input }) => ctx.services.mortgage.analyze(input)),
  /** The credit officer's decision. */
  decide: publicProcedure
    .input(decideInput)
    .mutation(({ ctx, input }) => ctx.services.mortgage.decide(input)),
  get: publicProcedure
    .input(caseIdInput)
    .query(({ ctx, input }) => ctx.services.mortgage.get(input)),
  list: publicProcedure.query(({ ctx }) => ctx.services.mortgage.list()),
  /** Claude drafts the decision proposal and the Kreditantrag. */
  propose: publicProcedure
    .input(caseIdInput)
    .mutation(({ ctx, input }) => ctx.services.mortgage.propose(input)),
});
