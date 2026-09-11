SBSC — venue merge + status naming update

UPLOAD ONLY app.js to the ROOT of the GitHub repo and replace the existing app.js.

What this changes:
1. Professional Beer Inspector readings and SBSC/patron readings are merged into ONE venue history when they refer to the same place.
   Matching priority:
   - Google Place ID when both records have it
   - normalized venue name + city/state
   - normalized address + city/state
   - same normalized venue name within ~0.08 mile

2. Multiple readings are NEVER deleted or superseded. One map marker represents the venue; the venue's best verified reading controls marker color/ranking, and every reading remains in its history.

3. Each history row shows its source, so PBI readings stay attributed separately from SBSC readings.

4. Status names are now used on cards, map popups, and the map legend:
   <=30°F  CERTIFIED ELITE COLDIE / Certified Elite Coldies
   31–35°F CERTIFIED COLDIE / Certified Coldies
   36–39°F FAIL / Fails
   40°F+   FAIL — CERTIFIED SOUP

5. PBI import timestamps are not presented as measurement times, because Cold Beer Tracker does not expose the original inspection date in the imported data.
