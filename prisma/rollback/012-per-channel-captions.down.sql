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
-- DraftCaption, Draft.headline, Draft.captionMigration and Channel.WHATSAPP are left in place:
-- the previous image never reads them, and they are what a roll-forward resumes from.
