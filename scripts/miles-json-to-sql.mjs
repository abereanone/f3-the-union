import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] || 'data/miles-raw.json';
const outputPath = process.argv[3] || 'miles-import.sql';
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const categories = ['run', 'walk', 'ruck', 'bike', 'swim'];
const lines = [
  'PRAGMA foreign_keys = ON;',
  'BEGIN TRANSACTION;',
];

for (const row of data.rows || []) {
  const f3Name = String(row.name || '').trim();
  const date = String(row.date || '').trim();
  if (!f3Name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  for (const category of categories) {
    const miles = Number(row[category] || 0);
    if (!Number.isFinite(miles) || miles <= 0) continue;
    const entryId = crypto.randomUUID();
    const sameDayActivityConfirmed = row.ignoreDupe === true ? 1 : 0;
    lines.push(
      `INSERT INTO miles_entries (id, person_id, submitted_by_person_id, activity_date, category, miles, same_day_activity_confirmed, source, source_row_number, created_at) ` +
        `SELECT ${sqlString(entryId)}, p.id, p.id, ${sqlString(date)}, ${sqlString(category)}, ${round2(miles)}, ${sameDayActivityConfirmed}, 'google-sheets', ${Number(row.rowNumber) || 'NULL'}, ${sqlString(row.timestamp || new Date().toISOString())} ` +
        `FROM people p WHERE lower(p.f3_name) = lower(${sqlString(f3Name)});`,
    );
  }
}

lines.push('COMMIT;');
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.resolve(outputPath)}`);

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
