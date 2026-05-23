/**
 * fng-xlsx-to-sql.mjs
 *
 * Reads data/FNG_History.xlsx directly and outputs SQL INSERT statements.
 * Requires SheetJS: npm install --save-dev xlsx
 *
 * Usage:
 *   npm install --save-dev xlsx
 *   node scripts/fng-xlsx-to-sql.mjs
 *   # Review the output and the name-matching report, then apply:
 *   npx wrangler d1 execute f3_the_union --remote --file=data/fng-history.sql
 *
 * Expected xlsx columns:
 *   Timestamp | Legal name | F3 nickname | Phone number |
 *   Emergency contact. Name and phone n... | Email Address |
 *   What location did you attend today? | Who EH'd you? |
 *   Joined Slack? | 2nd Post | Notes
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const XLSX_PATH = resolve(ROOT, 'data', 'FNG_History.xlsx');
const SQL_PATH  = resolve(ROOT, 'data', 'fng-history.sql');

// Dynamic import so the error message is clear if xlsx isn't installed
let xlsx;
try {
  xlsx = await import('xlsx');
} catch {
  console.error('\nMissing dependency: run  npm install --save-dev xlsx  then try again.\n');
  process.exit(1);
}

// Known location name aliases → canonical name
const LOCATION_MAP = {
  'the farm':       'The Farm',
  'farm':           'The Farm',
  'the yard':       'The Yard',
  'yard':           'The Yard',
  'the factory':    'The Factory',
  'factory':        'The Factory',
  'the plant':      'The Plant',
  'plant':          'The Plant',
  'the redzone':    'The Redzone',
  'redzone':        'The Redzone',
  'red zone':       'The Redzone',
  'the dock':       'The Dock',
  'dock':           'The Dock',
  'the cafeteria':  'The Cafeteria',
  'cafeteria':      'The Cafeteria',
  'the floor':      'The Floor',
  'floor':          'The Floor',
  'the forge':      'The Forge',
  'forge':          'The Forge',
  'the clocktower': 'The Clocktower',
  'clocktower':     'The Clocktower',
  'clock tower':    'The Clocktower',
  'the fountain':   'The Fountain',
  'fountain':       'The Fountain',
  'the show':       'The Show',
  'show':           'The Show',
  'the downrange':  'The Downrange',
  'downrange':      'The Downrange',
};

function readXlsx(filePath) {
  const buf = readFileSync(filePath);
  const workbook = xlsx.read(buf, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // sheet_to_json returns rows as objects keyed by header
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  // Normalize all values to strings (dates come back as Date objects)
  const normalized = rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = v.toISOString();
      } else {
        out[k] = String(v ?? '').trim();
      }
    }
    return out;
  });
  return { headers, rows: normalized };
}

function normalizeLocation(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return LOCATION_MAP[key] || raw.trim() || null;
}

function parseBool(val) {
  if (!val) return 0;
  const v = val.trim().toLowerCase();
  return ['yes', 'true', '1', 'y'].includes(v) ? 1 : 0;
}

function parseDate(val) {
  if (!val) return null;
  // Try common date formats
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseTimestamp(val) {
  if (!val) return null;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function sqlStr(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function uuid(seed) {
  // Deterministic UUID from seed so re-runs produce same IDs
  const hash = createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8), hash.slice(8, 12),
    '4' + hash.slice(13, 16), '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ── Load xlsx ─────────────────────────────────────────────────────────────────
let headers, rows;
try {
  ({ headers, rows } = readXlsx(XLSX_PATH));
} catch (err) {
  console.error(`\nCannot read ${XLSX_PATH}: ${err.message}\n`);
  process.exit(1);
}
console.log(`\nParsed ${rows.length} rows from CSV\n`);
console.log('Headers found:', headers.map((h) => `"${h}"`).join(', '));

// Map header positions — flexible matching to tolerate minor wording differences
function findHeader(candidates) {
  return headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c.toLowerCase())));
}

const H = {
  timestamp:        findHeader(['Timestamp']),
  legalName:        findHeader(['Legal name', 'Legal Name', 'Name']),
  f3Name:           findHeader(['F3 nickname', 'F3 name', 'nickname', 'F3']),
  phone:            findHeader(['Phone num', 'Phone']),
  emergencyContact: findHeader(['Emergency contact', 'Emergency']),
  email:            findHeader(['Email Address', 'Email']),
  location:         findHeader(['location did you attend', 'Location', 'AO']),
  ehedBy:           findHeader(["EH'd you", 'EH', 'Who EH']),
  joinedSlack:      findHeader(['Joined Slack', 'Slack']),
  secondPost:       findHeader(['2nd Post', 'Second Post', '2nd']),
  notes:            findHeader(['Notes']),
};

console.log('\nColumn mapping:');
Object.entries(H).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} → ${v || '(not found)'}`));
console.log();

// ── Generate SQL ──────────────────────────────────────────────────────────────
const inserts = [];
const warnings = [];
const unknownLocations = new Set();

rows.forEach((row, idx) => {
  const legalName = H.legalName ? row[H.legalName] : '';
  if (!legalName) { warnings.push(`Row ${idx + 2}: skipped — no legal name`); return; }

  const timestamp   = H.timestamp        ? parseTimestamp(row[H.timestamp]) : null;
  const f3Name      = H.f3Name           ? row[H.f3Name] || null : null;
  const phone       = H.phone            ? row[H.phone] || null : null;
  const ec          = H.emergencyContact ? row[H.emergencyContact] || null : null;
  const email       = H.email            ? row[H.email]?.toLowerCase() || null : null;
  const locationRaw = H.location         ? row[H.location] : '';
  const location    = normalizeLocation(locationRaw) || 'Unknown';
  const ehedByRaw   = H.ehedBy          ? row[H.ehedBy] || null : null;
  const joinedSlack = H.joinedSlack      ? parseBool(row[H.joinedSlack]) : 0;
  const secondPost  = H.secondPost       ? parseDate(row[H.secondPost]) : null;
  const notesText   = H.notes            ? row[H.notes] || null : null;

  if (locationRaw && !LOCATION_MAP[locationRaw.toLowerCase()] && location === 'Unknown') {
    unknownLocations.add(locationRaw);
  }

  const notesJson = notesText ? JSON.stringify({ text: notesText, source: 'xlsx_import' }) : JSON.stringify({ source: 'xlsx_import' });
  const entryId = uuid(`fng:${legalName}:${timestamp || idx}`);

  // ehed_by_person_id resolved via subquery — case-insensitive, space-insensitive
  const ehedBySubquery = ehedByRaw
    ? `(SELECT id FROM people WHERE replace(lower(f3_name),' ','') = replace(lower(${sqlStr(ehedByRaw)}),' ','') AND is_active = 1 LIMIT 1)`
    : 'NULL';

  inserts.push(
    `INSERT OR IGNORE INTO fng_entries ` +
    `(id, legal_name, f3_name, phone, emergency_contact, email, location, ehed_by_person_id, ehed_by_raw, joined_slack, second_post, notes, source_timestamp) ` +
    `VALUES (${[
      sqlStr(entryId), sqlStr(legalName), sqlStr(f3Name), sqlStr(phone), sqlStr(ec),
      sqlStr(email), sqlStr(location), ehedBySubquery, sqlStr(ehedByRaw),
      joinedSlack, sqlStr(secondPost), sqlStr(notesJson), sqlStr(timestamp),
    ].join(', ')});`
  );
});

const sql = [
  '-- FNG History import',
  `-- Generated: ${new Date().toISOString()}`,
  `-- Rows: ${inserts.length}`,
  '',
  ...inserts,
].join('\n');

writeFileSync(SQL_PATH, sql, 'utf-8');
console.log(`\nWrote ${inserts.length} INSERT statements to ${SQL_PATH}\n`);

if (unknownLocations.size) {
  console.warn('⚠ Unknown locations (add to LOCATION_MAP in this script):');
  unknownLocations.forEach((l) => console.warn(`   "${l}"`));
  console.warn();
}

if (warnings.length) {
  console.warn('⚠ Name / data warnings:');
  warnings.forEach((w) => console.warn('  ', w));
  console.warn();
}

console.log('Next step:');
console.log(`  npx wrangler d1 execute f3_the_union --remote --file=${SQL_PATH}`);
console.log('  (or --local for local preview)\n');
