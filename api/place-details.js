function component(components, type, preferShort = false) {
  const item = (components || []).find(c => (c.types || []).includes(type));
  if (!item) return "";
  return preferShort ? (item.shortText || item.longText || "") : (item.longText || item.shortText || "");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "Google Places is not configured" });

  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing place id" });

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents,primaryType"
      }
    });
    const place = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: place.error?.message || "Place details failed" });

    const components = place.addressComponents || [];
    const streetNumber = component(components, "street_number");
    const route = component(components, "route");
    const address = [streetNumber, route].filter(Boolean).join(" ") || place.formattedAddress || "";
    const city = component(components, "locality") || component(components, "postal_town") || component(components, "sublocality");
    const state = component(components, "administrative_area_level_1", true) || "CA";

    return res.status(200).json({
      placeId: place.id,
      name: place.displayName?.text || "",
      formattedAddress: place.formattedAddress || "",
      address,
      city,
      state,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      primaryType: place.primaryType || ""
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Place details failed" });
  }
};
