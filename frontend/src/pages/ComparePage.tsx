import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  ArrowRight, 
  CheckCircle2, 
  TrendingDown, 
  TrendingUp, 
  Layers, 
  ShieldCheck, 
  Zap, 
  DollarSign, 
  Thermometer, 
  Award,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Play,
  Cpu,
  FileCheck
} from 'lucide-react'
import { useScenarioStore, useSimulationStore } from '@/stores/appStore'

interface AnsysStatus {
  status: 'CONNECTED' | 'BUSY' | 'OFFLINE' | 'UNAVAILABLE'
  mode: string
  product_version?: string
  install_path?: string
  active_job_id?: string
  worker_host?: string
}

interface AnsysComparisonData {
  job_id: string
  metrics: {
    mae: number
    rmse: number
    mbe: number
    r_squared: number
    max_abs_error: number
    pct_error: number
  }
  timestamps: string[]
  physics_temp_c: number[]
  ansys_temp_c: number[]
  residuals_c: number[]
  physics_heat_flux_w?: number[]
  ansys_heat_flux_w?: number[]
}

export default function ComparePage() {
  const { scenario } = useScenarioStore()
  const { results: physicsResults } = useSimulationStore()

  // ANSYS status & comparison state
  const [ansysStatus, setAnsysStatus] = useState<AnsysStatus | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [isDispatching, setIsDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [comparison, setComparison] = useState<AnsysComparisonData | null>(null)
  const [isLoadingCompare, setIsLoadingCompare] = useState(false)

  // Query ANSYS Environment & Worker Status
  const checkAnsysStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ansys/status')
      if (res.ok) {
        const data = await res.json()
        setAnsysStatus(data)
        if (data.active_job_id) {
          setActiveJobId(data.active_job_id)
        }
      } else {
        setAnsysStatus({ status: 'UNAVAILABLE', mode: 'none' })
      }
    } catch {
      setAnsysStatus({ status: 'UNAVAILABLE', mode: 'none' })
    }
  }, [])

  useEffect(() => {
    checkAnsysStatus()
  }, [checkAnsysStatus])

  // Poll for comparison if job ID exists
  const fetchComparison = useCallback(async (jobId: string) => {
    setIsLoadingCompare(true)
    try {
      const res = await fetch(`/api/v1/ansys/jobs/${jobId}/compare`)
      if (res.ok) {
        const data = await res.json()
        setComparison(data)
      }
    } catch (e) {
      console.warn('Could not fetch ANSYS comparison yet:', e)
    } finally {
      setIsLoadingCompare(false)
    }
  }, [])

  const handleLaunchAnsys = async () => {
    setIsDispatching(true)
    setDispatchError(null)

    if (ansysStatus?.status === 'UNAVAILABLE' || ansysStatus?.status === 'OFFLINE') {
      setDispatchError('ANSYS execution unavailable. Configure an ANSYS Fluent worker.')
      setIsDispatching(false)
      return
    }

    try {
      const payload = {
        scenario_id: scenario.id,
        geometry: scenario.geometry,
        envelope: scenario.envelope,
        operating: scenario.operating,
        location: scenario.location,
        simulation_hours: 72,
        timestep_s: 3600,
      }

      const res = await fetch('/api/v1/ansys/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        const msg = errJson?.detail || 'ANSYS execution unavailable. Configure an ANSYS Fluent worker.'
        throw new Error(msg)
      }

      const jobData = await res.json()
      setActiveJobId(jobData.job_id)
      fetchComparison(jobData.job_id)
    } catch (err: any) {
      setDispatchError(err.message || 'ANSYS execution unavailable. Configure an ANSYS Fluent worker.')
    } finally {
      setIsDispatching(false)
    }
  }

  // Dual temperature & residual curves plotter
  function DualCurvesChart({ comp }: { comp: AnsysComparisonData }) {
    const pts = comp.physics_temp_c.length
    const all = [...comp.physics_temp_c, ...comp.ansys_temp_c]
    const yMin = Math.floor(Math.min(...all) - 1)
    const yMax = Math.ceil(Math.max(...all) + 1)
    const range = yMax - yMin || 1
    const w = 720, h = 220, pad = 50

    const toPath = (vals: number[]) =>
      vals
        .map(
          (v, i) =>
            `${i === 0 ? 'M' : 'L'} ${(pad + (i / Math.max(pts - 1, 1)) * (w - pad - 20)).toFixed(1)},${(
              15 +
              (1 - (v - yMin) / range) * (h - 45)
            ).toFixed(1)}`
        )
        .join(' ')

    return (
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h5 style={{ margin: 0 }}>Transient Temperature Comparison (72h Cold Wave)</h5>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Identical boundary conditions: NASA POWER Leh weather + envelope solids + internal region
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-heat-600)' }}>
              <span style={{ width: '12px', height: '3px', background: 'var(--color-heat-600)', display: 'inline-block' }} />
              THERMASHELL PHYSICS
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-structure-600)' }}>
              <span style={{ width: '12px', height: '3px', background: 'var(--color-structure-600)', display: 'inline-block' }} />
              ANSYS FLUENT
            </span>
          </div>
        </div>

        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '220px', overflow: 'visible' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={pad}
              y1={15 + f * (h - 45)}
              x2={w - 20}
              y2={15 + f * (h - 45)}
              stroke="var(--color-border-light)"
              strokeWidth="0.5"
            />
          ))}
          <path d={toPath(comp.physics_temp_c)} fill="none" stroke="var(--color-heat-600)" strokeWidth="2" />
          <path d={toPath(comp.ansys_temp_c)} fill="none" stroke="var(--color-structure-600)" strokeWidth="2" strokeDasharray="4,3" />

          <text x="5" y="20" fontSize="8.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMax}°C
          </text>
          <text x="5" y={h - 25} fontSize="8.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMin}°C
          </text>
        </svg>

        {/* Residual error strip */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Residual Deviation: Error(t) = T_physics(t) - T_ansys(t)
          </div>
          <div style={{ display: 'flex', gap: '2px', height: '28px', alignItems: 'center', background: 'var(--color-bg-paper-warm)', padding: '2px', borderRadius: '4px' }}>
            {comp.residuals_c.map((r, i) => {
              const abs = Math.abs(r)
              const color = abs < 0.5 ? 'var(--color-comfort-500)' : abs < 1.0 ? 'var(--color-solar-500)' : 'var(--color-warning-500)'
              return (
                <div
                  key={i}
                  title={`Hour ${i}: ΔT = ${r > 0 ? '+' : ''}${r.toFixed(2)}°C`}
                  style={{
                    flex: 1,
                    height: `${Math.min(100, Math.max(20, abs * 40))}%`,
                    background: color,
                    borderRadius: '1px',
                  }}
                />
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            <span>Hour 0</span>
            <span>Max Absolute Error: {comp.metrics.max_abs_error.toFixed(2)}°C</span>
            <span>Hour {pts}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-structure" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Cpu size={14} /> ANSYS Fluent CFD Automation & Validation
          </span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Location: <strong>{scenario.location.name}</strong> ({scenario.location.elevation}m)
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Physics Engine vs. ANSYS Fluent Validation
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', maxWidth: '850px' }}>
          Conjugate heat transfer benchmark comparing THERMASHELL multi-zone RC state-space physics against full 3D transient Navier-Stokes & energy solver in ANSYS Fluent.
        </p>
      </div>

      {/* ANSYS Worker Status HUD Bar */}
      <div
        className="card"
        style={{
          marginBottom: '2rem',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--color-bg-paper-warm)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-structure-600)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>ANSYS Fluent Environment</span>
              {ansysStatus?.status === 'CONNECTED' ? (
                <span className="badge badge-comfort" style={{ fontSize: '0.7rem' }}>
                  ANSYS CONNECTED
                </span>
              ) : ansysStatus?.status === 'BUSY' ? (
                <span className="badge badge-solar" style={{ fontSize: '0.7rem' }}>
                  ANSYS BUSY
                </span>
              ) : (
                <span className="chip chip-demo" style={{ fontSize: '0.7rem', background: 'var(--color-warning-100)', color: 'var(--color-warning-700)' }}>
                  ANSYS OFFLINE / UNAVAILABLE
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              PyFluent Integration: {ansysStatus?.mode || 'None'} · Host: {ansysStatus?.worker_host || 'Local Worker'}
            </div>
          </div>
        </div>

        <button
          className="btn btn-structure"
          onClick={handleLaunchAnsys}
          disabled={isDispatching}
          style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.25rem' }}
        >
          {isDispatching ? <RefreshCw size={14} className="animate-pulse-soft" /> : <Play size={14} />}
          {isDispatching ? 'Preparing Fluent CFD…' : 'Run ANSYS Fluent Verification'}
        </button>
      </div>

      {/* Unavailable Warning Banner */}
      {dispatchError && (
        <div className="banner banner-warning" style={{ marginBottom: '2rem' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>{dispatchError}</strong>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem', marginBottom: 0 }}>
              To enable 3D CFD verification, configure <code>ANSYS_INSTALL_PATH</code> and ensure a licensed ANSYS Fluent instance or PyFluent worker container is active.
            </p>
          </div>
        </div>
      )}

      {/* Comparison Results Area */}
      {comparison ? (
        <div>
          {/* Statistical Metrics Scorecard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Mean Abs Error (MAE)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-comfort-600)', marginTop: '0.25rem' }}>
                {comparison.metrics.mae.toFixed(2)} <span className="data-unit">°C</span>
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Root Mean Sq (RMSE)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-comfort-600)', marginTop: '0.25rem' }}>
                {comparison.metrics.rmse.toFixed(2)} <span className="data-unit">°C</span>
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Mean Bias Error (MBE)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-structure-600)', marginTop: '0.25rem' }}>
                {comparison.metrics.mbe > 0 ? '+' : ''}{comparison.metrics.mbe.toFixed(2)} <span className="data-unit">°C</span>
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Coeff of Det (R²)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-solar-600)', marginTop: '0.25rem' }}>
                {comparison.metrics.r_squared.toFixed(3)}
              </div>
            </div>

            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Pct Error</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
                {comparison.metrics.pct_error.toFixed(1)} <span className="data-unit">%</span>
              </div>
            </div>
          </div>

          <DualCurvesChart comp={comparison} />
        </div>
      ) : (
        /* Empty / Waiting state */
        <div
          className="card"
          style={{
            padding: '3.5rem 2rem',
            textAlign: 'center',
            background: 'var(--color-bg-card)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Cpu size={40} color="var(--color-text-muted)" style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            No ANSYS Fluent Verification Run Yet
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '560px', margin: '0 auto 1.5rem auto' }}>
            To compare THERMASHELL fast RC state-space predictions against 3D transient Navier-Stokes simulation, connect an ANSYS worker and click "Run ANSYS Fluent Verification".
          </p>
          <div style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleLaunchAnsys}>
              <Play size={15} /> Execute Comparison
            </button>
            <button className="btn btn-outline" onClick={checkAnsysStatus}>
              <RefreshCw size={14} /> Refresh Worker Status
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
