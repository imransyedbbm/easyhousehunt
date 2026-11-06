# EasyHouseHunt

Map-first rental and commercial space discovery for Bengaluru — [easyhousehunt.com](https://easyhousehunt.com).

## Stack
- React 18 + Vite + TypeScript, Tailwind, shadcn/ui
- MapLibre GL (CARTO dark basemap)
- Supabase (auth, Postgres, storage) — migrations in `supabase/migrations`
- Vercel hosting; `/l/:id` share links served by `api/listing`

## Local setup
```bash
npm ci
cp .env.example .env   # fill in your Supabase project values
npm run dev            # http://localhost:8080
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |

## Scripts
`npm run build` · `npm run preview` · `npm run lint` · `npm test`
