import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Sliders, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  BarChart2, 
  Layers, 
  Flame, 
  Sun, 
  ShieldCheck, 
  RefreshCw,
  Info
} from 'lucide-react'
import { useScenarioStore } from '@/stores/appStore'

interface CandidateDesign {
  id: number
  name: string
  insulation_mm: number
  wwr_pct: number
  glazing_type: string
  orientation_deg: number
  annual_heating_kwh: number
  comfort_score: number // 0-100
  capital_cost_inr: number
  is_pareto: boolean
  composite_score: number
}

export default function OptimizePage() {
  const { scenario } = useScenarioStore()

  // Weightings for multi-objective optimization
  const [energyWeight, setEnergyWeight] = useState(45)
  const [comfortWeight, setComfortWeight] = useState(35)
  const [costWeight, setCostWeight] = useState(20)

  // Filters
  const [maxBudget, setMaxBudget] = useState(500000)
  const [minComfort, setMinComfort] = useState(75)

  // Engine state
  const [isRunningEngine, setIsRunningEngine] = useState(false)
  const [engineResults, setEngineResults] = useState<any>(null)
  const [dataSource, setDataSource] = useState<'local' | 'engine'>('local')

  // Run real optimization via backend API
  const runEngineOptimization = async () => {
    setIsRunningEngine(true)
    try {
      const totalW = energyWeight + comfortWeight + costWeight || 1
      const payload = {
        base_scenario: {
          scenario_id: scenario.id,
          length_m: scenario.geometry.length,
          width_m: scenario.geometry.width,
          height_m: scenario.geometry.height,
          roof_pitch_deg: scenario.geometry.roof_pitch,
          orientation_deg: scenario.geometry.orientation,
          elevation_m: scenario.location.elevation,
          wall_layers: scenario.envelope.wall_layers.map((l) => ({
            name: l.name, thickness_mm: l.thickness_mm,
            conductivity: l.conductivity, density: l.density, specific_heat: l.specific_heat,
          })),
          roof_layers: scenario.envelope.roof_layers.map((l) => ({
            name: l.name, thickness_mm: l.thickness_mm,
            conductivity: l.conductivity, density: l.density, specific_heat: l.specific_heat,
          })),
          occupants: scenario.operating.occupants,
          metabolic_rate_w: scenario.operating.metabolic_rate,
          internal_gains_w: scenario.operating.internal_gains,
          hvac_mode: scenario.operating.hvac_mode,
          target_temp_c: scenario.operating.target_temp,
          comfort_band_c: scenario.operating.comfort_band,
          ach_natural: scenario.operating.ach_natural,
          ach_infiltration: scenario.operating.ach_infiltration,
          duration_hours: 72,
          base_outdoor_temp_c: scenario.location.climate_zone.toLowerCase().includes('hot') ? 35 : -10,
          temp_swing_c: scenario.location.climate_zone.toLowerCase().includes('hot') ? 8 : 5,
          peak_solar_ghi: scenario.location.elevation > 2000 ? 500 : 400,
        },
        w_energy: energyWeight / totalW,
        w_comfort: comfortWeight / totalW,
        w_cost: costWeight / totalW,
        max_candidates: 24,
      }
      const res = await fetch('/api/v1/optimization/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setEngineResults(data)
      setDataSource('engine')
    } catch (err) {
      console.error('Engine optimization failed:', err)
    }
    setIsRunningEngine(false)
  }

  // Automatically execute physics optimization sweep on mount
  useEffect(() => {
    runEngineOptimization()
  }, [])

  // Parametric candidate pool (deterministic sweep from live engine)
  const candidates: CandidateDesign[] = useMemo(() => {
    if (!engineResults || !engineResults.candidates) {
      return []
    }

    return engineResults.candidates.map((c: any, i: number) => ({
      id: i + 1,
      name: c.design_id || `Physics Config #${i + 1}`,
      insulation_mm: Math.round((c.parameters?.insulation_thickness_m || 0.1) * 1000),
      wwr_pct: Math.round((c.parameters?.window_to_wall_ratio || 0.2) * 100),
      glazing_type: c.parameters?.window_u_value <= 1.4 ? 'Triple Low-E' : c.parameters?.window_u_value <= 2.8 ? 'Double Low-E' : 'Single',
      orientation_deg: Math.round(c.parameters?.orientation_deg || 180),
      annual_heating_kwh: Math.round((c.energy_kwh || 0) * (365 / 3)), // 72h scaled to annual
      comfort_score: Math.round(c.comfort_percentage || 0),
      capital_cost_inr: Math.round((c.estimated_cost_factor || 1.0) * 350000),
      is_pareto: Boolean(c.is_pareto_optimal),
      composite_score: parseFloat(((c.score || 0) * 100).toFixed(1)),
    })).sort((a: CandidateDesign, b: CandidateDesign) => b.composite_score - a.composite_score)
  }, [engineResults])

  const filteredCandidates = candidates.filter(
    (c) => c.capital_cost_inr <= maxBudget && c.comfort_score >= minComfort
  )

  const topDesign = filteredCandidates[0] || candidates[0]

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span className="badge badge-solar" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sparkles size={14} /> Deterministic Pareto Optimizer
          </span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Parametric Sweep ({candidates.length} Envelope Permutations)
          </span>
          {dataSource === 'engine' ? (
            <span className="chip" style={{ background: 'var(--color-comfort-100)', color: 'var(--color-comfort-700)', fontWeight: 600 }}>LIVE ENGINE</span>
          ) : (
            <span className="chip chip-demo">LOCAL PREVIEW</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Envelope Optimization & Trade-Off Analysis
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', maxWidth: '850px' }}>
              Multi-objective optimization balancing annual heating load, occupant thermal comfort satisfaction, and capital expenditure. Pure physics-driven Pareto extraction without black-box heuristics.
            </p>
          </div>
          <button
            className="btn btn-solar"
            onClick={runEngineOptimization}
            disabled={isRunningEngine}
            style={{ whiteSpace: 'nowrap', padding: '0.75rem 1.5rem' }}
          >
            {isRunningEngine ? (
              <><RefreshCw size={14} className="animate-pulse-soft" /> Running Engine…</>
            ) : (
              <><Sparkles size={14} /> Run Engine Sweep</>
            )}
          </button>
        </div>
      </div>

      {/* Top Section: Weight Sliders & Constraints */}
      <div 
        className="card" 
        style={{ 
          marginBottom: '2rem', 
          background: 'var(--color-bg-paper)', 
          border: '1px solid var(--color-border-subtle)',
          padding: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <Sliders size={18} color="var(--color-structure-600)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
            Objective Weightings & Budget Constraints
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {/* Energy Weight */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 500, color: 'var(--color-heat-600)' }}>Energy Efficiency Weight</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{energyWeight}%</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={100} 
              value={energyWeight} 
              onChange={(e) => setEnergyWeight(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-heat-500)' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              Minimizes auxiliary heating kWh
            </div>
          </div>

          {/* Comfort Weight */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 500, color: 'var(--color-comfort-600)' }}>Comfort Hours Weight</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{comfortWeight}%</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={100} 
              value={comfortWeight} 
              onChange={(e) => setComfortWeight(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-comfort-500)' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              Maximizes PMV within comfort band
            </div>
          </div>

          {/* Cost Weight */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 500, color: 'var(--color-structure-600)' }}>Capital Cost Weight</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{costWeight}%</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={100} 
              value={costWeight} 
              onChange={(e) => setCostWeight(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-structure-500)' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              Penalizes expensive assemblies
            </div>
          </div>

          {/* Max Budget Filter */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Max Budget Cap</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>₹{(maxBudget / 1000).toFixed(0)}k</span>
            </div>
            <input 
              type="range" 
              min={300000} 
              max={600000} 
              step={25000}
              value={maxBudget} 
              onChange={(e) => setMaxBudget(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
              Filters out assemblies exceeding limit
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Design Highlight */}
      {topDesign && (
        <div 
          className="card" 
          style={{ 
            marginBottom: '2rem', 
            border: '2px solid var(--color-comfort-400)', 
            background: 'linear-gradient(135deg, #F0FDF4 0%, #FAF8F3 60%)' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className="badge badge-comfort">Rank #1 Optimal Configuration</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Score: {topDesign.composite_score} / 100
                </span>
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, color: 'var(--color-comfort-800)', margin: '0 0 0.5rem 0' }}>
                {topDesign.name}
              </h2>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                <span>Insulation: <strong>{topDesign.insulation_mm}mm</strong></span>
                <span>South WWR: <strong>{topDesign.wwr_pct}%</strong></span>
                <span>Glazing: <strong>{topDesign.glazing_type}</strong></span>
                <span>Orientation: <strong>{topDesign.orientation_deg}° South</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Annual Heating</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heat-600)' }}>
                  {topDesign.annual_heating_kwh} <span style={{ fontSize: '0.75rem' }}>kWh</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Comfort Index</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-comfort-600)' }}>
                  {topDesign.comfort_score}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>CapEx</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  ₹{(topDesign.capital_cost_inr / 1000).toFixed(0)}k
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pareto Frontier Chart + Leaderboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Pareto 2D Scatter Chart */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
              Pareto Frontier: Energy vs. Capital Cost
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              Green dots = Non-dominated
            </span>
          </div>

          {/* SVG Scatter Plot */}
          <div style={{ position: 'relative', width: '100%', height: '260px' }}>
            <svg viewBox="0 0 450 240" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              {/* Axes */}
              <line x1="50" y1="20" x2="50" y2="200" stroke="var(--color-border-subtle)" strokeWidth="1.5" />
              <line x1="50" y1="200" x2="430" y2="200" stroke="var(--color-border-subtle)" strokeWidth="1.5" />

              {/* Axis labels */}
              <text x="240" y="232" textAnchor="middle" fontSize="11" fill="var(--color-text-muted)" fontFamily="var(--font-sans)">
                Capital Cost (₹ Lakhs) →
              </text>
              <text x="-110" y="20" transform="rotate(-90)" textAnchor="middle" fontSize="11" fill="var(--color-text-muted)" fontFamily="var(--font-sans)">
                Heating kWh/yr →
              </text>

              {/* Grid ticks */}
              <text x="50" y="215" textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">₹2.5L</text>
              <text x="240" y="215" textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">₹4.0L</text>
              <text x="420" y="215" textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">₹5.5L</text>

              {/* Candidates plotted */}
              {candidates.map((c) => {
                // Map cost 250k-550k to x: 50 -> 420
                const cx = 50 + ((c.capital_cost_inr - 250000) / 300000) * 370
                // Map heating 1800-5800 to y: 190 -> 30 (lower heating is higher up)
                const cy = 190 - ((c.annual_heating_kwh - 1800) / 4000) * 160
                const isSelected = c.id === topDesign?.id

                return (
                  <g key={c.id} style={{ cursor: 'pointer' }}>
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={isSelected ? 8 : c.is_pareto ? 6 : 4} 
                      fill={isSelected ? 'var(--color-comfort-500)' : c.is_pareto ? 'var(--color-solar-500)' : 'var(--color-border-strong)'} 
                      stroke={isSelected ? '#fff' : 'none'}
                      strokeWidth={2}
                    />
                    <text 
                      x={cx + 9} 
                      y={cy + 4} 
                      fontSize="9" 
                      fill={isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} 
                      fontWeight={isSelected ? 600 : 400}
                      fontFamily="var(--font-mono)"
                    >
                      #{c.id}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.75rem', display: 'flex', gap: '1.25rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-solar-500)' }}></span> Pareto Frontier
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-comfort-500)' }}></span> Current Rank #1
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-border-strong)' }}></span> Dominated
            </span>
          </div>
        </div>

        {/* Ranked Leaderboard */}
        <div className="card" style={{ padding: '1.5rem', maxHeight: '360px', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Ranked Leaderboard
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {filteredCandidates.map((c, idx) => (
              <div 
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  background: idx === 0 ? 'var(--color-comfort-50)' : 'var(--color-bg-paper)',
                  border: idx === 0 ? '1px solid var(--color-comfort-200)' : '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: idx === 0 ? 'var(--color-comfort-700)' : 'var(--color-text-muted)' }}>
                    #{idx + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {c.insulation_mm}mm EPS • {c.glazing_type} • {c.wwr_pct}% WWR
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem' }}>
                    {c.composite_score} pts
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-heat-600)', fontFamily: 'var(--font-mono)' }}>
                    {c.annual_heating_kwh} kWh
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
