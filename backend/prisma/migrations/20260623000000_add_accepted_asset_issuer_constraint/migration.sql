-- #610: Require issuer for all non-XLM accepted assets.
-- XLM is the native Stellar asset and has no issuer; every other asset
-- (e.g. USDC, EURC) is identified by both a code AND an issuer address.
-- Allowing a NULL issuer on a non-XLM row creates an unresolvable asset
-- reference on the Stellar network.
--
-- Application-level validation (Zod refine) was added at the same time,
-- so this constraint acts as a database-level safety net.
ALTER TABLE "AcceptedAsset"
  ADD CONSTRAINT "AcceptedAsset_issuer_required_for_non_xlm"
  CHECK (UPPER(code) = 'XLM' OR (issuer IS NOT NULL AND issuer <> ''));
