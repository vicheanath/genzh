-- Making search work in Khmer.
--
-- # The problem
--
-- PostgreSQL's text search parser finds word boundaries by looking for
-- characters that are not letters — spaces, punctuation, digits. Khmer does not
-- write spaces between words, so that parser finds no boundaries at all and
-- hands back the entire run as a single token:
--
--     SELECT to_tsvector('english', 'ខ្ញុំស្រឡាញ់ភាសាខ្មែរ');
--     -- 'ខ្ញុំស្រឡាញ់ភាសាខ្មែរ':1
--
-- One token, for a sentence containing four words. Searching that document for
-- ភាសាខ្មែរ — "the Khmer language", plainly present in it — returns nothing,
-- because the only thing that can match a whole-sentence token is the whole
-- sentence typed back exactly. Khmer search was not degraded; it did not work.
--
-- No text search *configuration* fixes this. A configuration chooses stemming
-- and stop words, and both run on tokens the parser has already produced; the
-- failure happens one step earlier, in tokenisation. `simple` behaves the same
-- as `english` here, and so would a hypothetical `khmer`.
--
-- # What actually segments Khmer
--
-- Correct segmentation needs a dictionary or a trained model — ICU has both,
-- and PostgreSQL has neither. The options were:
--
--   * `pg_bigm`, which indexes character bigrams and is built for exactly this
--     family of languages. Not available on this server, and it is not in the
--     usual managed-Postgres extension lists either.
--   * Segmenting in the application before indexing, with a real Khmer
--     segmenter. Correct, and a dictionary plus a model in the write path of
--     every message.
--   * Substring matching, which needs no word boundaries at all.
--
-- The third is what this migration does, because for a language written without
-- spaces it is not a fallback — "find messages containing this sequence of
-- characters" is the question a Khmer speaker is actually asking, and it is
-- answered exactly rather than approximately.
--
-- # Why trigrams
--
-- `content ILIKE '%…%'` gives the right answer on its own but reads every row
-- to do it. `pg_trgm` indexes every three-character sequence in a column, which
-- lets PostgreSQL use an index for a leading-wildcard `LIKE` — the one case a
-- B-tree can never help with. Any pattern of three characters or more is
-- covered, and Khmer words comfortably clear that: ភាសា is four code points,
-- ខ្មែរ is five, and even short ones like បាយ ("rice") and ទឹក ("water") are
-- three.
--
-- The existing `tsvector` columns are kept and still carry the search. English
-- and other space-separated languages get stemming and ranking from them, which
-- trigrams cannot provide — "running" will not find "run" by substring. The two
-- run together: full-text where words exist, substrings where they do not.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN rather than GiST: slower to build and larger, and substantially faster to
-- search, which is the right trade for a column written once and searched
-- repeatedly. `gin_trgm_ops` is what makes `LIKE`/`ILIKE` indexable.
CREATE INDEX IF NOT EXISTS messages_content_trgm_idx
    ON messages USING GIN (content gin_trgm_ops);

-- Community discovery searches name and description with a leading wildcard
-- too — see `CommunityAdminService::search`, which until now could only
-- sequential-scan. Khmer community names get the same benefit as Khmer
-- messages, and the Latin ones stop scanning the table.
CREATE INDEX IF NOT EXISTS communities_name_trgm_idx
    ON communities USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS communities_description_trgm_idx
    ON communities USING GIN (description gin_trgm_ops);
