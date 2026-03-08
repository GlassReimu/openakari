/** Pre-execution budget gate — blocks sessions when all budgeted projects are exhausted or past deadline. */

import { readAllBudgetStatuses } from "./notify.js";
import { EXCLUDED_PROJECTS } from "./constants.js";
import type { Job } from "./types.js";

export interface BudgetGateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check whether a job should be allowed to run based on project budget status.
 * Blocks only when ALL budgeted projects have resources at 100%+ OR deadline past.
 * If no projects have budgets, always allows.
 */
export async function checkBudget(job: Job): Promise<BudgetGateResult> {
  const repoDir = job.payload.cwd ?? process.cwd();

  let budgets: Awaited<ReturnType<typeof readAllBudgetStatuses>>;
  try {
    budgets = await readAllBudgetStatuses(repoDir, EXCLUDED_PROJECTS);
  } catch {
    // If we can't read budgets, don't block — fail open
    return { allowed: true, reason: "budget check failed, allowing by default" };
  }

  // No budgeted projects — nothing to gate
  if (budgets.length === 0) {
    return { allowed: true };
  }

  // Check if every budgeted project is exhausted or past deadline
  const exhausted = budgets.filter((b) => {
    const allResourcesSpent = b.status.resources.length > 0 &&
      b.status.resources.every((r) => r.pct >= 100);
    const pastDeadline = b.status.hoursToDeadline !== undefined &&
      b.status.hoursToDeadline <= 0;
    return allResourcesSpent || pastDeadline;
  });

  if (exhausted.length === budgets.length) {
    const names = exhausted.map((b) => b.project).join(", ");
    return {
      allowed: false,
      reason: `All budgeted projects exhausted or past deadline: ${names}`,
    };
  }

  return { allowed: true };
}
