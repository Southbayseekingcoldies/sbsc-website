SBSC V6.0 — Fast submission UX

Replace ONLY these three files in the ROOT of the GitHub main branch:
- index.html
- styles.css
- app.js

No SQL changes are required. Existing submissions table columns are reused.

What changed:
- One location-first venue field instead of name/address/city/state.
- Nearby bars/restaurants suggested from device location.
- Selecting a venue auto-populates hidden bar/address/city/state details.
- Beer is a simple category dropdown.
- Temperature explicitly says to round to the nearest whole number.
- Measurement time is automatically set to now and hidden.
- Instagram handles are remembered on that device and offered as suggestions later.
- Public site/map behavior is otherwise preserved.
- Desktop hero is preserved at 440px; mobile remains 160px.
