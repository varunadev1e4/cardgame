# Cardroom — private multiplayer card games (Supabase + Vercel)

Games: Blackjack, In Between, Lucky Seven (push-your-luck), Least Count, Powder Keg (elimination).

## Layout
- `frontend/` React + Vite app (deploy to Vercel, Root Directory = `frontend`)
- `supabase/functions/game/index.ts` the ready-to-paste Edge Function (all game rules run here)
- `supabase/migrations/002_room_states.sql` the only table needed
- `server/` game engines and room logic (source for the function), `tests/` unit tests

## Setup
1. Supabase: create project. SQL Editor: run `supabase/migrations/002_room_states.sql`.
2. Edge Functions > Deploy via Editor > name `game` > paste `supabase/functions/game/index.ts` > deploy. Turn OFF "Verify JWT".
3. Edge Functions > Secrets: add `GUEST_TOKEN_SECRET` (long random text).
4. Vercel: import repo, Root Directory `frontend`, env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API). Deploy.
5. Supabase secrets: add `CLIENT_ORIGIN` = your Vercel URL (no trailing slash).
6. Open the Vercel link, create a room, copy the invite link, share.

## Changing game rules later
`npm install && npm test`, edit files in `server/`, then `npm run build:function` and paste the new `supabase/functions/game/index.ts` into the Supabase editor.
