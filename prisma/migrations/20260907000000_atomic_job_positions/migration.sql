-- Normalize any positions created before the uniqueness invariant was enforced.
WITH "ranked_jobs" AS (
    SELECT
        "id",
        (
            ROW_NUMBER() OVER (
                PARTITION BY "userId", "status"
                ORDER BY "position", "createdAt", "id"
            ) - 1
        )::INTEGER AS "position"
    FROM "Job"
)
UPDATE "Job"
SET "position" = "ranked_jobs"."position"
FROM "ranked_jobs"
WHERE "Job"."id" = "ranked_jobs"."id";

DROP INDEX "Job_userId_status_position_idx";

CREATE UNIQUE INDEX "Job_userId_status_position_key"
ON "Job"("userId", "status", "position");
