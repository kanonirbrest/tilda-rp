-- Merge duplicate Customer rows that share the same email (case-insensitive).
-- Keep the oldest customer; move orders; prefer non-null birthDate; delete extras.

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    "birthDate",
    ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Customer"
),
canon AS (
  SELECT id, email_key FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, c.id AS canon_id, r."birthDate" AS dupe_birth
  FROM ranked r
  INNER JOIN canon c ON c.email_key = r.email_key
  WHERE r.rn > 1
)
UPDATE "Order" o
SET "customerId" = d.canon_id
FROM dupes d
WHERE o."customerId" = d.dupe_id;

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    "birthDate",
    ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Customer"
),
canon AS (
  SELECT id, email_key, "birthDate" FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, c.id AS canon_id, r."birthDate" AS dupe_birth
  FROM ranked r
  INNER JOIN canon c ON c.email_key = r.email_key
  WHERE r.rn > 1
)
UPDATE "Customer" c
SET "birthDate" = d.dupe_birth
FROM dupes d
WHERE c.id = d.canon_id
  AND c."birthDate" IS NULL
  AND d.dupe_birth IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Customer"
)
DELETE FROM "Customer" c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;
