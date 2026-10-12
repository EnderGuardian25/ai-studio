-- 008 FR-06: the manual full removal, run only to take 008 out entirely. The
-- previous image does NOT need it: it never reads these objects, so a plain
-- image rollback works against the migrated schema. It sits outside
-- prisma/migrations/ on purpose: it is never applied by `migrate deploy`.
-- It drops what 20261012120000_model_selection added, in reverse order.
-- Destructive: every stamp, every Brief model request and every team model
-- policy is lost.

ALTER TABLE "DraftCaption"  DROP COLUMN IF EXISTS "model", DROP COLUMN IF EXISTS "modelSubstitutedFrom";
ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "model", DROP COLUMN IF EXISTS "modelSubstitutedFrom";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "headlineModel", DROP COLUMN IF EXISTS "headlineModelSubstitutedFrom",
                    DROP COLUMN IF EXISTS "designModel",   DROP COLUMN IF EXISTS "designModelSubstitutedFrom";
ALTER TABLE "Brief" DROP COLUMN IF EXISTS "captionModel", DROP COLUMN IF EXISTS "designModel";
-- The FKs go with their tables; TeamModelDefault references TeamModelPolicy, so it goes first.
DROP TABLE IF EXISTS "TeamModelDefault";
DROP TABLE IF EXISTS "TeamModelPolicy";
-- Last: Brief's two columns and both tables used these types.
DROP TYPE IF EXISTS "ModelSurface";
DROP TYPE IF EXISTS "ModelKey";
-- L24: un-record the migration. Without this, a later 008 redeploy sees it as
-- applied, never re-runs it, and the 008 image fails on the missing columns.
-- With it, the roll-forward's boot `migrate deploy` re-applies it on its own.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261012120000_model_selection';
