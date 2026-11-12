import type { JobRecord, JobsStore } from "../lib/jobs";

export function createMemoryStore(seed: JobRecord[] = []): JobsStore & { rows: JobRecord[] } {
  const rows = seed.map((row) => ({ ...row }));
  let transactionTail = Promise.resolve();

  function positionTaken(
    userId: string,
    status: JobRecord["status"],
    position: number,
    exceptId?: string
  ): boolean {
    return rows.some(
      (row) =>
        row.id !== exceptId &&
        row.userId === userId &&
        row.status === status &&
        row.position === position
    );
  }

  function positionConflict(): Error {
    return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  }

  const store: JobsStore & { rows: JobRecord[] } = {
    rows,
    async $transaction(run) {
      const previous = transactionTail;
      let release = () => {};
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = rows.map((row) => ({
        ...row,
        appliedAt: new Date(row.appliedAt),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));
      try {
        return await run({ job: store.job });
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      } finally {
        release();
      }
    },
    job: {
      async findMany({ where, orderBy }) {
        let result = rows.filter((row) => row.userId === where.userId);
        if (where.status) {
          result = result.filter((row) => row.status === where.status);
        }
        if (orderBy) {
          const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
          result = [...result].sort((a, b) => {
            for (const key of keys) {
              const field = Object.keys(key)[0] as keyof JobRecord | undefined;
              if (!field) continue;
              const direction = (key as Record<string, "asc" | "desc" | undefined>)[field];
              const dir = direction === "desc" ? -1 : 1;
              const left = a[field];
              const right = b[field];
              if (left == null && right != null) return -1 * dir;
              if (left != null && right == null) return 1 * dir;
              if (left != null && right != null && left < right) return -1 * dir;
              if (left != null && right != null && left > right) return 1 * dir;
            }
            return 0;
          });
        }
        return result.map((row) => ({ ...row }));
      },
      async findFirst({ where }) {
        const row = rows.find(
          (candidate) =>
            candidate.id === where.id &&
            (!where.userId || candidate.userId === where.userId)
        );
        return row ? { ...row } : null;
      },
      async create({ data }) {
        const now = new Date();
        const row: JobRecord = {
          id: data.id ?? `job-${rows.length + 1}`,
          userId: data.userId,
          company: data.company,
          title: data.title,
          url: data.url ?? null,
          notes: data.notes ?? null,
          status: data.status,
          position: data.position,
          appliedAt: data.appliedAt ?? now,
          createdAt: now,
          updatedAt: now,
        };
        if (positionTaken(row.userId, row.status, row.position)) {
          throw positionConflict();
        }
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const index = rows.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw new Error("not found");
        }
        const current = rows[index];
        const status = data.status ?? current.status;
        const position = data.position ?? current.position;
        if (positionTaken(current.userId, status, position, current.id)) {
          throw positionConflict();
        }
        rows[index] = {
          ...current,
          ...data,
          updatedAt: new Date(),
        };
        return { ...rows[index] };
      },
      async updateMany({ where, data }) {
        const index = rows.findIndex(
          (row) => row.id === where.id && row.userId === where.userId
        );
        if (index < 0) {
          return { count: 0 };
        }
        const current = rows[index];
        const status = data.status ?? current.status;
        const position = data.position ?? current.position;
        if (positionTaken(current.userId, status, position, current.id)) {
          throw positionConflict();
        }
        rows[index] = {
          ...current,
          ...data,
          updatedAt: new Date(),
        };
        return { count: 1 };
      },
      async deleteMany({ where }) {
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index];
          if (row.id === where.id && row.userId === where.userId) {
            rows.splice(index, 1);
          }
        }
        return { count: before - rows.length };
      },
      async aggregate({ where }) {
        const matching = rows.filter(
          (row) =>
            row.userId === where.userId &&
            (!where.status || row.status === where.status)
        );
        const positions = matching.map((row) => row.position);
        return {
          _max: { position: positions.length ? Math.max(...positions) : null },
        };
      },
    },
  };
  return store;
}
