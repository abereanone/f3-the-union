CREATE TABLE fng_entries (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  f3_name TEXT,
  phone TEXT,
  emergency_contact TEXT,
  email TEXT,
  location TEXT NOT NULL,
  ehed_by_person_id TEXT,
  ehed_by_raw TEXT,
  joined_slack INTEGER NOT NULL DEFAULT 0,
  second_post TEXT,
  notes TEXT,
  submitted_by_person_id TEXT,
  slack_notified_at TEXT,
  welcome_email_sent_at TEXT,
  source_timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ehed_by_person_id) REFERENCES people(id),
  FOREIGN KEY (submitted_by_person_id) REFERENCES people(id)
);

CREATE INDEX fng_entries_created_N1 ON fng_entries(created_at);
CREATE INDEX fng_entries_location_N1 ON fng_entries(location);
CREATE INDEX fng_entries_ehed_by_N1 ON fng_entries(ehed_by_person_id);
