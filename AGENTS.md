# Miles Data Files (Read-Only)

This project uses **three generated JSON data files** for the static website. They are **read-only**, produced by a Google Apps Script, and **must not be modified by frontend code**.

## Files

1. `data/miles-raw.json`
   - Event-level data (one row per logged activity).
   - Shape:
     ```json
     {
       "generatedAt": "ISO timestamp",
       "rows": [
         {
           "rowNumber": number,
           "timestamp": "ISO timestamp",
           "name": "string",
           "date": "YYYY-MM-DD",
           "run": number,
           "walk": number,
           "ruck": number,
           "bike": number,
           "swim": number
         }
       ]
     }
     ```
   - Use for detailed tables, sorting, filtering, and duplicate detection.

2. `data/miles-summary.json`
   - Pre-aggregated totals per person for charts and leaderboards.
   - Shape:
     ```json
     {
       "year": number,
       "people": [
         {
           "name": "string",
           "run": number,
           "walk": number,
           "ruck": number,
           "bike": number,
           "swim": number,
           "total": number
         }
       ]
     }
     ```
   - Use for charts and leaderboards.

3. `data/miles-duplicates.json`
   - Potential duplicates for validation and highlighting.
   - A duplicate is defined as more than one non-zero entry for the same person, date, and category.
   - Shape:
     ```json
     {
       "duplicates": [
         {
           "name": "string",
           "date": "YYYY-MM-DD",
           "category": "run|walk|ruck|bike|swim",
           "rows": [
             { "row": number, "miles": number }
           ]
         }
       ]
     }
     ```
   - Use to flag potential issues in the UI.

## Frontend Expectations

- Load these files via `fetch()`.
- Do not mutate the JSON.
- Use `miles-summary.json` for charts.
- Use `miles-raw.json` for sortable/filterable tables.
- Use `miles-duplicates.json` to flag potential issues.
