-- Migration: 20261027_tournament_test_injection_cleanup.sql
-- Purpose: Add server-controlled test provenance tracking columns to tournament_registrations
-- Constraint: Additive and idempotent only; do not execute against live DB without authorization.

ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS test_batch_id VARCHAR(100);
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS injected_by VARCHAR(100);
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS injected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_test ON tournament_registrations(tournament_id, is_test);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_test_batch ON tournament_registrations(test_batch_id);
