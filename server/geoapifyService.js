/**
 * Service to interact with the Geoapify Places API for B2C place and consumer discovery.
 */

// Category mapping helper between extracted business categories and Geoapify Places taxonomy
const GEOAPIFY_CATEGORY_MAP = {
  health: 'healthcare',
  cardiac: 'healthcare',
  hospital: 'healthcare.hospital',
  medical: 'healthcare',
  clinic: 'healthcare',
  coffee: 'catering.cafe,catering.restaurant',
  cafe: 'catering.cafe',
  retail: 'commercial.supermarket,commercial.clothing,commercial.shopping_mall',
  food: 'catering.restaurant,commercial.food_and_drink',
  fitness: 'sport.fitness,leisure.spa',
  wellness: 'healthcare.clinic,leisure.spa,sport.fitness',
  pet: 'commercial.pet,service',
  grooming: 'commercial.pet,service',
  automotive: 'service.vehicle,commercial.vehicle',
  education: 'education,education.school',
  hotel: 'accommodation.hotel'
}

/**
 * Determine the best Geoapify category string based on category, keywords, and description.
 */
function resolveGeoapifyCategories(profile) {
  const haystack = `${profile.category} ${profile.keywords?.join(' ') || ''} ${profile.target_consumer_segment || ''}`.toLowerCase()

  for (const [key, categoryString] of Object.entries(GEOAPIFY_CATEGORY_MAP)) {
    if (haystack.includes(key)) {
      return categoryString
    }
  }

  return 'commercial,service,healthcare'
}

/**
 * Normalizes a Geoapify Place feature into the standard common lead shape:
 * { id, name, type: "B2C", place_type, address, location, contact_if_available, website, phone, raw_data }
 */
function normalizeB2CLead(place, index, profile) {
  const props = place.properties || place

  const name =
    props.name ||
    props.address_line1 ||
    props.street ||
    `Local Entity ${index + 1}`

  const primaryCategory =
    props.categories?.[0]?.split('.')?.pop()?.replace(/_/g, ' ') ||
    profile.category ||
    'Local Facility'

  const place_type =
    primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1)

  const city = props.city || props.county || 'Metro Area'
  const state = props.state_code || props.state || ''
  const country = props.country || 'USA'
  const location = state ? `${city}, ${state}` : `${city}, ${country}`

  const address =
    props.formatted ||
    [props.address_line1, props.address_line2, city, state, props.postcode]
      .filter(Boolean)
      .join(', ') ||
    location

  const phone = props.contact?.phone || props.datasource?.raw?.phone || props.phone || null
  const email = props.contact?.email || props.datasource?.raw?.email || props.email || null
  const website = props.website || props.datasource?.raw?.website || null

  const contact_if_available = phone || email || website || 'In-person / Walk-in'

  const lat = props.lat || place.geometry?.coordinates?.[1]
  const lon = props.lon || place.geometry?.coordinates?.[0]
  const contactUrl = lat && lon
    ? `https://maps.google.com/?q=${lat},${lon}`
    : `https://maps.google.com/?q=${encodeURIComponent(`${name} ${location}`)}`

  return {
    id: `b2c-${Date.now()}-${index}`,
    name,
    type: 'B2C',
    place_type,
    company: name,
    address,
    location,
    contact_if_available,
    contactUrl,
    website,
    phone,
    email,
    emailSource: email ? 'Geoapify listing' : null,
    phoneSource: phone ? 'Geoapify listing' : null,
    contactSource: phone || email ? 'Geoapify listing' : null,
    contactConfidence: phone || email ? 'Listed by Geoapify' : null,
    contactStatus: phone || email ? 'Contact found' : 'No public contact found',
    raw_data: props
  }
}

/**
 * Executes Geoapify Places search.
 * Iterates across regional coordinates if geography is large.
 *
 * @param {object} profile - The structured B2C profile
 * @param {string} [apiKey] - Geoapify API key
 * @returns {Promise<{ leads: Array, isLiveGeoapify: boolean, count: number, notice?: string }>}
 */
export async function searchB2CLeads(profile, apiKey = process.env.GEOAPIFY_API_KEY) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEOAPIFY_API_KEY is required for live B2C discovery. Add it to your .env file.')
  }

  const profileText = `${profile.category || ''} ${profile.keywords?.join(' ') || ''} ${profile.target_consumer_segment || ''}`
  if (/agri|farm|crop|rural|farmer/i.test(profileText)) {
    return {
      leads: [],
      isLiveGeoapify: false,
      count: 0,
      notice: 'Geoapify indexes places, not individual farmers, and has no supported farm/farmer place category. B2C farmer discovery needs a farm directory or agricultural registry.'
    }
  }

  const cleanKey = apiKey.trim()
  const categories = resolveGeoapifyCategories(profile)
  const targetGeo = profile.geography || 'Austin, TX'

  try {
    console.log(`[GeoapifyService] Geocoding target area "${targetGeo}"...`)

    // Step 1: Geocode the target area to find latitude & longitude center
    const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(targetGeo)}&limit=3&apiKey=${cleanKey}`
    const geocodeRes = await fetch(geocodeUrl)
    
    if (!geocodeRes.ok) {
      throw new Error(`Geocoding HTTP error ${geocodeRes.status}: ${geocodeRes.statusText}`)
    }

    const geocodeData = await geocodeRes.json()
    const targetCenters = []

    if (geocodeData.features && geocodeData.features.length > 0) {
      // Collect up to 2 coordinates to support regional sub-region iteration
      for (const feat of geocodeData.features.slice(0, 2)) {
        const [lon, lat] = feat.geometry.coordinates
        targetCenters.push({ lat, lon, label: feat.properties.formatted })
      }
    } else {
      return {
        leads: [],
        isLiveGeoapify: true,
        count: 0,
        notice: `Geoapify could not resolve the requested geography: ${targetGeo}. No place search was run.`
      }
    }

    console.log(`[GeoapifyService] Querying places in categories "${categories}" across ${targetCenters.length} sub-region(s)...`)

    // Step 2: Query Places API across identified center(s)
    const collectedFeatures = []
    const placeSearchErrors = []
    let successfulPlaceSearches = 0

    for (const center of targetCenters) {
      const radiusMeters = 25000 // 25km radius circle
      const placesUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${center.lon},${center.lat},${radiusMeters}&bias=proximity:${center.lon},${center.lat}&limit=10&apiKey=${cleanKey}`

      const placesRes = await fetch(placesUrl)
      if (placesRes.ok) {
        successfulPlaceSearches++
        const placesData = await placesRes.json()
        if (placesData.features && placesData.features.length > 0) {
          collectedFeatures.push(...placesData.features)
        }
      } else {
        const errorData = await placesRes.json().catch(() => ({}))
        placeSearchErrors.push(
          `HTTP ${placesRes.status}: ${errorData.message || placesRes.statusText}`
        )
      }
    }

    if (collectedFeatures.length === 0) {
      if (successfulPlaceSearches === 0 && placeSearchErrors.length > 0) {
        return {
          leads: [],
          isLiveGeoapify: false,
          count: 0,
          notice: `Geoapify place search failed for categories "${categories}": ${placeSearchErrors.join('; ')}`
        }
      }

      return {
        leads: [],
        isLiveGeoapify: true,
        count: 0,
        notice: placeSearchErrors.length > 0
          ? `Geoapify returned zero places; some regional searches failed: ${placeSearchErrors.join('; ')}`
          : 'Geoapify returned zero places for this exact category and geography.'
      }
    }

    // Deduplicate by place ID / name
    const seenNames = new Set()
    const uniqueFeatures = []
    for (const f of collectedFeatures) {
      const placeName = f.properties?.name || f.properties?.address_line1
      if (placeName && !seenNames.has(placeName.toLowerCase())) {
        seenNames.add(placeName.toLowerCase())
        uniqueFeatures.push(f)
      }
    }

    const normalized = uniqueFeatures
      .slice(0, 20)
      .map((f, idx) => normalizeB2CLead(f, idx, profile))

    return {
      leads: normalized,
      isLiveGeoapify: true,
      count: normalized.length
    }
  } catch (error) {
    const message = error?.message || String(error)
    console.error('[GeoapifyService] Error calling Geoapify API:', message)
    return {
      leads: [],
      isLiveGeoapify: false,
      count: 0,
      notice: `Geoapify discovery is unavailable right now: ${message}`
    }
  }
}

