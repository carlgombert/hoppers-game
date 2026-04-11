-- Migration: add per-member ready-check state to party_members.
-- Enables the explicit ready-check flow before a synchronized game start.

ALTER TABLE party_members
  ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT FALSE;
