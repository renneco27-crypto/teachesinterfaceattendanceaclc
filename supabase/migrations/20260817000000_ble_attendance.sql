-- ============================================================================
-- BLE attendance: cryptographic device identity
-- Adds public key storage to device_registrations. Purely additive.
-- ============================================================================

ALTER TABLE device_registrations
  ADD COLUMN IF NOT EXISTS public_key TEXT,
  ADD COLUMN IF NOT EXISTS key_algorithm TEXT DEFAULT 'ECDSA-P256';
