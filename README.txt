SBSC V6.4 — CONSOLIDATED FILTER + VENUE UX UPDATE

Replace these THREE root files:
- index.html
- styles.css
- app.js

This app.js includes V6.3 Smart Venue Search and V6.4 Certified Coldies wording.

Changes in this consolidated V6.4:
- MAX TEMP becomes RESULTS
- Results options: All verified readings / All certified Coldies ✅ / All verified fails ❌
- Venue suggestion dropdown is visually cleaned up
- Venue selection gets a subtle green check state
- Suggestions close immediately after selection
- Slow/stale search requests cannot reopen suggestions after a venue is selected
- Clicking outside or pressing Escape closes suggestions
- Typing again cleanly changes the selected venue
- Fixed the malformed V6.0 venue CSS append that contained literal \n characters
- Preserves 440px desktop hero and 160px mobile hero

No SQL or admin files are needed for this update.
