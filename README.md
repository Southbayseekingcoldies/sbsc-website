# SBSC V5.8 — Mobile Admin Review

Public V5.7 site preserved, including the current index.html/styles.css button sizing and hero art.

New:
- `/admin` mobile review page
- Supabase email/password admin login
- Pending submissions + private thermometer evidence photos
- Address geocoding before approval
- One-tap Approve / Reject
- Approve reuses/creates the bar, creates an approved reading, then marks submission approved

## One-time Supabase step
Run `supabase-admin-functions.sql` in Supabase SQL Editor.

## Deploy
Upload all files/folders to the repo root. Keep the `admin` folder intact.
After Vercel deploys, open `/admin/` on your site.
