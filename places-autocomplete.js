module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "GOOGLE_MAPS_API_KEY is missing in Vercel" });

  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(200).json({ suggestions: [] });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const center = Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: lat, longitude: lng }
    : { latitude: 33.78, longitude: -118.19 };

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "suggestions.placePrediction.placeId",
          "suggestions.placePrediction.text.text",
          "suggestions.placePrediction.structuredFormat.mainText.text",
          "suggestions.placePrediction.structuredFormat.secondaryText.text"
        ].join(",")
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["us"],
        languageCode: "en",
        regionCode: "US",
        locationBias: { circle: { center, radius: 60000 } }
      })
    });

    const body = await response.json().catch(()=>({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: body?.error?.message || body?.message || `Google Places returned HTTP ${response.status}`
      });
    }

    const suggestions = (body.suggestions || [])
      .map(s => s.placePrediction)
      .filter(Boolean)
      .slice(0, 8)
      .map(p => ({
        placeId: p.placeId,
        text: p.text?.text || "",
        mainText: p.structuredFormat?.mainText?.text || p.text?.text || "",
        secondaryText: p.structuredFormat?.secondaryText?.text || p.text?.text || ""
      }))
      .filter(p => p.placeId && p.mainText);

    return res.status(200).json({ suggestions });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Places lookup failed" });
  }
};