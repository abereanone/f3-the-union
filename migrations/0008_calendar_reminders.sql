CREATE TABLE calendar_reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('once', 'annual', 'monthly')),
  remind_days_before INTEGER NOT NULL DEFAULT 7,
  slack_channel_id TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_notified_for TEXT,
  created_by_person_id TEXT,
  updated_by_person_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_person_id) REFERENCES people(id),
  FOREIGN KEY (updated_by_person_id) REFERENCES people(id)
);

CREATE INDEX calendar_reminders_active_date_N1 ON calendar_reminders(is_active, event_date);
