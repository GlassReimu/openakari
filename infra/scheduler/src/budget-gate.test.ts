import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkBudget } from "./budget-gate.js";
import type { Job } from "./types.js";
import type { BudgetStatus } from "./notify.js";

vi.mock("./notify.js", () => ({
  readAllBudgetStatuses: vi.fn(),
}));

vi.mock("./constants.js", () => ({
  EXCLUDED_PROJECTS: [],
}));

import { readAllBudgetStatuses } from "./notify.js";

const mockReadAllBudgetStatuses = vi.mocked(readAllBudgetStatuses);

const makeJob = (cwd?: string): Job => ({
  id: "test-job",
  name: "test-session",
  schedule: { kind: "cron", expr: "0 * * * *" },
  payload: { message: "Run task", cwd },
  enabled: true,
  createdAtMs: Date.now(),
  state: {
    nextRunAtMs: null,
    lastRunAtMs: null,
    lastStatus: null,
    lastError: null,
    lastDurationMs: null,
    runCount: 0,
  },
});

const makeBudgetStatus = (opts: {
  resourcePcts?: number[];
  hoursToDeadline?: number;
}): BudgetStatus => ({
  resources: (opts.resourcePcts ?? []).map((pct, i) => ({
    resource: `resource-${i}`,
    consumed: pct,
    limit: 100,
    unit: "units",
    pct,
  })),
  hoursToDeadline: opts.hoursToDeadline,
});

describe("checkBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("allows when no projects have budgets (missing budget.yaml)", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("allows when budget has headroom (one project with resources < 100%)", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "project-a", status: makeBudgetStatus({ resourcePcts: [50, 30] }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(true);
  });

  it("allows when at least one project has headroom (mixed states)", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      {
        project: "exhausted-project",
        status: makeBudgetStatus({ resourcePcts: [100, 100] }),
      },
      {
        project: "active-project",
        status: makeBudgetStatus({ resourcePcts: [50] }),
      },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(true);
  });

  it("denies when all projects have all resources at 100%+", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "project-a", status: makeBudgetStatus({ resourcePcts: [100, 105] }) },
      { project: "project-b", status: makeBudgetStatus({ resourcePcts: [110] }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("All budgeted projects exhausted");
    expect(result.reason).toContain("project-a");
    expect(result.reason).toContain("project-b");
  });

  it("denies when project is past deadline (hoursToDeadline <= 0)", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "late-project", status: makeBudgetStatus({ resourcePcts: [30], hoursToDeadline: -5 }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("past deadline");
  });

  it("denies when all projects are either exhausted OR past deadline", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "exhausted", status: makeBudgetStatus({ resourcePcts: [100] }) },
      { project: "late", status: makeBudgetStatus({ resourcePcts: [10], hoursToDeadline: -1 }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(false);
  });

  it("denies when project has resources exhausted even with future deadline", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "project-a", status: makeBudgetStatus({ resourcePcts: [100], hoursToDeadline: 48 }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exhausted");
  });

  it("allows by default when readAllBudgetStatuses throws", async () => {
    mockReadAllBudgetStatuses.mockRejectedValueOnce(new Error("read error"));

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("budget check failed");
  });

  it("uses job.payload.cwd as repoDir when provided", async () => {
    const customCwd = "/custom/path";
    mockReadAllBudgetStatuses.mockResolvedValueOnce([]);

    await checkBudget(makeJob(customCwd));

    expect(mockReadAllBudgetStatuses).toHaveBeenCalledWith(customCwd, []);
  });

  it("uses process.cwd() when job.payload.cwd is not provided", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([]);

    await checkBudget(makeJob());

    expect(mockReadAllBudgetStatuses).toHaveBeenCalledWith(process.cwd(), []);
  });

  it("handles project with no resources (empty resources array)", async () => {
    mockReadAllBudgetStatuses.mockResolvedValueOnce([
      { project: "empty-project", status: makeBudgetStatus({ resourcePcts: [] }) },
    ]);

    const result = await checkBudget(makeJob());

    expect(result.allowed).toBe(true);
  });
});
