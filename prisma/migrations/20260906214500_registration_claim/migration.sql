-- CreateTable
CREATE TABLE "registration_claim" (
    "id" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_claim_pkey" PRIMARY KEY ("id")
);

-- Existing operators already closed first-user registration
INSERT INTO "registration_claim" ("id")
SELECT 1
WHERE EXISTS (SELECT 1 FROM "user")
ON CONFLICT ("id") DO NOTHING;
