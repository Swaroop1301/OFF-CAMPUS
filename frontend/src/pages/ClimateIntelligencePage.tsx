import { useState, useEffect, useCallback } from 'react'
import { Cloud, RefreshCw, AlertTriangle, Database, Calendar, CheckCircle2, Info } from 'lucide-react'
import { useScenarioStore } from '@/stores/appStore'

interface ClimateDataState {
  dataset_id?: string
  timestamps: string[]
  temperature: number[]
  humidity: number[]
  wind: number[]
  solar: number[]
  retrieved_at?: string
  records_count?: number
}

export default function ClimateIntelligencePage() {
  const { scenario } = useScenarioStore()
  const [dataSource, setDataSource] = useState<'live' | 'cached' | 'error' | 'idle'>('idle')
  const [data, setData] = useState<ClimateDataState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'24h' | '72h' | 'annual'>('72h')

  const fetchNasaClimate = useCallback(async (range = timeRange) => {
    setIsLoading(true)
    setErrorMessage(null)

    // Calculate dates based on range
    let start = '20240115'
    let end = '20240117'
    if (range === '24h') {
      start = '20240115'
      end = '20240115'
    } else if (range === 'annual') {
      start = '20230101'
      end = '20231231'
    }

    try {
      const lat = scenario.location.latitude
      const lon = scenario.location.longitude
      const params = 'T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN'
      const url = `/api/v1/climate/power?lat=${lat}&lon=${lon}&start=${start}&end=${end}&params=${params}`

      const res = await fetch(url)
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`NASA POWER Gateway Error (${res.status}): ${errorText || res.statusText}`)
      }

      const json = await res.json()

      // Set status based on backend response
      if (json.status === 'ERROR') {
        setDataSource('error')
        setErrorMessage(json.message || 'NASA POWER point API reported an error.')
        setData(null)
        return
      }

      setDataSource(json.status === 'CACHED' || json._cache?.hit ? 'cached' : 'live')

      // Parse canonical response arrays
      if (json.temperature_c && json.temperature_c.length > 0) {
        const n = json.temperature_c.length
        const timestamps = json.timestamps || Array.from({ length: n }, (_, h) => {
          const d = Math.floor(h / 24) + 1
          const hr = String(h % 24).padStart(2, '0')
          return range === 'annual' ? `Day ${d}` : `D${d} ${hr}:00`
        })

        setData({
          dataset_id: json.dataset_id,
          timestamps,
          temperature: json.temperature_c,
          humidity: json.relative_humidity || [],
          wind: json.wind_speed_ms || [],
          solar: json.solar_ghi || [],
          retrieved_at: json.retrieved_at,
          records_count: n,
        })
      } else if (json.properties?.parameter?.T2M) {
        // Raw NASA response parsing
        const p = json.properties.parameter
        const keys = Object.keys(p.T2M).sort()
        setData({
          timestamps: keys.map((k) => k.slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2')),
          temperature: keys.map((k) => p.T2M[k] ?? 0),
          humidity: keys.map((k) => p.RH2M?.[k] ?? 0),
          wind: keys.map((k) => p.WS10M?.[k] ?? 0),
          solar: keys.map((k) => p.ALLSKY_SFC_SW_DWN?.[k] ?? 0),
          records_count: keys.length,
        })
      } else {
        throw new Error('No meteorological observations returned for specified coordinates.')
      }
    } catch (err: any) {
      console.error('NASA POWER retrieval failed:', err)
      setDataSource('error')
      setErrorMessage(err.message || 'NASA POWER service unreachable. Verify coordinates and network.')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [scenario.location.latitude, scenario.location.longitude, timeRange])

  // Automatically query on initial mount or when scenario coordinates change
  useEffect(() => {
    fetchNasaClimate(timeRange)
  }, [fetchNasaClimate])

  function MiniChart({
    label,
    values,
    color,
    unit,
  }: {
    label: string
    values: number[]
    color: string
    unit: string
  }) {
    if (!values || values.length === 0) return null

    const yMin = Math.floor(Math.min(...values))
    const yMax = Math.ceil(Math.max(...values))
    const range = yMax - yMin || 1
    const w = 700, h = 130, pad = 50
    const count = values.length

    const points = values.map((v, i) => ({
      x: pad + (i / Math.max(count - 1, 1)) * (w - pad - 15),
      y: 12 + (1 - (v - yMin) / range) * (h - 26),
    }))
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const avg = values.reduce((a, b) => a + b, 0) / count

    return (
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h5 style={{ margin: 0, color, fontSize: '0.95rem' }}>{label}</h5>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              Range: {yMin}{unit} to {yMax}{unit}
            </span>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Avg: {avg.toFixed(1)}{unit}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
              ({count} pts)
            </span>
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '130px', overflow: 'visible' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={pad}
              y1={12 + f * (h - 26)}
              x2={w - 15}
              y2={12 + f * (h - 26)}
              stroke="var(--color-border-light)"
              strokeWidth="0.5"
            />
          ))}
          <path d={pathD} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <text x="5" y="16" fontSize="8" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMax.toFixed(0)}{unit}
          </text>
          <text x="5" y={h - 8} fontSize="8" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMin.toFixed(0)}{unit}
          </text>
          {count >= 24 && (
            <>
              <text x={pad} y={h + 4} fontSize="7.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
                0h
              </text>
              <text x={pad + (w - pad - 15) * 0.5} y={h + 4} fontSize="7.5" fill="var(--color-text-muted)" textAnchor="middle" fontFamily="var(--font-mono)">
                {Math.floor(count / 2)}h
              </text>
              <text x={w - 15} y={h + 4} fontSize="7.5" fill="var(--color-text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
                {count}h
              </text>
            </>
          )}
        </svg>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-climate" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Cloud size={14} /> NASA POWER Meteorological Gateway
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {scenario.location.latitude.toFixed(4)}°N, {scenario.location.longitude.toFixed(4)}°E
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Climate Intelligence
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Empirical solar radiation, temperature, wind, and humidity time-series for <strong>{scenario.location.name}</strong> ({scenario.location.elevation}m ASL, {scenario.location.climate_zone}).
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Time range selector */}
          <div style={{ display: 'flex', background: 'var(--color-bg-paper-warm)', borderRadius: 'var(--radius-sm)', padding: '0.2rem' }}>
            {(['24h', '72h', 'annual'] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setTimeRange(r)
                  fetchNasaClimate(r)
                }}
                disabled={isLoading}
                style={{
                  border: 'none',
                  background: timeRange === r ? 'var(--color-bg-card)' : 'transparent',
                  padding: '0.3rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: timeRange === r ? 600 : 400,
                  cursor: 'pointer',
                  color: timeRange === r ? 'var(--color-climate-700)' : 'var(--color-text-muted)',
                  boxShadow: timeRange === r ? 'var(--shadow-card)' : 'none',
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <button className="btn btn-climate" onClick={() => fetchNasaClimate(timeRange)} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-pulse-soft' : ''} />
            {isLoading ? 'Fetching NASA…' : 'Sync NASA POWER'}
          </button>
        </div>
      </div>

      {/* Real Data Source Status Banners */}
      {dataSource === 'live' && (
        <div className="banner banner-info" style={{ marginBottom: '1.25rem', background: 'var(--color-climate-50)', borderColor: 'var(--color-climate-400)' }}>
          <CheckCircle2 size={16} color="var(--color-climate-600)" style={{ flexShrink: 0 }} />
          <div>
            <strong>LIVE NASA POWER INGESTION</strong> — Hourly point data acquired directly from NASA Langley Research Center.
            {data?.dataset_id && <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>ID: {data.dataset_id}</span>}
          </div>
        </div>
      )}

      {dataSource === 'cached' && (
        <div className="banner banner-info" style={{ marginBottom: '1.25rem', background: 'var(--color-structure-50)', borderColor: 'var(--color-structure-400)' }}>
          <Database size={16} color="var(--color-structure-600)" style={{ flexShrink: 0 }} />
          <div>
            <strong>CACHED DATASET</strong> — Loaded verified meteorological cache from PostgreSQL / Object Storage for exact coordinates ({scenario.location.latitude.toFixed(2)}°, {scenario.location.longitude.toFixed(2)}°).
            {data?.retrieved_at && <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem' }}>Synced: {new Date(data.retrieved_at).toLocaleString()}</span>}
          </div>
        </div>
      )}

      {dataSource === 'error' && (
        <div className="banner banner-warning" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>CLIMATE SERVICE ERROR:</strong> {errorMessage}
            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
              No synthetic fallback substituted. Please check network connectivity to NASA POWER or try another coordinate.
            </div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem', textDecoration: 'underline' }} onClick={() => fetchNasaClimate(timeRange)}>
            Retry
          </button>
        </div>
      )}

      {/* Loading state skeleton */}
      {isLoading && !data && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <RefreshCw size={28} className="animate-pulse-soft" color="var(--color-climate-600)" style={{ marginBottom: '1rem' }} />
          <h5>Connecting to NASA POWER Meteorological API…</h5>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Retrieving global horizontal irradiance (GHI), surface air temperature (T2M), relative humidity, and 10m wind speeds.
          </p>
        </div>
      )}

      {/* Real Scientific Charts */}
      {data && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <MiniChart label="Dry-Bulb Ambient Temperature" values={data.temperature} color="var(--color-climate-600)" unit="°C" />
          <MiniChart label="Relative Humidity (RH2M)" values={data.humidity} color="var(--color-structure-500)" unit="%" />
          <MiniChart label="Wind Speed (10m Agl)" values={data.wind} color="var(--color-heat-600)" unit=" m/s" />
          <MiniChart label="All-Sky Global Horizontal Solar Irradiance (GHI)" values={data.solar} color="var(--color-solar-600)" unit=" W/m²" />
        </div>
      )}
    </div>
  )
}
