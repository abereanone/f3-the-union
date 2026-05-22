import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'people-import.sql';

if (!inputPath) {
  console.error('Usage: npm run people:sql -- people.csv [people-import.sql]');
  process.exit(1);
}

const csv = fs.readFileSync(inputPath, 'utf8');
const rows = parseCsv(csv);
const [header, ...records] = rows;
const columns = header.map((value) => value.trim().toLowerCase());
const emailIndex = columns.indexOf('email');
const nameIndexes = ['f3_name', 'f3name', 'displayname', 'display_name']
  .map((name) => columns.indexOf(name))
  .filter((index) => index >= 0);
const adminIndex = columns.indexOf('is_admin');

if (emailIndex < 0 || nameIndexes.length === 0) {
  console.error('CSV must include email and a name column: f3_name or displayname.');
  process.exit(1);
}

const people = records
  .map((record) => {
    const email = (record[emailIndex] || '').trim().toLowerCase();
    const f3Name = firstNonBlank(nameIndexes.map((index) => record[index]));
    const isAdmin = adminIndex >= 0 && truthy(record[adminIndex]) ? 1 : 0;
    return { email, f3Name, isAdmin };
  })
  .filter((person) => person.email && person.f3Name);

const duplicateEmails = duplicates(people.map((person) => person.email));
const duplicateNames = duplicates(people.map((person) => person.f3Name.toLowerCase()));

if (duplicateEmails.length || duplicateNames.length) {
  if (duplicateEmails.length) {
    console.error('Duplicate emails found:');
    duplicateEmails.forEach((value) => console.error(`- ${value}`));
  }
  if (duplicateNames.length) {
    console.error('Duplicate F3 names found. Resolve these before importing:');
    duplicateNames.forEach((value) => {
      const matches = people.filter((person) => person.f3Name.toLowerCase() === value);
      console.error(`- ${matches[0].f3Name}: ${matches.map((person) => person.email).join(', ')}`);
    });
  }
  process.exit(1);
}

const lines = [
  'PRAGMA foreign_keys = ON;',
  'BEGIN TRANSACTION;',
];

for (const person of people) {
  lines.push(
    `INSERT INTO people (id, email, f3_name, is_admin) VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(person.email)}, ${sqlString(person.f3Name)}, ${person.isAdmin}) ` +
      `ON CONFLICT(email) DO UPDATE SET f3_name = excluded.f3_name, is_admin = excluded.is_admin, is_active = 1, updated_at = CURRENT_TIMESTAMP;`,
  );
}

lines.push('COMMIT;');
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.resolve(outputPath)}`);

function truthy(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function firstNonBlank(values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function duplicates(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
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
