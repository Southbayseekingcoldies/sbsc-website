SBSC V6.2 — MAP FIX

Do this in order:

1. Supabase SQL Editor
   Run: supabase-v6-2-map-fix.sql

2. GitHub root
   Replace: app.js

3. GitHub admin folder
   Replace: admin/admin.js

Do NOT replace index.html, CSS, favicon files, or any artwork.

What this fixes:
- Repairs Niko's 0,0 / Africa pin.
- Corrects The Sardine and The Basque Club Taberna existing pins.
- Fixes the null-coordinate bug permanently.
- Rejects impossible/out-of-South-Bay coordinates.
- Keeps later approvals from moving an already-established bar pin.
- Refreshes the public readings automatically when you return to the site after approving a submission.
