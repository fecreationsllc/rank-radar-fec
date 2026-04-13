
-- Delete all rank_history rows where position is NULL (bad data from premature polling)
DELETE FROM public.rank_history WHERE position IS NULL;

-- Delete all completed ranking_tasks so a fresh sync can be triggered
DELETE FROM public.ranking_tasks WHERE status = 'completed';
