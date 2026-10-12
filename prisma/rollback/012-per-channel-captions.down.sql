-- 012 FR-06: the manual rollback data fix, run before booting the pre-012 image.
-- It sits outside prisma/migrations/ on purpose: it is never applied by
-- `migrate deploy`. It gives every post-012 draft (copyText NULL) a legacy
-- caption — its Instagram text, else its LinkedIn text, else '' — and restores
-- NOT NULL, which is all the previous image needs.

UPDATE "Draft" d SET "copyText" = COALESCE(
  (SELECT NULLIF(c."text", '') FROM "DraftCaption" c WHERE c."draftId" = d."id" AND c."channel" = 'INSTAGRAM'),
  (SELECT NULLIF(c."text", '') FROM "DraftCaption" c WHERE c."draftId" = d."id" AND c."channel" = 'LINKEDIN'),
  '')
WHERE d."copyText" IS NULL;
ALTER TABLE "Draft" ALTER COLUMN "copyText" SET NOT NULL;
-- Un-record migration 3, whose effect (DROP NOT NULL) was just undone. Without
-- this, a later 012 redeploy sees it as applied, never re-runs it, and every new
-- draft fails on NOT NULL (012 code never writes copyText). With it, the
-- roll-forward's boot `migrate deploy` re-applies it on its own.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261011140000_legacy_caption_text';
-- DraftCaption, Draft.headline, Draft.captionMigration and Channel.WHATSAPP are left in place:
-- the previous image never reads them, and they are what a roll-forward resumes from.
