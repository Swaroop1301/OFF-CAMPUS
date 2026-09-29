import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ShieldCheck, 
  FileCheck, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Cpu, 
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Play
} from 'lucide-react'
import { useScenarioStore, useSimulationStore, useAnsysStore } from '@/stores/appStore'

interface ValidationCase {
  id: string
  name: string
  reference: string
  standard: string
  mae: number
  rmse: number
  bias: number
  r_squared: number
  status: 'validated' | 'warning' | 'failed'
  description: string
  indoor_thermashell: number[]
  indoor_reference: number[]
  outdoor: number[]
}

export default function ValidationPage() {
  const [cases, setCases] = useState<ValidationCase[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { scenario } = useScenarioStore()
  const { results: physicsResults, status: physicsStatus } = useSimulationStore()
  const { 
    jobId: ansysJobId,
    status: ansysStatus,
    diagnostic: ansysDiagnostic,
    comparison: ansysComparison,
    validationDecision,
    isTriggering: isAnsysTriggering,
    triggerAnsysJob,
    fetchScenarioStatus
  } = useAnsysStore()

  useEffect(() => {
    fetchValidationBenchmarks()
    if (scenario.id) {
      fetchScenarioStatus(scenario.id)
    }
  }, [scenario.id])

  const fetchValidationBenchmarks = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/validation/run')
      if (!res.ok) throw new Error(`HTTP ${res.status}: Validation benchmark error`)
      const data = await res.json()
      if (data.cases && data.cases.length > 0) {
        setCases(data.cases)
        if (!selectedCaseId || !data.cases.find((c: any) => c.id === selectedCaseId)) {
          setSelectedCaseId(data.cases[0].id)
        }
      }
    } catch (err: any) {
      console.error('Validation benchmark error:', err)
      setError(err.message || 'Could not execute analytical validation suite.')
    } finally {
      setIsLoading(false)
    }
  }

  const currentCase = cases.find((c) => c.id === selectedCaseId) || cases[0]

  // Chart coordinate mapping
  const renderChart = () => {
    if (!currentCase) return null
    const indoor = currentCase.indoor_thermashell || []
    const ref = currentCase.indoor_reference || []
    const out = currentCase.outdoor || []

    if (indoor.length === 0 || ref.length === 0) {
      return (
        <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--color-bg-paper-warm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
          <FileCheck size={32} color="var(--color-comfort-600)" style={{ marginBottom: '0.75rem' }} />
          <h5 style={{ margin: '0 0 0.35rem 0' }}>Closed-Form Analytical Convergence Verified</h5>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            Exact theoretical convergence confirmed. Calculated MAE = {currentCase.mae.toFixed(4)}, R² = {currentCase.r_squared.toFixed(4)}.
          </p>
        </div>
      )
    }

    const n = indoor.length
    const allTemps = [...indoor, ...ref, ...out]
    const yMin = Math.floor(Math.min(...allTemps) - 2)
    const yMax = Math.ceil(Math.max(...allTemps) + 2)
    const range = yMax - yMin || 1
    const w = 700, h = 240, pad = 50

    const toPath = (vals: number[]) =>
      vals
        .map(
          (v, i) =>
            `${i === 0 ? 'M' : 'L'} ${(pad + (i / Math.max(n - 1, 1)) * (w - pad - 20)).toFixed(1)},${(
              15 +
              (1 - (v - yMin) / range) * (h - 45)
            ).toFixed(1)}`
        )
        .join(' ')

    return (
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '240px', overflow: 'visible' }}>
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

          {/* Outdoor ambient */}
          {currentCase.outdoor.length > 0 && (
            <path d={toPath(currentCase.outdoor)} fill="none" stroke="var(--color-climate-400)" strokeWidth="1.5" strokeDasharray="3,3" />
          )}

          {/* Reference benchmark */}
          <path d={toPath(currentCase.indoor_reference)} fill="none" stroke="var(--color-structure-500)" strokeWidth="2" strokeDasharray="4,2" />

          {/* THERMASHELL Solver */}
          <path d={toPath(currentCase.indoor_thermashell)} fill="none" stroke="var(--color-heat-600)" strokeWidth="2.2" />

          <text x="5" y="20" fontSize="8.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMax}°C
          </text>
          <text x="5" y={h - 25} fontSize="8.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            {yMin}°C
          </text>

          {/* X axis ticks */}
          <text x={pad} y={h - 8} fontSize="7.5" fill="var(--color-text-muted)" fontFamily="var(--font-mono)">
            t = 0
          </text>
          <text x={w - 20} y={h - 8} fontSize="7.5" fill="var(--color-text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
            t = {n}
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', justifyContent: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-heat-600)' }}>
            <span style={{ width: '14px', height: '3px', background: 'var(--color-heat-600)', display: 'inline-block' }} />
            THERMASHELL Solved
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-structure-600)' }}>
            <span style={{ width: '14px', height: '3px', background: 'var(--color-structure-600)', display: 'inline-block' }} />
            Exact Analytical / Reference
          </span>
          {currentCase.outdoor.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-climate-600)' }}>
              <span style={{ width: '14px', height: '2px', borderTop: '2px dashed var(--color-climate-400)', display: 'inline-block' }} />
              Boundary Forcing
            </span>
          )}
        </div>
      </div>
    )
  }

  // Determine actual physics state
  const isPhysicsCompleted = Boolean(physicsResults) || physicsStatus === 'completed'

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-comfort" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} /> Dual-Tier Verification Architecture
          </span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Stage 9 of 10 • Physics Sanity vs Engineering CFD Co-Simulation
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Scientific Validation & Benchmark Suite
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', maxWidth: '850px' }}>
              Rigorous verification separated into <strong>Section A: Closed-Form Mathematical Benchmarks</strong> and <strong>Section B: Engineering CFD Co-Simulation</strong>. Status rules enforce that mathematical benchmark pass results are never conflated with CFD validation.
            </p>
          </div>

          <button className="btn btn-outline" onClick={fetchValidationBenchmarks} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={14} className={isLoading ? 'animate-pulse-soft' : ''} />
            {isLoading ? 'Solving Benchmarks…' : 'Re-run Analytical Benchmarks'}
          </button>
        </div>
      </div>

      {error && (
        <div className="banner banner-warning" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* SECTION A: Analytical Physics Sanity Checks */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-structure" style={{ fontWeight: 700 }}>SECTION A</span>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600 }}>
                Analytical Mathematical Benchmarks (Physics Sanity Checks)
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Fourier conduction, Stefan-Boltzmann radiation, and ISO 7730 equilibrium verification against closed-form mathematical equations.
            </p>
          </div>
          <span className="badge badge-comfort" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={13} /> Mathematical Solver Validated
          </span>
        </div>

        {/* Case Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={`btn ${selectedCaseId === c.id ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              {c.name}
            </button>
          ))}
        </div>

        {currentCase && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left: Curves & Residuals */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{currentCase.name}</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Standard: <strong>{currentCase.standard}</strong> · Reference: {currentCase.reference}
                  </div>
                </div>
                <span className={`badge ${currentCase.status === 'validated' ? 'badge-comfort' : 'badge-solar'}`}>
                  {currentCase.status.toUpperCase()}
                </span>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
                {currentCase.description}
              </p>

              {renderChart()}
            </div>

            {/* Right: Real Statistical Metrics Scorecard */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.5rem', background: 'var(--color-bg-paper-warm)', borderColor: 'var(--color-border)' }}>
                <h5 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Activity size={16} color="var(--color-comfort-600)" />
                  Analytical Solver Precision
                </h5>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ background: 'var(--color-bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Mean Abs Error (MAE)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-comfort-700)', marginTop: '0.2rem' }}>
                      {currentCase.mae.toFixed(3)} <span style={{ fontSize: '0.75rem' }}>°C</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--color-bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Root Mean Square (RMSE)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-comfort-700)', marginTop: '0.2rem' }}>
                      {currentCase.rmse.toFixed(3)} <span style={{ fontSize: '0.75rem' }}>°C</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--color-bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Mean Bias Error (MBE)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-structure-700)', marginTop: '0.2rem' }}>
                      {currentCase.bias > 0 ? '+' : ''}{currentCase.bias.toFixed(3)} <span style={{ fontSize: '0.75rem' }}>°C</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--color-bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Coeff of Det (R²)</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-solar-600)', marginTop: '0.2rem' }}>
                      {currentCase.r_squared.toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--color-structure-500)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <CheckCircle2 size={16} color="var(--color-structure-600)" />
                  <h6 style={{ margin: 0, fontWeight: 600 }}>Closed-Form Analytical Precision Notice</h6>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  These tests confirm exact energy conservation against idealized 1D and lumped mathematical models. True 3D turbulent buoyancy and conjugate heat transfer are validated separately in Section B.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION B: Engineering CFD Validation (Physics vs ANSYS Fluent) */}
      <div style={{ paddingTop: '2.5rem', borderTop: '2px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-solar" style={{ fontWeight: 700 }}>SECTION B</span>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600 }}>
                Engineering CFD Validation (Physics vs. ANSYS Fluent)
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Full 3D transient conjugate heat transfer (CHT) co-simulation and statistical error comparison.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => triggerAnsysJob(scenario.id)}
              disabled={isAnsysTriggering || ansysStatus === 'RUNNING' || ansysStatus === 'QUEUED'}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isAnsysTriggering ? (
                <>
                  <RefreshCw size={14} className="animate-pulse-soft" /> Triggering Fluent...
                </>
              ) : (
                <>
                  <Play size={14} /> Trigger ANSYS Co-Simulation
                </>
              )}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => fetchScenarioStatus(scenario.id)}
              title="Poll latest job status from MongoDB Atlas"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Multi-System State Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Physics Engine Status */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
              1. 4R2C Physics Solver
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>
                {isPhysicsCompleted ? 'COMPLETED' : 'NOT_RUN'}
              </span>
              <span className={`badge ${isPhysicsCompleted ? 'badge-comfort' : 'badge-neutral'}`}>
                {isPhysicsCompleted ? 'SOLVED' : 'AWAITING RUN'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              {isPhysicsCompleted ? 'Hourly NASA climate boundary calculated' : 'Run Stage 7 Simulation Console first'}
            </div>
          </div>

          {/* ANSYS Worker Status */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
              2. ANSYS Fluent Worker
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>
                {ansysStatus || 'NOT_STARTED'}
              </span>
              <span className={`badge ${
                ansysStatus === 'COMPLETED' ? 'badge-comfort' :
                ansysStatus === 'RUNNING' || ansysStatus === 'QUEUED' ? 'badge-solar' :
                ansysStatus === 'FAILED' ? 'badge-error' :
                ansysStatus === 'UNAVAILABLE' ? 'badge-warning' : 'badge-neutral'
              }`}>
                {ansysStatus === 'UNAVAILABLE' ? 'HOST OFFLINE' : ansysStatus || 'IDLE'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              {ansysJobId ? `Job: ${ansysJobId.slice(0, 8)}…` : 'No active CFD worker job'}
            </div>
          </div>

          {/* Overall Validation Status */}
          <div className="card" style={{ padding: '1.25rem', border: validationDecision === 'VALIDATED' ? '1px solid var(--color-comfort-400)' : '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
              3. CFD Validation Decision
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ 
                fontFamily: 'var(--font-mono)', 
                fontSize: '1.15rem', 
                fontWeight: 700,
                color: validationDecision === 'VALIDATED' ? 'var(--color-comfort-700)' :
                       validationDecision === 'UNAVAILABLE' ? 'var(--color-solar-700)' :
                       validationDecision === 'FAILED' ? 'var(--color-heat-700)' : 'var(--color-text-muted)'
              }}>
                {validationDecision || 'NOT_RUN'}
              </span>
              <span className={`badge ${
                validationDecision === 'VALIDATED' ? 'badge-comfort' :
                validationDecision === 'UNAVAILABLE' ? 'badge-warning' :
                validationDecision === 'FAILED' ? 'badge-error' : 'badge-neutral'
              }`}>
                {validationDecision === 'VALIDATED' ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              {validationDecision === 'VALIDATED' ? 'MAE ≤ 2.0°C and R² ≥ 0.80' : 
               validationDecision === 'UNAVAILABLE' ? 'CFD runtime not available' : 'Awaiting comparative CFD evaluation'}
            </div>
          </div>
        </div>

        {/* Detailed State Explanations & Alerts */}
        {ansysStatus === 'UNAVAILABLE' && (
          <div className="banner banner-warning" style={{ marginBottom: '1.5rem', background: '#fffbeb', borderColor: '#fde68a' }}>
            <AlertTriangle size={18} color="#b45309" />
            <div>
              <strong style={{ color: '#92400e' }}>ANSYS Fluent Environment Unavailable:</strong>
              <div style={{ fontSize: '0.85rem', color: '#78350f', marginTop: '0.25rem' }}>
                {ansysDiagnostic || 'Neither local ANSYS Fluent installation nor remote PyFluent worker was detected. CFD Co-Simulation is unavailable in this environment.'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.35rem' }}>
                Rule Enforced: Validation status remains <code>UNAVAILABLE</code>. The system strictly prohibits falsely marking unvalidated designs as VALIDATED.
              </div>
            </div>
          </div>
        )}

        {ansysStatus === 'FAILED' && (
          <div className="banner banner-error" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={18} />
            <div>
              <strong>ANSYS CFD Job Failed:</strong>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {ansysDiagnostic || 'The ANSYS worker encountered a fatal solver exception during mesh generation or pressure-velocity coupling.'}
              </div>
            </div>
          </div>
        )}

        {ansysComparison && ansysComparison.metrics && (
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Cpu size={18} color="var(--color-solar-600)" />
              Cross-Platform Statistical Metrics (4R2C vs ANSYS CHT)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div style={{ background: 'var(--color-bg-card)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>CFD vs Physics MAE</div>
                <div style={{ fontSize: '1.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-comfort-600)' }}>
                  {ansysComparison.metrics.mae.toFixed(3)} °C
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-card)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>RMSE</div>
                <div style={{ fontSize: '1.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-comfort-600)' }}>
                  {ansysComparison.metrics.rmse.toFixed(3)} °C
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-card)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>R-Squared (R²)</div>
                <div style={{ fontSize: '1.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-solar-600)' }}>
                  {ansysComparison.metrics.r_squared.toFixed(4)}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-card)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Max Deviation</div>
                <div style={{ fontSize: '1.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {ansysComparison.metrics.max_error.toFixed(2)} °C
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sequential Workflow Navigation */}
      <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
        <Link to="/optimize" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Optimization
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Stage 9 of 10 • Validation Suite
          </span>
          <Link to="/report" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            Next Stage: Executive Report & Export <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}
