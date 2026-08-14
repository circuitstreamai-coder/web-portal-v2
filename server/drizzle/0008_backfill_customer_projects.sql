INSERT INTO "ticket"."projects" ("id", "customer_id", "name", "author", "deleted", "created_at")
SELECT
  gen_random_uuid()::text,
  customer."id",
  COALESCE(NULLIF(BTRIM(customer."company_name"), ''), 'Customer') || ' - General Support',
  'migration',
  false,
  now()
FROM "ticket"."customers" AS customer
WHERE customer."deleted" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "ticket"."projects" AS project
    WHERE project."customer_id" = customer."id"
      AND project."deleted" = false
  );
