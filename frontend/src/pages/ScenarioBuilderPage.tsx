import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScenarioStore } from '@/stores/appStore'
import { MapPin, Info, ArrowRight } from 'lucide-react'
import LocationMap from '@/components/LocationMap'

const CITY_PRESETS = [
  { name: 'Leh, Ladakh', lat: 34.15, lon: 77.58, elev: 3500, zone: 'Cold Desert', preset: 'leh' },
  { name: 'Jaisalmer, Rajasthan', lat: 26.92, lon: 70.90, elev: 225, zone: 'Hot Arid', preset: 'jaisalmer' },
  { name: 'Shimla, HP', lat: 31.10, lon: 77.17, elev: 2276, zone: 'Temperate', preset: 'shimla' },
  { name: 'Chennai, TN', lat: 13.08, lon: 80.27, elev: 6, zone: 'Warm Humid', preset: 'chennai' },
  { name: 'Srinagar, J&K', lat: 34.08, lon: 74.80, elev: 1585, zone: 'Cold', preset: 'srinagar' },
]

function UnitInput({ label, value, unit, onChange, min, max, step = 1 }: {
  label: string; value: number; unit: string; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      <div className="input-unit">
        <input
          className="input"
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          style={{ fontFamily: 'var(--font-mono)', paddingRight: '3.5rem' }}
        />
        <span className="unit-suffix">{unit}</span>
      </div>
    </div>
  )
}

export default function ScenarioBuilderPage() {
  const { scenario, updateLocation, applyPreset } = useScenarioStore()
  const navigate = useNavigate()
  const [presetBanner, setPresetBanner] = useState<string | null>(null)

  const [validationError, setValidationError] = useState<string | null>(null)

  const handleCitySelect = (city: typeof CITY_PRESETS[0]) => {
    updateLocation({ name: city.name, latitude: city.lat, longitude: city.lon, elevation: city.elev, climate_zone: city.zone })
    if (city.preset === 'leh' || city.preset === 'jaisalmer') {
      applyPreset(city.preset)
      setPresetBanner(`Defaults adjusted for ${city.name}'s ${city.zone.toLowerCase()} climate — edit any field to override.`)
    }
  }

  const handleSaveAndNext = () => {
    setValidationError(null)
    const { latitude, longitude, elevation } = scenario.location
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      setValidationError('Latitude must be between -90° and +90°.')
      return
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      setValidationError('Longitude must be between -180° and +180°.')
      return
    }
    if (isNaN(elevation) || elevation < 0 || elevation > 9000) {
      setValidationError('Elevation must be a positive value up to 9000m.')
      return
    }
    navigate(`/scenario/${scenario.id}/climate`)
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Site & Location</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Define the geographical location for accurate solar and meteorological analysis
      </p>

      {/* Preset banner */}
      {presetBanner && (
        <div className="banner banner-info" style={{ marginBottom: '1rem' }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{presetBanner}</span>
          <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.75rem' }} onClick={() => setPresetBanner(null)}>Dismiss</button>
        </div>
      )}

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Left: Input forms */}
        <div className="card" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <h5 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={16} color="var(--color-climate-600)" />
            Location Details
          </h5>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Select Location
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
              {CITY_PRESETS.map((city) => (
                <button
                  key={city.name}
                  onClick={() => handleCitySelect(city)}
                  className={scenario.location.name === city.name ? 'btn btn-climate' : 'btn btn-outline'}
                  style={{ justifyContent: 'space-between', padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  <span>{city.name}</span>
                  <span className="chip" style={{ background: scenario.location.name === city.name ? 'rgba(255,255,255,0.2)' : 'var(--color-bg-paper-warm)', fontSize: '0.5625rem' }}>
                    {city.zone}
                  </span>
                </button>
              ))}
            </div>
            
            <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Coordinates
              </label>
              <UnitInput label="Latitude" value={scenario.location.latitude} unit="°N" onChange={(v) => updateLocation({ latitude: v })} min={-90} max={90} step={0.01} />
              <UnitInput label="Longitude" value={scenario.location.longitude} unit="°E" onChange={(v) => updateLocation({ longitude: v })} min={-180} max={180} step={0.01} />
              <UnitInput label="Elevation" value={scenario.location.elevation} unit="m" onChange={(v) => updateLocation({ elevation: v, elevation_source: 'user' })} min={0} max={9000} />
            </div>
          </div>

          {/* Nav buttons */}
          {validationError && (
            <div className="banner banner-warning" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
              {validationError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
            <button className="btn btn-primary" onClick={handleSaveAndNext}>
              Next: Climate Data <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Center: Interactive Location Map */}
        <div className="card" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
          <h5 style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Interactive Geolocation Engine</span>
            <span className="badge badge-climate" style={{ fontSize: '0.7rem' }}>
              OpenFreeMap Vector Cartography
            </span>
          </h5>

          <LocationMap height="460px" />
        </div>
      </div>
    </div>
  )
}
