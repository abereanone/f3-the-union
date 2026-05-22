PRAGMA foreign_keys = ON;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  f3_name TEXT NOT NULL UNIQUE,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX people_active_name_N1 ON people(is_active, f3_name);

CREATE TABLE auth_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_login_codes_email_created_N1 ON auth_login_codes(email, created_at);
CREATE INDEX auth_login_codes_code_hash_N1 ON auth_login_codes(code_hash);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_person_id_N1 ON auth_sessions(person_id);
CREATE INDEX auth_sessions_token_hash_N1 ON auth_sessions(token_hash);

CREATE TABLE miles_entries (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  submitted_by_person_id TEXT NOT NULL,
  updated_by_person_id TEXT,
  activity_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('run', 'walk', 'ruck', 'bike', 'swim')),
  miles REAL NOT NULL CHECK (miles > 0),
  source TEXT NOT NULL DEFAULT 'web',
  source_row_number INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (submitted_by_person_id) REFERENCES people(id),
  FOREIGN KEY (updated_by_person_id) REFERENCES people(id)
);

CREATE INDEX miles_entries_person_date_N1 ON miles_entries(person_id, activity_date);
CREATE INDEX miles_entries_submitter_N1 ON miles_entries(submitted_by_person_id);
CREATE INDEX miles_entries_active_date_N1 ON miles_entries(deleted_at, activity_date);
CREATE INDEX miles_entries_duplicate_N1 ON miles_entries(person_id, activity_date, category, deleted_at);
