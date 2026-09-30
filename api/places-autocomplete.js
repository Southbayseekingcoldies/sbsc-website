module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "GOOGLE_MAPS_API_KEY is missing in Vercel" });
  }

  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    return res.status(200).json({ suggestions: [] });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const center = hasLocation ? { latitude: lat, longitude: lng } : null;

  const normalize = (value = "") =>
    String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const nameScore = (query, name) => {
    const nq = normalize(query);
    const nn = normalize(name);
    if (!nq || !nn) return 0;
    if (nq === nn) return 100;
    if (nq.startsWith(nn) || nn.startsWith(nq)) return 92;
    if (nq.includes(nn) || nn.includes(nq)) return 86;

    // Let "The Deck Hermosa" strongly match a place actually named "The Deck".
    const qTokens = nq.split(" ").filter(Boolean);
    const nTokens = nn.split(" ").filter(Boolean);
    const shared = nTokens.filter(token => qTokens.includes(token)).length;
    return nTokens.length ? Math.round((shared / nTokens.length) * 80) : 0;
  };

  async function fetchAutocomplete() {
    const fieldMask = [
      "suggestions.placePrediction.placeId",
      "suggestions.placePrediction.text.text",
      "suggestions.placePrediction.structuredFormat.mainText.text",
      "suggestions.placePrediction.structuredFormat.secondaryText.text",
      "suggestions.placePrediction.distanceMeters"
    ].join(",");

    const requestBody = {
      input: q,
      includedRegionCodes: ["us"],
      languageCode: "en",
      regionCode: "US"
    };

    // Bias nearby; do NOT restrict. Worldwide results remain valid.
    if (hasLocation) {
      requestBody.locationBias = {
        circle: {
          center,
          radius: 50000
        }
      };
      requestBody.origin = center;
    }

    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `Autocomplete HTTP ${response.status}`);
    }

    return (body.suggestions || [])
      .map(item => item.placePrediction)
      .filter(Boolean)
      .map(p => ({
        placeId: p.placeId,
        text: p.text?.text || "",
        mainText: p.structuredFormat?.mainText?.text || p.text?.text || "",
        secondaryText: p.structuredFormat?.secondaryText?.text || p.text?.text || "",
        distanceMeters: Number.isFinite(Number(p.distanceMeters)) ? Number(p.distanceMeters) : null,
        source: "autocomplete"
      }))
      .filter(p => p.placeId && p.mainText);
  }

  async function fetchTextSearch() {
    const requestBody = {
      textQuery: q,
      languageCode: "en",
      regionCode: "US",
      pageSize: 10
    };

    // Same idea here: preference, never a wall. If the user types a location
    // explicitly ("The Deck Portland"), Google can override this bias.
    if (hasLocation) {
      requestBody.locationBias = {
        circle: {
          center,
          radius: 50000
        }
      };
    }

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location"
        ].join(",")
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `Text Search HTTP ${response.status}`);
    }

    return (body.places || [])
      .map(place => ({
        placeId: place.id,
        text: [place.displayName?.text, place.formattedAddress].filter(Boolean).join(", "),
        mainText: place.displayName?.text || "",
        secondaryText: place.formattedAddress || "",
        lat: Number(place.location?.latitude),
        lng: Number(place.location?.longitude),
        source: "text-search"
      }))
      .filter(p => p.placeId && p.mainText);
  }

  try {
    // Run both. Autocomplete is good for live typing; Text Search is much better
    // at established business names that autocomplete sometimes fails to surface.
    const [autocompleteResult, textSearchResult] = await Promise.allSettled([
      fetchAutocomplete(),
      fetchTextSearch()
    ]);

    const autocomplete = autocompleteResult.status === "fulfilled" ? autocompleteResult.value : [];
    const textSearch = textSearchResult.status === "fulfilled" ? textSearchResult.value : [];

    if (autocompleteResult.status === "rejected") {
      console.warn("Google Autocomplete failed:", autocompleteResult.reason?.message || autocompleteResult.reason);
    }
    if (textSearchResult.status === "rejected") {
      console.warn("Google Text Search failed:", textSearchResult.reason?.message || textSearchResult.reason);
    }

    if (!autocomplete.length && !textSearch.length &&
        autocompleteResult.status === "rejected" &&
        textSearchResult.status === "rejected") {
      return res.status(502).json({ error: "Google Places search failed" });
    }

    const byId = new Map();

    // Text Search goes in first because it is stronger for explicit business names.
    for (const item of [...textSearch, ...autocomplete]) {
      if (!byId.has(item.placeId)) {
        byId.set(item.placeId, item);
      } else {
        const existing = byId.get(item.placeId);
        byId.set(item.placeId, {
          ...existing,
          ...item,
          mainText: existing.mainText || item.mainText,
          secondaryText: existing.secondaryText || item.secondaryText,
          text: existing.text || item.text,
          source: `${existing.source}+${item.source}`
        });
      }
    }

    const suggestions = [...byId.values()]
      .map((item, index) => {
        const relevance = nameScore(q, item.mainText);
        let proximityBonus = 0;

        if (hasLocation && Number.isFinite(item.distanceMeters)) {
          // Nearby is preferred, but never required.
          const miles = item.distanceMeters / 1609.344;
          proximityBonus = Math.max(0, 20 - Math.min(miles, 20));
        }

        // Text Search gets a modest boost because it handles exact establishment
        // names such as "The Deck" better than autocomplete.
        const textSearchBonus = item.source.includes("text-search") ? 18 : 0;

        return {
          ...item,
          _score: relevance + proximityBonus + textSearchBonus - index * 0.01
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, ...item }) => item);

    return res.status(200).json({
      suggestions,
      diagnostics: {
        autocompleteCount: autocomplete.length,
        textSearchCount: textSearch.length
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Places lookup failed" });
  }
};
