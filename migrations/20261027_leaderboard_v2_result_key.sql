-- Add the per-match result key only when existing data satisfies it.
-- If duplicates are present, report them and leave rows untouched; reads select latest updated row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tournament_match_results
    GROUP BY match_id, team_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped tournament_match_results unique index: duplicate (match_id, team_id) rows exist; no rows were changed.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS tournament_match_results_match_id_team_id_key
      ON tournament_match_results (match_id, team_id);
  END IF;
END
$$;
