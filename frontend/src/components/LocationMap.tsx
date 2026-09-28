import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, MapPin, Navigation, Mountain, Compass, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useScenarioStore } from '@/stores/appStore'

// Fix Leaflet marker icons in Vite/bundler environments
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface SearchResult {
  name: string
  latitude: number
  longitude: number
  country: string
  region: string
  elevation?: number
  climate_zone?: string
}

export default function LocationMap({ height = '380px' }: { height?: string }) {
  const { scenario, updateLocation } = useScenarioStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const { latitude, longitude, elevation, climate_zone, name } = scenario.location

  // Fetch contextual metadata (reverse geocode + elevation + climate zone) from backend
  const fetchLocationContext = useCallback(async (lat: number, lon: number, preferredName?: string) => {
    setLookupLoading(true)
    setLookupError(null)
    try {
      const res = await fetch(`/api/v1/locations/context?lat=${lat}&lon=${lon}`)
      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const data = await res.json()

      updateLocation({
        name: preferredName || data.name || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        latitude: data.latitude,
        longitude: data.longitude,
        elevation: data.elevation_m,
        climate_zone: data.climate_zone,
        city: data.city,
        district: data.district,
        state: data.state,
        country: data.country,
        timezone: data.timezone,
        elevation_source: data.elevation_source || 'provider',
      })
    } catch (err: any) {
      console.warn('Location context lookup warning:', err)
      setLookupError('Could not fetch reverse geocoding. Coordinates set manually.')
    } finally {
      setLookupLoading(false)
    }
  }, [updateLocation])

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const initialLat = latitude || 34.15
    const initialLon = longitude || 77.58

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 9,
      zoomControl: true,
      attributionControl: false,
    })

    // CartoDB Positron / OSM tiles for crisp, scientific look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    // Custom draggable marker
    const marker = L.marker([initialLat, initialLon], {
      draggable: true,
      autoPan: true,
    }).addTo(map)

    marker.bindPopup(`<strong>${name}</strong><br/>${initialLat.toFixed(4)}°N, ${initialLon.toFixed(4)}°E`)

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      map.panTo(pos)
      fetchLocationContext(parseFloat(pos.lat.toFixed(4)), parseFloat(pos.lng.toFixed(4)))
    })

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      const cleanLat = parseFloat(lat.toFixed(4))
      const cleanLon = parseFloat(lng.toFixed(4))
      marker.setLatLng([cleanLat, cleanLon])
      map.panTo([cleanLat, cleanLon])
      fetchLocationContext(cleanLat, cleanLon)
    })

    mapInstanceRef.current = map
    markerRef.current = marker

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
    }
  }, []) // mount once

  // Synchronize map & marker position when external store coordinates change
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const curPos = markerRef.current.getLatLng()
      if (Math.abs(curPos.lat - latitude) > 0.001 || Math.abs(curPos.lng - longitude) > 0.001) {
        markerRef.current.setLatLng([latitude, longitude])
        mapInstanceRef.current.flyTo([latitude, longitude], Math.max(mapInstanceRef.current.getZoom(), 8), {
          duration: 1.2,
        })
        markerRef.current.setPopupContent(`<strong>${name}</strong><br/>${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`)
      }
    }
  }, [latitude, longitude, name])

  // Search input debouncer
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/v1/locations/search?q=${encodeURIComponent(searchQuery)}`)
        if (res.ok) {
          const list = await res.json()
          setSuggestions(list)
          setShowDropdown(list.length > 0)
        }
      } catch (e) {
        console.error('Location search error:', e)
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Select location suggestion
  const handleSelectSuggestion = (item: SearchResult) => {
    setSearchQuery(item.name)
    setShowDropdown(false)
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.flyTo([item.latitude, item.longitude], 11, { duration: 1.2 })
      markerRef.current.setLatLng([item.latitude, item.longitude])
    }
    fetchLocationContext(item.latitude, item.longitude, item.name)
  }

  // Reset to default
  const handleResetLocation = () => {
    const leh = { lat: 34.15, lon: 77.58, name: 'Leh, Ladakh', elev: 3500, zone: 'Cold Desert' }
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.flyTo([leh.lat, leh.lon], 9, { duration: 1 })
      markerRef.current.setLatLng([leh.lat, leh.lon])
    }
    fetchLocationContext(leh.lat, leh.lon, leh.name)
  }

  const isValidCoord = latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {/* Search Header Bar */}
      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="input"
              placeholder="Search site location (e.g. Leh, Jaisalmer, Shimla, Manali)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              style={{ paddingLeft: '2.25rem', width: '100%', fontSize: '0.85rem' }}
            />
            {isSearching && (
              <span
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                searching…
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleResetLocation}
            title="Reset to default reference site"
            style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>

        {/* Search Suggestions Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              marginTop: '4px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-elevated)',
              maxHeight: '240px',
              overflowY: 'auto',
            }}
          >
            {suggestions.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                onClick={() => handleSelectSuggestion(item)}
                style={{
                  padding: '0.625rem 0.875rem',
                  cursor: 'pointer',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8125rem',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-paper-warm)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {item.region ? `${item.region}, ` : ''}{item.country} · {item.latitude.toFixed(2)}°N, {item.longitude.toFixed(2)}°E
                  </div>
                </div>
                {item.elevation !== undefined && (
                  <span className="chip" style={{ fontSize: '0.6875rem', background: 'var(--color-climate-50)', color: 'var(--color-climate-700)' }}>
                    {item.elevation} m
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map View */}
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          height,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Live Coordinate Overlay HUD */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 500,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(4px)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.35rem 0.65rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--color-text-primary)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <MapPin size={12} color="var(--color-climate-600)" />
            {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Mountain size={12} color="var(--color-structure-600)" />
            {elevation}m
          </span>
          <span className="chip" style={{ fontSize: '0.625rem', padding: '0.1rem 0.4rem', background: 'var(--color-solar-50)', color: 'var(--color-solar-700)' }}>
            {climate_zone}
          </span>
        </div>

        {lookupLoading && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              zIndex: 500,
              background: 'rgba(255, 255, 255, 0.92)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.72rem',
              color: 'var(--color-climate-700)',
              fontWeight: 500,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            Fetching site elevation & climate…
          </div>
        )}
      </div>

      {/* Coordinate & Geocoding Details Metadata Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.5rem',
          background: 'var(--color-bg-paper-warm)',
          padding: '0.75rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border-light)',
          fontSize: '0.75rem',
        }}
      >
        <div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>Locality</div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {scenario.location.city || scenario.location.name || 'Unknown'}
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>State / Country</div>
          <div style={{ fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[scenario.location.state, scenario.location.country].filter(Boolean).join(', ') || 'India'}
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>Elevation</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-structure-700)' }}>
            {elevation} m <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>({scenario.location.elevation_source || 'provider'})</span>
          </div>
        </div>

        <div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>Climate Classification</div>
          <div style={{ fontWeight: 600, color: 'var(--color-climate-700)' }}>
            {climate_zone}
          </div>
        </div>
      </div>

      {!isValidCoord && (
        <div className="banner banner-warning" style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}>
          <AlertTriangle size={14} /> Coordinates out of valid range (-90 to 90° lat, -180 to 180° lon).
        </div>
      )}
    </div>
  )
}
