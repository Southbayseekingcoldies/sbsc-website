SBSC V7.0 FINAL — CONSOLIDATED RELEASE
======================================

THIS ZIP SUPERSEDES ALL POST-DOGZ V6.x PATCHES AND THE EARLIER V7.0 ZIP.
You can go straight to this package.

WHAT V7.0 INCLUDES
------------------
• Google Places venue autocomplete/search (primary venue source)
• DOGZ, Trani's, Shannon's/Legends and other post-DOGZ fixes carried forward
• Draft / Bottle selector (Draft default)
• Correct map ranking colors:
    BLUE  = <=30°F Elite
    GREEN = 31–35°F Coldie
    RED   = 36°F+ Fail
• Gold Submit a Coldie button
• Sort + Results above map; City above Verified Readings
• Larger desktop hero buttons while mobile sizing stays compact
• CERTIFIED COLDIES wording
• Admin Pending + Approved Entries editor
• Safe venue identity logic so fixing one reading does not silently rename old history
• Google Place ID stored for stable venue identity

NEW FINAL V7.0 LOCATION HISTORY / PHOTO FEATURES
------------------------------------------------
• Every approved submission remains its OWN reading. New readings NEVER replace
  older readings from the same venue.
• The map now shows ONE dot per venue instead of stacking multiple dots exactly
  on top of each other.
• The venue dot color is based on the BEST VERIFIED reading ever recorded there.
  Example: Shore Grille can start red, later earn a green Coldie, and its dot turns
  green while the original warm reading remains in its history.
• Clicking a venue dot shows:
    - Best verified temperature
    - Total verified reading count at that location
    - Up to 3 most recent approved thermometer photos
    - Full reading history (best result listed first)
• Individual approved readings remain separately counted and visible in the
  Verified Readings list.
• Approved Entries in Admin now show their evidence photo when available.
• The private submission-photo bucket STAYS private. V7.0 grants public access
  only to photos tied to APPROVED submissions, via short-lived signed URLs.

INSTALL — DO THIS IN ORDER
--------------------------
1. SUPABASE
   Open Supabase -> SQL Editor.
   Run the entire file:
       supabase-v7-0.sql

   The SQL is designed to be safe to run if you already ran an earlier V7.0
   draft. It uses IF NOT EXISTS / CREATE OR REPLACE where appropriate.

2. GOOGLE CLOUD / PLACES
   In Google Cloud Console:
   • Enable Places API (New)
   • Create a Google Maps Platform API key
   • Restrict the key appropriately for your project/account

3. VERCEL ENVIRONMENT VARIABLE
   In the SBSC Vercel project, add:
       GOOGLE_MAPS_API_KEY = your Google Maps Platform key

   Keep this value in Vercel. Do NOT paste the secret key into app.js.

4. UPLOAD / REPLACE THESE FILES AT THE SAME PATHS
   /index.html
   /styles.css
   /app.js
   /admin/index.html
   /admin/admin.css
   /admin/admin.js
   /api/places-autocomplete.js
   /api/place-details.js

5. REDEPLOY VERCEL
   Make sure the deployment includes the new environment variable.

6. TEST
   A. Venue lookup:
      Search DOGZ, Quinn's Pub & Grill, Trani's Dockside, etc.
   B. Submit a reading with a thermometer photo.
   C. Approve it in /admin/.
   D. Open the public map and tap the venue dot.
   E. Confirm photo + history appear.
   F. Approve a SECOND reading for the same venue.
   G. Confirm both readings remain visible and the map uses the colder/best
      reading for the venue's dot color.
   H. Use Admin -> Approved Entries to edit/correct an existing reading.

DATA NOTE
---------
Older readings that were approved before the submission-photo workflow existed
may have no photo to show. V7.0 performs a conservative backfill when it can
uniquely match an approved submission to an existing reading. It intentionally
leaves ambiguous old records alone rather than attach the wrong photo.

VISIBLE MAP
-----------
The public map remains Leaflet/OpenStreetMap. Google Places is used for venue
SEARCH and identity. This keeps the current SBSC map look while giving the
submission/admin venue picker a much stronger business database.
