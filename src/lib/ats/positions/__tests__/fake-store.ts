/**
 * ATS-M1 — an in-memory stand-in for the Prisma models the position and
 * settings services use. Not a test file (no `.test.`).
 *
 * It is deliberately STRICT where the real database is: a transaction that
 * throws is rolled back (the whole state is restored from a snapshot), the
 * unique constraints the services rely on raise P2002, and every write is
 * logged so a test can prove what was — and was not — written. Anything a
 * service calls that is not modelled here throws, so a new, unexpected write
 * path (a hard delete, an application update) fails the test loudly.
 */

type Row = Record<string, unknown>;

export interface StoreState {
  members: Row[];
  jobs: Row[];
  translations: Row[];
  criteria: Row[];
  applications: Row[];
  interviews: Row[];
  aiReviews: Row[];
  audit: Row[];
  settings: Row[];
  idempotency: Row[];
  retention: Row[];
}

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function uniqueViolation(): Error {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function matchValue(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === "object" && cond !== null && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    if ("in" in c) return (c.in as unknown[]).includes(value);
    if ("notIn" in c) return !(c.notIn as unknown[]).includes(value);
    if ("not" in c) return c.not === null ? value !== null && value !== undefined : value !== c.not;
    if ("lte" in c || "gte" in c || "lt" in c) {
      const v = value instanceof Date ? value.getTime() : (value as number);
      const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
      if ("lte" in c && !(v <= n(c.lte))) return false;
      if ("gte" in c && !(v >= n(c.gte))) return false;
      if ("lt" in c && !(v < n(c.lt))) return false;
      return true;
    }
  }
  return value === cond;
}

export function matches(row: Row, where: Record<string, unknown> | undefined, relations: Record<string, (row: Row) => Row | null> = {}): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w, relations))) return false;
      continue;
    }
    if (k in relations) {
      const related = relations[k](row);
      if (!related || !matches(related, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchValue(row[k], cond)) return false;
  }
  return true;
}

function applyData(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && "increment" in (v as Row)) {
      row[k] = ((row[k] as number) ?? 0) + ((v as { increment: number }).increment);
    } else {
      row[k] = v;
    }
  }
  row.updatedAt = new Date();
}

export function makeStore(seed: Partial<StoreState> = {}) {
  let state: StoreState = {
    members: [],
    jobs: [],
    translations: [],
    criteria: [],
    applications: [],
    interviews: [],
    aiReviews: [],
    audit: [],
    settings: [],
    idempotency: [],
    retention: [],
    ...structuredClone(seed),
  };
  const log: { model: string; op: string; args: unknown }[] = [];
  const note = (model: string, op: string, args: unknown) => log.push({ model, op, args });

  const appOf = (r: Row) => state.applications.find((a) => a.id === r.applicationId) ?? null;

  const withContent = (job: Row, include?: Record<string, unknown>) => {
    if (!include) return { ...job };
    return {
      ...job,
      ...(include.translations ? { translations: state.translations.filter((t) => t.jobId === job.id).map((t) => ({ ...t })) } : {}),
      ...(include.criteria
        ? {
            criteria: state.criteria
              .filter((c) => c.jobId === job.id && c.organizationId === job.organizationId)
              .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number))
              .map((c) => ({ ...c })),
          }
        : {}),
    };
  };

  const models = {
    organizationMember: {
      findFirst: async (a: { where: Row }) => state.members.find((m) => matches(m, a.where)) ?? null,
      findMany: async (a: { where: Row }) =>
        state.members.filter((m) => matches(m, a.where)).map((m) => ({ ...m, user: { name: (m.name as string) ?? null } })),
    },
    atsJob: {
      findFirst: async (a: { where: Row; include?: Row }) => {
        const j = state.jobs.find((x) => matches(x, a.where));
        return j ? withContent(j, a.include) : null;
      },
      findMany: async (a: { where: Row; take?: number }) =>
        state.jobs
          .filter((x) => matches(x, a.where))
          .slice(0, a.take ?? 1000)
          .map((j) => ({
            ...j,
            translations: state.translations.filter((t) => t.jobId === j.id).map((t) => ({ language: t.language, title: t.title })),
            _count: { applications: state.applications.filter((ap) => ap.jobId === j.id).length },
          })),
      create: async (a: { data: Row }) => {
        note("atsJob", "create", a.data);
        const d = a.data;
        if (d.requisitionKey && state.jobs.some((j) => j.organizationId === d.organizationId && j.requisitionKey === d.requisitionKey)) {
          throw uniqueViolation();
        }
        const row = { id: id("job"), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, closingDate: null, pausedAt: null, closedAt: null, archivedAt: null, hiringManagerId: null, ...d };
        state.jobs.push(row);
        return { id: row.id };
      },
      updateMany: async (a: { where: Row; data: Row }) => {
        note("atsJob", "updateMany", a);
        const hits = state.jobs.filter((j) => matches(j, a.where));
        hits.forEach((j) => applyData(j, a.data));
        return { count: hits.length };
      },
      // Deliberately absent: delete / deleteMany. A hard delete would throw here.
    },
    atsJobTranslation: {
      upsert: async (a: { where: { jobId_language: { jobId: string; language: string } }; create: Row; update: Row }) => {
        note("atsJobTranslation", "upsert", a);
        const k = a.where.jobId_language;
        const hit = state.translations.find((t) => t.jobId === k.jobId && t.language === k.language);
        if (hit) Object.assign(hit, a.update);
        else state.translations.push({ id: id("tr"), ...a.create });
        return {};
      },
    },
    atsJobCriterion: {
      findMany: async (a: { where: Row }) => state.criteria.filter((c) => matches(c, a.where)),
      count: async (a: { where: Row }) => state.criteria.filter((c) => matches(c, a.where)).length,
      deleteMany: async (a: { where: Row }) => {
        note("atsJobCriterion", "deleteMany", a);
        const before = state.criteria.length;
        state.criteria = state.criteria.filter((c) => !matches(c, a.where));
        return { count: before - state.criteria.length };
      },
      upsert: async (a: { where: { organizationId_jobId_code: Row }; create: Row; update: Row }) => {
        note("atsJobCriterion", "upsert", a);
        const k = a.where.organizationId_jobId_code;
        const hit = state.criteria.find((c) => c.organizationId === k.organizationId && c.jobId === k.jobId && c.code === k.code);
        if (hit) Object.assign(hit, a.update);
        else state.criteria.push({ id: id("cr"), ...a.create });
        return {};
      },
    },
    atsApplication: {
      count: async (a: { where: Row }) => state.applications.filter((x) => matches(x, a.where)).length,
      // No update / delete: position management must never write an application.
    },
    atsInterview: {
      count: async (a: { where: Row }) => state.interviews.filter((x) => matches(x, a.where, { application: appOf })).length,
    },
    atsAiReview: {
      count: async (a: { where: Row }) => state.aiReviews.filter((x) => matches(x, a.where, { application: appOf })).length,
    },
    auditLog: {
      create: async (a: { data: Row }) => {
        note("auditLog", "create", a.data);
        state.audit.push({ id: id("audit"), createdAt: new Date(), ...a.data });
        return {};
      },
      count: async (a: { where: Row }) => state.audit.filter((x) => matches(x, a.where)).length,
      findMany: async (a: { where: Row; take?: number }) =>
        state.audit
          .filter((x) => matches(x, a.where))
          .reverse()
          .slice(0, a.take ?? 100),
      // No update / delete: the audit trail is append-only.
    },
    atsOrganizationSettings: {
      findUnique: async (a: { where: { organizationId: string } }) => {
        const s = state.settings.find((x) => x.organizationId === a.where.organizationId);
        return s ? { ...s } : null;
      },
      create: async (a: { data: Row }) => {
        note("atsOrganizationSettings", "create", a.data);
        if (state.settings.some((s) => s.organizationId === a.data.organizationId)) throw uniqueViolation();
        state.settings.push({
          id: id("set"),
          defaultDecisionSlaDays: null,
          defaultInterviewStages: [],
          defaultApprovalOwnerRole: null,
          aiProviderMode: "deterministic",
          externalAiProcessingEnabled: false,
          minimumConfidence: null,
          reviewAlertsEnabled: false,
          interviewRemindersEnabled: false,
          slaBreachAlertsEnabled: false,
          publicListingEnabled: true,
          applicationIntakeEnabled: false,
          defaultPublicLocale: "fa",
          retentionPolicyId: null,
          updatedAt: new Date(),
          ...a.data,
        });
        return {};
      },
      updateMany: async (a: { where: Row; data: Row }) => {
        note("atsOrganizationSettings", "updateMany", a);
        const hits = state.settings.filter((s) => matches(s, a.where));
        hits.forEach((s) => applyData(s, a.data));
        return { count: hits.length };
      },
    },
    retentionPolicy: {
      findFirst: async (a: { where: Row }) => state.retention.find((r) => matches(r, a.where)) ?? null,
      findMany: async (a: { where: Row }) => state.retention.filter((r) => matches(r, a.where)),
      create: async (a: { data: Row }) => {
        note("retentionPolicy", "create", a.data);
        const row = { id: id("rp"), updatedAt: new Date(), ...a.data };
        state.retention.push(row);
        return { id: row.id };
      },
      updateMany: async (a: { where: Row; data: Row }) => {
        note("retentionPolicy", "updateMany", a);
        const hits = state.retention.filter((r) => matches(r, a.where));
        hits.forEach((r) => applyData(r, a.data));
        return { count: hits.length };
      },
    },
    atsManagementIdempotencyKey: {
      findUnique: async (a: { where: { organizationId_operation_keyHash: Row } }) => {
        const k = a.where.organizationId_operation_keyHash;
        return state.idempotency.find((r) => r.organizationId === k.organizationId && r.operation === k.operation && r.keyHash === k.keyHash) ?? null;
      },
      deleteMany: async (a: { where: Row }) => {
        state.idempotency = state.idempotency.filter((r) => !matches(r, a.where));
        return {};
      },
      create: async (a: { data: Row }) => {
        const d = a.data;
        if (state.idempotency.some((r) => r.organizationId === d.organizationId && r.operation === d.operation && r.keyHash === d.keyHash)) {
          throw uniqueViolation();
        }
        state.idempotency.push({ id: id("idem"), ...d });
        return {};
      },
      updateMany: async (a: { where: Row; data: Row }) => {
        const hits = state.idempotency.filter((r) => matches(r, a.where));
        hits.forEach((r) => Object.assign(r, a.data));
        return { count: hits.length };
      },
    },
  };

  const client = {
    ...models,
    $transaction: async <T,>(fn: (tx: typeof models) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(state);
      const mark = log.length;
      try {
        return await fn(models);
      } catch (err) {
        state = snapshot;
        log.length = mark;
        throw err;
      }
    },
  };

  return {
    client,
    log,
    get state() {
      return state;
    },
  };
}
