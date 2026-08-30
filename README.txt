SBSC V6.4 — venue rescue patch

Replace ONLY the root app.js.

What changed:
- Fixes Trani's Dockside Station and J. Trani's Ristorante not appearing.
- Adds typo/alias matching for those venues even when OpenStreetMap has no POI record.
- Curated results show their real street addresses, not just "use my current location".
- On selection, the exact address is geocoded to a map coordinate.
- Keeps all existing V6.4 filters, Certified Coldies wording, smart search, and dropdown cleanup.
- Current-location fallback remains for genuinely unknown venues.

Known rescue entries included:
- Trani's Dockside Station — 311 E 22nd St, San Pedro
- J. Trani's Ristorante — 584 W 9th St, San Pedro
- The Majestic — 921 S Beacon St, San Pedro (Trani-family alias search)
