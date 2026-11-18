-- Security hardening (idempotent): TOTP replay protection
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "totpLastStep" INTEGER;
