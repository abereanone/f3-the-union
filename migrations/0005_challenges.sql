PRAGMA foreign_keys = ON;

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  goal_miles REAL NOT NULL DEFAULT 250,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX challenges_active_N1 ON challenges(is_active, start_date);

CREATE TABLE challenge_enrollments (
  challenge_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (challenge_id, person_id),
  FOREIGN KEY (challenge_id) REFERENCES challenges(id),
  FOREIGN KEY (person_id) REFERENCES people(id)
);

-- Seed the July 4th 250 Mile Challenge
INSERT INTO challenges (id, slug, name, start_date, end_date, goal_miles, image_url)
VALUES (
  '00000000-0000-0000-0000-250july42026',
  '250-july-4th-2026',
  'July 4th 250 Mile Challenge',
  '2026-04-17',
  '2026-07-04',
  250,
  '/2fitty.jpg'
);
