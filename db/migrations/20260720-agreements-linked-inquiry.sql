-- 20260720 · Link agreements back to the ad inquiry that spawned them.
--
-- This column is written by /api/admin/ads/inquiries/[id]/quote so admins
-- can trace an agreement back to the original public inquiry (and vice
-- versa in the inbox detail surface). Kept nullable because agreements
-- created via /admin/agreements (no inquiry) still need to work.

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS linked_inquiry_id uuid;

-- Partial index — only agreements that came from an inquiry get indexed,
-- keeps the index small since most agreements will be admin-drafted.
CREATE INDEX IF NOT EXISTS agreements_linked_inquiry_id_idx
  ON agreements (linked_inquiry_id)
  WHERE linked_inquiry_id IS NOT NULL;
