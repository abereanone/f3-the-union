CREATE TABLE aos (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  site_q TEXT,
  dow TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '05:30',
  duration TEXT NOT NULL DEFAULT ':45',
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX aos_active_region_N1 ON aos(is_active, region, name);

INSERT INTO aos (id, slug, name, region, site_q, dow, start_time, duration) VALUES
  ('the_breakroom', 'the_breakroom', 'The Breakroom', 'Marysville', 'Peach', '6', '6:00', ':45'),
  ('the_clocktower', 'the_clocktower', 'The Clocktower', 'Plain City', 'Peach', '3,5', '5:30', ':45'),
  ('the_dock', 'the_dock', 'The Dock', 'Richwood', 'Coffin', '2,4', '5:30', ':45'),
  ('the_factory', 'the_factory', 'The Factory', 'Marysville', 'Pididle', '3,5', '5:30', ':45'),
  ('the_farm', 'the_farm', 'The Farm', 'Marysville', 'Charlotte', '2,4', '5:30', ':45'),
  ('the_floor', 'the_floor', 'The Floor', 'Marysville', 'Dewey', '6', '5:30', ':45'),
  ('the_forge', 'the_forge', 'The Forge', 'Richwood', 'Dorothy', '6', '5:30', ':45'),
  ('the_fountain', 'the_fountain', 'The Fountain', 'Bellefontaine', 'Harbaugh 3-5', '2,4', '5:30', ':45'),
  ('the_plant', 'the_plant', 'The Plant', 'Marysville', 'Vagabond', '7', '6:30', '1:00'),
  ('the_redzone', 'the_redzone', 'The Redzone', 'Marysville', 'Ocho', '3,5', '5:15', '1:00'),
  ('the_show', 'the_show', 'The Show', 'Richwood', 'Bumblebee', '3,5', '5:15', ':45'),
  ('the_yard', 'the_yard', 'The Yard', 'Marysville', 'Barf', '6', '5:30', ':45'),
  ('the_cafeteria', 'the_cafeteria', 'The Cafeteria', 'Marysville', 'Alice', '6', '5:30', ':45');
