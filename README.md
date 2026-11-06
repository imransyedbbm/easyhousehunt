# EasyHouseHunt

Map-first, zero-brokerage rental, sale and commercial space discovery for Bengaluru: [easyhousehunt.com](https://easyhousehunt.com).

## Stack
- React 18 + Vite + TypeScript, Tailwind, shadcn/ui, lucide icons
- MapLibre GL (CARTO dark basemap)
- Supabase: auth, Postgres, storage, edge functions. Migrations in `supabase/migrations`
- Vercel hosting. Server-rendered public pages in `api/`
- Email via Resend; optional WhatsApp alerts via Meta Cloud API

## Features
**Tenants:** map + list browsing, filters (type, BHK, rent, furnishing, area), first-visit welcome screen with area search, listing detail with full-screen photo viewer, save homes, chat with owners, post a requirement and get email/WhatsApp alerts on matches and price drops, RentRight agreements.

**Owners:** listing wizard with photo compression and nearby rent suggestion, My Listings with views / saves / enquiries, "Still available" / "Mark let out" check-ins, WhatsApp share, weekly reminder emails with one-tap confirm.

**Admins:** approval queue and admin dashboard (admins set via `profiles.is_admin`).

## Public pages (SEO)
| URL | Handler | What |
| --- | --- | --- |
| `/l/<slug>-<code>` | `api/listing.js` | Full listing page, JSON-LD, nearby homes, WhatsApp/contact CTAs |
| `/rent`, `/rent/<area>` | `api/rent.js` | 120 Bengaluru locality pages (homes within 2.5 km) |
| `/sitemap.xml` | `api/sitemap.js` | Areas + every approved listing |
| `/api/confirm` | `api/confirm.js` | One-tap owner confirm from reminder emails |

Shared helpers: `api/_lib/page.js`. `api/_lib/localities.js` is generated from `src/data/localities.ts`.

App deep links: `/?p=<code>` (open listing), `/?area=<slug>`, `/?list=1`, `/?requirement=1`.

## Local setup
```bash
npm ci
cp .env.example .env   # fill in your Supabase project values
npm run dev            # http://localhost:8080
```

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel + `.env` | Supabase project URL (also used by `api/`) |
| `VITE_SUPABASE_ANON_KEY` | Vercel + `.env` | Supabase anon key |

## Supabase
**Migrations:** run new files from `supabase/migrations` in the SQL Editor, in filename order. All recent ones are safe to re-run.

**Edge functions** (`supabase/functions`):
| Function | Purpose | Notes |
| --- | --- | --- |
| `notify-email` | Enquiry/chat emails | |
| `notify-matches` | Requirement match + price-drop alerts | |
| `owner-reminders` | Weekly "still available?" emails | Deploy with JWT verification **off**; called by pg_cron |
| `gemini-proxy` | AI helper proxy | |

**Secrets:** `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `CRON_SECRET`; optional `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`.

**Scheduled job:** `owner-reminders-weekly` (pg_cron, Mondays 10:00 IST); needs `pg_cron` and `pg_net` enabled. See the bottom of `20261106120000_owner_reminders.sql`. Test without sending: call the function with `?dry=1`.

**Insights tables:** `listing_views` (one row per listing/visitor/day, no personal data) and `listing_tokens` (secret email-button tokens). Both have RLS on with no policies and are only reached through `SECURITY DEFINER` functions.

## Deploy
Push to `main` → Vercel builds and deploys. After adding listings or areas, Google picks them up from `/sitemap.xml` (submitted in Search Console).

## Scripts
`npm run build` · `npm run preview` · `npm run lint` · `npm test`
