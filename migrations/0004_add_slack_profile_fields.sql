ALTER TABLE people ADD COLUMN slack_user_id TEXT;
ALTER TABLE people ADD COLUMN slack_username TEXT;
ALTER TABLE people ADD COLUMN full_name TEXT;
ALTER TABLE people ADD COLUMN needs_profile_update INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN slack_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN slack_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN last_slack_sync_at TEXT;

CREATE UNIQUE INDEX people_slack_user_id_U1 ON people(slack_user_id) WHERE slack_user_id IS NOT NULL;
