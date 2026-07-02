-- Drop the now-unused match_assignments overloads. The only caller (findSimilarAssignment / the
-- cache-offer path) was removed from the bot, so both the original 3-arg and the module-filtered
-- 4-arg versions are dead. IF EXISTS keeps this idempotent. Two-step safe: apply after the bot
-- deploy that removed the caller.
drop function if exists match_assignments(vector(384), float, int);
drop function if exists match_assignments(vector(384), float, int, text);
