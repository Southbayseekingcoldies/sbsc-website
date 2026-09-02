module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "Google Places is not configured" });

  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(200).json({ suggestions: [] });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const center = Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: lat, longitude: lng }
    : { latitude: 33.78, longitude: -118.25 };

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["us"],
        languageCode: "en",
        regionCode: "US",
        locationBias: { circle: { center, radius: 50000 } }
      })
    });

    const body = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: body.error?.message || "Places lookup failed" });

    const suggestions = (body.suggestions || [])
      .map(s => s.placePrediction)
      .filter(Boolean)
      .slice(0, 8)
      .map(p => ({
        placeId: p.placeId,
        text: p.text?.text || "",
        mainText: p.structuredFormat?.mainText?.text || (p.text?.text || "").split(",")[0],
        secondaryText: p.structuredFormat?.secondaryText?.text || p.text?.text || ""
      }));

    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({ suggestions });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Places lookup failed" });
  }
};
