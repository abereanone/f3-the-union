ALTER TABLE fng_entries ADD COLUMN last_slack_recheck_at TEXT;
ALTER TABLE fng_entries ADD COLUMN slack_recheck_result TEXT;

CREATE INDEX fng_entries_slack_recheck_N1
ON fng_entries(joined_slack, last_slack_recheck_at);
