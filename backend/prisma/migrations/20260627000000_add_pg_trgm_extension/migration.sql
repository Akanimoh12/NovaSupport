-- Enable pg_trgm extension for fuzzy text search
-- This was previously executed on every search request, causing unnecessary DDL locks
CREATE EXTENSION IF NOT EXISTS pg_trgm;
