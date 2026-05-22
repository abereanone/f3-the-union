# D1 and Resend Setup

This app now uses Cloudflare Pages Functions, D1, and Resend for the Miles flow.

## Local Install

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```text
RESEND_API_KEY=re_your_key
RESEND_FROM="F3 The Union <login@f3theunion.com>"
SLACK_BOT_TOKEN=xoxb_your_rotated_slack_bot_token
DEV_AUTH_BYPASS=0
```

For local UI testing without sending a Resend email, set:

```text
DEV_AUTH_BYPASS=1
```

Then `/miles/` still checks D1 first and Slack second, but skips Resend and uses the fixed login code:

```text
000000
```

The email address must still belong to an active Slack user with a Slack display name unless that person already exists in D1 with Slack identity loaded.

Do not enable `DEV_AUTH_BYPASS` in Cloudflare production.

## Cloudflare D1

Create the database:

```powershell
npx wrangler login
npx wrangler d1 create f3_the_union
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "f3_the_union"
database_id = "the-real-uuid-from-cloudflare"
preview_database_id = "f3_the_union"
```

Apply migrations locally:

```powershell
npm run db:migrate
```

Apply migrations to Cloudflare:

```powershell
npm run db:migrate:remote
```

## People Import

Prepare a CSV with the email to F3 name mapping:

```csv
email,f3_name,is_admin
floppy@example.com,Floppy Disk,true
someone@example.com,Someone,false
```

Generate SQL:

```powershell
npm run people:sql -- people.csv
```

Import locally:

```powershell
npx wrangler d1 execute f3_the_union --local --file people-import.sql
```

Import remotely:

```powershell
npx wrangler d1 execute f3_the_union --remote --file people-import.sql
```

## Existing Miles Import

Load `people` first. The import script maps historical entries by `people.f3_name`.

```powershell
npm run miles:sql
npx wrangler d1 execute f3_the_union --local --file miles-import.sql
npx wrangler d1 execute f3_the_union --remote --file miles-import.sql
```

Historical rows are stored with `source = 'google-sheets'` and `submitted_by_person_id = person_id`.

If you export the original Google Sheet directly as CSV, use:

```powershell
npm run miles:sheet:sql -- google-sheet-export.csv
npx wrangler d1 execute f3_the_union --local --file miles-import.sql
npx wrangler d1 execute f3_the_union --remote --file miles-import.sql
```

The CSV importer accepts common Google Form columns:

```text
Timestamp, Email Address, Name/F3 Name, Date, Run, Walk, Ruck, Bike, Swim
```

It creates one D1 row per non-zero category. If the CSV has `Email Address`, it maps by `people.email`; otherwise it maps by `people.f3_name`.

## Resend Domain

In Resend:

1. Add the sending domain you want to use for login mail, for example `f3theunion.com`.
2. Resend will show required DNS records for SPF, DKIM, and the return path.
3. In Cloudflare DNS, add each record exactly as Resend shows it.
4. Wait for Resend to mark the domain verified.
5. Use a sender that matches the verified domain:

```text
F3 The Union <login@f3theunion.com>
```

Recommended optional DNS hardening after SPF/DKIM verify:

```text
Type: TXT
Name: _dmarc
Content: v=DMARC1; p=none; rua=mailto:postmaster@f3theunion.com
```

Start with `p=none` so you can observe mail results before enforcing stricter DMARC.

## Cloudflare Pages Environment

For production, set these on the Cloudflare Pages project:

```text
RESEND_API_KEY
RESEND_FROM
SLACK_BOT_TOKEN
```

Also bind D1:

```text
Variable name: DB
Database: f3_the_union
```

If you use the Cloudflare dashboard, redeploy after adding bindings or environment variables.

## Local Run

```powershell
npm run dev
```

Wrangler will serve the static site and Pages Functions locally. Open the URL it prints, usually `http://127.0.0.1:8788`.

## API Shape

Auth:

- `POST /api/auth/request-code`
- `POST /api/auth/verify-code`
- `POST /api/auth/logout`
- `GET /api/me`

Miles:

- `GET /api/people`
- `GET /api/miles/raw`
- `GET /api/miles/summary`
- `GET /api/miles/exceptions`
- `GET /api/miles/meta`
- `GET /api/miles/my-entries`
- `POST /api/miles/entries`
- `PUT /api/miles/entries/:id`
- `DELETE /api/miles/entries/:id`

## Slack First-Login Provisioning

Login checks D1 first. If `people.email` already exists and is active, the app sends the email code immediately.

If the email is not in D1, the API looks up only that email in Slack using `users.lookupByEmail`; it does not call `users.list` or scan every Slack user during login. Slack requires the bot token to have:

```text
users:read
users:read.email
```

Provisioning rules:

- Slack user found with `profile.display_name`: insert/update `people` and send the login code.
- Slack user found with no `profile.display_name`: block login and ask the user to update Slack display name to their F3 name.
- Slack user not found: block login with the F3 The Union Slack warning.
- Slack user is deleted, bot, or app user: block login.
- Slack display name conflicts with another D1 person: block and ask them to contact Floppy Disk.

The Slack bot token must be treated as a secret. If a token is pasted into chat or committed anywhere, rotate it in Slack before using this app.

## Duplicate Handling

The API checks for an existing active entry with the same:

```text
person_id + activity_date + category
```

If a user submits another matching entry, the API returns `409 SAME_DAY_ACTIVITY_CONFIRMATION_REQUIRED`. The Miles form then asks the user to confirm that this was a second activity for the same day. Confirmed second entries are stored with `same_day_activity_confirmed = 1`, and `/api/miles/exceptions` does not flag them.

Users can also edit recent entries from the Miles form. A user can edit entries for themselves, entries they submitted for someone else, and admins can edit all entries.
