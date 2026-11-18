-- Invoices (idempotent)
ALTER TABLE "Band" ADD COLUMN IF NOT EXISTS "invoiceSettings" JSONB;

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "eventId" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "number" TEXT,
    "year" INTEGER,
    "sequence" INTEGER,
    "issueDate" DATE,
    "serviceDate" DATE,
    "serviceDateTo" DATE,
    "dueDate" DATE,
    "recipient" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "intro" TEXT,
    "notes" TEXT,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "smallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "cancelsNumber" TEXT,
    "issuer" JSONB,
    "paidAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reverseCharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelsNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_bandId_number_key" ON "Invoice"("bandId", "number");
CREATE INDEX IF NOT EXISTS "Invoice_bandId_createdAt_idx" ON "Invoice"("bandId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
