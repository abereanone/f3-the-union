import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'miles-import.sql';

if (!inputPath) {
  console.error('Usage: npm run miles:sheet:sql -- google-sheet-export.csv [miles-import.sql]');
  process.exit(1);
}

const sourceName = path.basename(inputPath);

if (!fs.existsSync(inputPath)) {
  console.error(`CSV file not found: ${inputPath}`);
  process.exit(1);
}

const csv = fs.readFileSync(inputPath, 'utf8');
const rows = parseCsv(csv);
const [header, ...records] = rows;
const columns = header.map(normalizeHeader);

const indexes = {
  timestamp: findColumn(columns, ['timestamp', 'submitted at', 'created at']),
  email: findColumn(columns, ['email address', 'email']),
  name: findColumn(columns, ['name', 'f3 name', 'pax', 'who are you entering miles for']),
  date: findColumn(columns, ['date', 'activity date', 'date of activity', 'what day']),
  run: findColumn(columns, ['run', 'running', 'run miles']),
  walk: findColumn(columns, ['walk', 'walking', 'walk miles']),
  ruck: findColumn(columns, ['ruck', 'rucking', 'ruck miles']),
  bike: findColumn(columns, ['bike', 'biking', 'bike miles']),
  swim: findColumn(columns, ['swim', 'swimming', 'swim miles']),
};

if (indexes.name < 0 && indexes.email < 0) {
  console.error('CSV must include a name/F3 name column or an email column.');
  process.exit(1);
}

if (indexes.date < 0) {
  console.error('CSV must include a date column.');
  process.exit(1);
}

const categories = ['run', 'walk', 'ruck', 'bike', 'swim'];
const lines = [
  'PRAGMA foreign_keys = ON;',
  `DELETE FROM miles_entries WHERE source = ${sqlString(sourceName)};`,
];

let sourceRowNumber = 1;
for (const record of records) {
  sourceRowNumber += 1;
  const f3Name = indexes.name >= 0 ? clean(record[indexes.name]) : '';
  const email = indexes.email >= 0 ? clean(record[indexes.email]).toLowerCase() : '';
  const date = normalizeDate(record[indexes.date]);
  const timestamp = normalizeTimestamp(indexes.timestamp >= 0 ? record[indexes.timestamp] : '');
  if (!date) continue;

  for (const category of categories) {
    const col = indexes[category];
    if (col < 0) continue;
    const miles = parseMiles(record[col]);
    if (!miles) continue;

    const personWhere = email
      ? `lower(p.email) = lower(${sqlString(email)})`
      : `lower(p.f3_name) = lower(${sqlString(f3Name)})`;

    lines.push(
      `INSERT INTO miles_entries (id, person_id, submitted_by_person_id, activity_date, category, miles, source, source_row_number, same_day_activity_confirmed, created_at) ` +
        `SELECT ${sqlString(crypto.randomUUID())}, p.id, p.id, ${sqlString(date)}, ${sqlString(category)}, ${miles}, ${sqlString(sourceName)}, ${sourceRowNumber}, 1, ${sqlString(timestamp)} ` +
        `FROM people p WHERE ${personWhere};`,
    );
  }
}

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.resolve(outputPath)}`);

function clean(value) {
  return String(value || '').trim();
}

function normalizeHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findColumn(columns, names) {
  const normalized = names.map(normalizeHeader);
  for (const name of normalized) {
    const exact = columns.indexOf(name);
    if (exact >= 0) return exact;
  }
  return columns.findIndex((column) => normalized.some((name) => column.includes(name)));
}

function parseMiles(value) {
  const cleaned = clean(value).replace(/,/g, '');
  if (!cleaned) return 0;
  const miles = Number(cleaned);
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  return Math.round(miles * 100) / 100;
}

function normalizeTimestamp(value) {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeDate(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return validYmd(year, month, day);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return validYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function validYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
