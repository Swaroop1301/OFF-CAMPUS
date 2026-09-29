import { useEffect, useRef, useState, useCallback } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { 
  Search, 
  MapPin, 
  Navigation, 
  Mountain, 
  RotateCcw, 
  AlertTriangle, 
  Layers, 
  Globe2, 
  ExternalLink 
} from 'lucide-react'
import { useScenarioStore } from '@/stores/appStore'

interface SearchResult {
  name: string
  latitude: number
  longitude: number
  country: string
  region: string
  elevation?: number
  climate_zone?: string
}

// Available styles directly hosted by OpenFreeMap (https://openfreemap.org/)
const OPENFREEMAP_STYLES = [
  { id: 'liberty', name: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty', pitch: 0 },
  { id: 'positron', name: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron', pitch: 0 },
  { id: 'bright', name: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright', pitch: 0 },
  { id: 'dark', name: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark', pitch: 0 },
  { id: 'fiord', name: 'Fiord', url: 'https://tiles.openfreemap.org/styles/fiord', pitch: 0 },
]

const QUICK_PRESETS = [
  { name: 'Leh (Ladakh)', lat: 34.1526, lon: 77.5771, elev: 3500, zone: 'Cold Desert' },
  { name: 'Shimla (HP)', lat: 31.1048, lon: 77.1734, elev: 2276, zone: 'Cold & Cloudy' },
  { name: 'Srinagar (J&K)', lat: 34.0837, lon: 74.7973, elev: 1585, zone: 'Composite' },
  { name: 'Jaisalmer (RJ)', lat: 26.9157, lon: 70.9083, elev: 225, zone: 'Hot & Dry' },
]

export default function LocationMap({ height = '460px' }: { height?: string }) {
  const { scenario, updateLocation } = useScenarioStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)

  const [activeStyle, setActiveStyle] = useState<string>('liberty')
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
        name: preferredName || data.name || `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
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

  // Initialize MapLibre GL map powered by OpenFreeMap vector styles
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const initialLat = latitude || 34.1526
    const initialLon = longitude || 77.5771

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [initialLon, initialLat],
      zoom: 9.5,
      pitch: 0,
      attributionControl: false,
    })

    // Add navigation controls (zoom, compass, pitch reset)
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    // Create interactive draggable marker
    const marker = new maplibregl.Marker({
      draggable: true,
      color: '#c0392b',
    })
      .setLngLat([initialLon, initialLat])
      .addTo(map)

    const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
      .setHTML(`<div style="font-size: 11px; font-weight: 600;">${name || 'Site Location'}</div><div style="font-size: 10px; font-family: monospace;">${initialLat.toFixed(4)}°N, ${initialLon.toFixed(4)}°E</div>`)

    marker.setPopup(popup)

    // Handle marker drag
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat()
      const cleanLat = parseFloat(lngLat.lat.toFixed(4))
      const cleanLon = parseFloat(lngLat.lng.toFixed(4))
      map.panTo([cleanLon, cleanLat])
      fetchLocationContext(cleanLat, cleanLon)
    })

    // Handle map click
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      const cleanLat = parseFloat(lat.toFixed(4))
      const cleanLon = parseFloat(lng.toFixed(4))
      marker.setLngLat([cleanLon, cleanLat])
      map.panTo([cleanLon, cleanLat])
      fetchLocationContext(cleanLat, cleanLon)
    })

    mapInstanceRef.current = map
    markerRef.current = marker

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
    }
  }, []) // Mount once

  // Synchronize map & marker position when external store coordinates change
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const curPos = markerRef.current.getLngLat()
      if (Math.abs(curPos.lat - latitude) > 0.001 || Math.abs(curPos.lng - longitude) > 0.001) {
        markerRef.current.setLngLat([longitude, latitude])
        mapInstanceRef.current.flyTo({
          center: [longitude, latitude],
          zoom: Math.max(mapInstanceRef.current.getZoom(), 8.5),
          duration: 1200,
        })
        const popup = markerRef.current.getPopup()
        if (popup) {
          popup.setHTML(`<div style="font-size: 11px; font-weight: 600;">${name || 'Site Location'}</div><div style="font-size: 10px; font-family: monospace;">${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E</div>`)
        }
      }
    }
  }, [latitude, longitude, name])

  // Style switcher
  const handleStyleChange = (style: typeof OPENFREEMAP_STYLES[number]) => {
    setActiveStyle(style.id)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setStyle(style.url)
      if (style.pitch > 0) {
        mapInstanceRef.current.easeTo({ pitch: style.pitch, duration: 800 })
      } else {
        mapInstanceRef.current.easeTo({ pitch: 0, duration: 800 })
      }
    }
  }

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
      mapInstanceRef.current.flyTo({
        center: [item.longitude, item.latitude],
        zoom: 11,
        duration: 1200,
      })
      markerRef.current.setLngLat([item.longitude, item.latitude])
    }
    fetchLocationContext(item.latitude, item.longitude, item.name)
  }

  // Apply a quick preset
  const handleApplyPreset = (p: typeof QUICK_PRESETS[number]) => {
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.flyTo({
        center: [p.lon, p.lat],
        zoom: 9.5,
        duration: 1000,
      })
      markerRef.current.setLngLat([p.lon, p.lat])
    }
    fetchLocationContext(p.lat, p.lon, p.name)
  }

  const isValidCoord = latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {/* Search Header Bar & Style Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
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
              placeholder="Search site location (e.g. Leh, Shimla, Srinagar, Jaisalmer)..."
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

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => handleApplyPreset(QUICK_PRESETS[0])}
            title="Reset to Leh reference site"
            style={{ padding: '0.45rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>

        {/* OpenFreeMap Style Switcher & Quick Climate Presets Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem' }}>
          {/* Style Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, marginRight: '0.2rem' }}>
              <Layers size={13} /> Style:
            </span>
            {OPENFREEMAP_STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => handleStyleChange(st)}
                style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  border: activeStyle === st.id ? '1px solid var(--color-climate-600)' : '1px solid var(--color-border)',
                  background: activeStyle === st.id ? 'var(--color-climate-50)' : 'var(--color-bg-paper)',
                  color: activeStyle === st.id ? 'var(--color-climate-700)' : 'var(--color-text-secondary)',
                  fontWeight: activeStyle === st.id ? 700 : 500,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {st.name}
              </button>
            ))}
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>Presets:</span>
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => handleApplyPreset(p)}
                style={{
                  padding: '0.15rem 0.45rem',
                  borderRadius: '3px',
                  border: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                }}
              >
                {p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
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
            zIndex: 10,
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
            <MapPin size={12} color="var(--color-heat-600)" />
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

        {/* OpenFreeMap Attribution Stamp */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            right: '0',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.85)',
            padding: '2px 8px',
            fontSize: '9.5px',
            fontFamily: 'sans-serif',
            color: '#444',
            borderTopLeftRadius: '4px',
            border: '1px solid #e0e0e0',
          }}
        >
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer" style={{ color: '#006699', fontWeight: 600, textDecoration: 'none' }}>
            OpenFreeMap
          </a>
          {' · '}
          <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer" style={{ color: '#555', textDecoration: 'none' }}>
            © OpenMapTiles
          </a>
          {' · '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: '#555', textDecoration: 'none' }}>
            © OpenStreetMap
          </a>
        </div>

        {lookupLoading && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              zIndex: 10,
              background: 'rgba(255, 255, 255, 0.94)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.65rem',
              fontSize: '0.72rem',
              color: 'var(--color-climate-700)',
              fontWeight: 500,
              boxShadow: 'var(--shadow-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            Fetching site elevation & climate zone…
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
