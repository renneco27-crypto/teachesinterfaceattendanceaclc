-- ============================================================================
-- BLE attendance: offline sync columns on attendance_records
-- Adds method/challenge/signature/sync columns used by submit-ble-attendance
-- and the offline IndexedDB queue. Purely additive.
-- ============================================================================

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS face_frame_url TEXT,
  ADD COLUMN IF NOT EXISTS is_mock_location BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'qr' CHECK (method IN ('qr', 'ble', 'manual')),
  ADD COLUMN IF NOT EXISTS challenge_hex TEXT,
  ADD COLUMN IF NOT EXISTS signature_hex TEXT,
  ADD COLUMN IF NOT EXISTS offline_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;