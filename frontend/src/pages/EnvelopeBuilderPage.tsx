import { useScenarioStore } from '@/stores/appStore'
import { Link } from 'react-router-dom'
import { GripVertical, Plus, Trash2, ArrowUpDown, Layers, ShieldCheck, X } from 'lucide-react'
import { useState, useEffect } from 'react'

interface MaterialOption {
  id: string
  name: string
  category: string
  thermal_conductivity_k: number
  density_rho: number
  specific_heat_cp: number
  embodied_carbon?: number
  cost?: number
}

export default function EnvelopeBuilderPage() {
  const { scenario, updateEnvelope } = useScenarioStore()
  const { wall_layers, roof_layers, floor_layers, windows } = scenario.envelope
  const [activeTab, setActiveTab] = useState<'walls' | 'roof' | 'floor' | 'windows'>('walls')

  // Available database materials
  const [dbMaterials, setDbMaterials] = useState<MaterialOption[]>([])
  const [showAddLayerModal, setShowAddLayerModal] = useState(false)
  const [selectedMatId, setSelectedMatId] = useState<string>('')
  const [layerThicknessMm, setLayerThicknessMm] = useState<number>(50)

  useEffect(() => {
    fetch('/api/v1/materials')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setDbMaterials(data)
        if (data.length > 0) setSelectedMatId(data[0].id || data[0].name)
      })
      .catch((e) => console.warn('Could not load material catalog for envelope:', e))
  }, [])

  const activeLayers = activeTab === 'walls' ? wall_layers : activeTab === 'roof' ? roof_layers : floor_layers

  // Thermophysical calculations
  // Rsi & Rse based on ISO 6946: Walls (0.13 + 0.04 = 0.17), Roofs upward heat flow (0.10 + 0.04 = 0.14)
  const rSurface = activeTab === 'roof' ? 0.14 : 0.17
  const coreR = activeLayers.reduce((sum, l) => sum + (l.thickness_mm / 1000) / (l.conductivity || 0.001), 0)
  const totalR = coreR + rSurface
  const uValue = totalR > 0 ? 1 / totalR : 0

  // Total layer mass: sum(thickness_m * density)
  const totalMassKgM2 = activeLayers.reduce((sum, l) => sum + (l.thickness_mm / 1000) * (l.density || 1000), 0)

  // Areal Thermal Capacitance: sum(thickness_m * density * cp) in kJ/(m²·K)
  const thermalCapacitanceKJ = activeLayers.reduce(
    (sum, l) => sum + ((l.thickness_mm / 1000) * (l.density || 1000) * (l.specific_heat || 880)) / 1000,
    0
  )

  const handleUpdateThickness = (idx: number, newThicknessMm: number) => {
    const updated = [...activeLayers]
    updated[idx] = { ...updated[idx], thickness_mm: Math.max(1, newThicknessMm) }
    if (activeTab === 'walls') updateEnvelope({ wall_layers: updated })
    else if (activeTab === 'roof') updateEnvelope({ roof_layers: updated })
    else updateEnvelope({ floor_layers: updated })
  }

  const handleDeleteLayer = (idx: number) => {
    const updated = activeLayers.filter((_, i) => i !== idx)
    if (activeTab === 'walls') updateEnvelope({ wall_layers: updated })
    else if (activeTab === 'roof') updateEnvelope({ roof_layers: updated })
    else updateEnvelope({ floor_layers: updated })
  }

  const handleAddLayerSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const chosen = dbMaterials.find((m) => (m.id || m.name) === selectedMatId) || dbMaterials[0]
    if (!chosen) return

    const newLayer = {
      id: `layer-${Date.now()}`,
      name: chosen.name,
      thickness_mm: layerThicknessMm,
      conductivity: chosen.thermal_conductivity_k,
      density: chosen.density_rho,
      specific_heat: chosen.specific_heat_cp,
    }

    const updated = [...activeLayers, newLayer]
    if (activeTab === 'walls') updateEnvelope({ wall_layers: updated })
    else if (activeTab === 'roof') updateEnvelope({ roof_layers: updated })
    else updateEnvelope({ floor_layers: updated })

    setShowAddLayerModal(false)
  }

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-heat" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Layers size={14} /> ISO 6946 Multi-Layer Conduction
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Deterministic Envelope Assembly Builder
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Envelope Builder
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Configure layered wall, roof, and floor assemblies with database materials. Real-time U-value and dynamic thermal capacitance calculation.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'var(--color-bg-paper-warm)', borderRadius: 'var(--radius-md)', padding: '0.25rem' }}>
        {(['walls', 'roof', 'floor', 'windows'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              background: activeTab === tab ? 'var(--color-bg-card)' : 'transparent',
              boxShadow: activeTab === tab ? 'var(--shadow-card)' : 'none',
              fontSize: '0.8125rem',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--color-heat-600)' : 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 0.15s ease',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab !== 'windows' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          {/* Layer stack */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h5 style={{ margin: 0, textTransform: 'capitalize' }}>{activeTab} Layer Stack (Inside → Outside)</h5>
              <button
                className="btn btn-outline"
                onClick={() => setShowAddLayerModal(true)}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Plus size={13} /> Add Layer
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activeLayers.map((layer, i) => (
                <div
                  key={layer.id || i}
                  className="card"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr 100px auto',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderLeft: `4px solid ${layer.conductivity < 0.05 ? 'var(--color-solar-500)' : 'var(--color-structure-400)'}`,
                  }}
                >
                  <GripVertical size={14} style={{ color: 'var(--color-text-muted)', cursor: 'grab' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{layer.name}</div>
                    <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      <span>k = {layer.conductivity} W/(m·K)</span>
                      <span>ρ = {layer.density} kg/m³</span>
                      <span>R = {((layer.thickness_mm / 1000) / (layer.conductivity || 0.001)).toFixed(3)} m²·K/W</span>
                    </div>
                  </div>

                  {/* Thickness input */}
                  <div>
                    <input
                      type="number"
                      className="input"
                      value={layer.thickness_mm}
                      min={1}
                      max={1000}
                      onChange={(e) => handleUpdateThickness(i, parseFloat(e.target.value) || 0)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.25rem 0.5rem', width: '80px' }}
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: '4px' }}>mm</span>
                  </div>

                  <button
                    className="btn-ghost"
                    onClick={() => handleDeleteLayer(i)}
                    title="Remove layer"
                    style={{ color: 'var(--color-warning-500)', padding: '0.25rem' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary panel */}
          <div>
            <div className="card" style={{ background: 'var(--color-heat-50)', borderColor: 'var(--color-heat-200)', padding: '1.25rem' }}>
              <h5 style={{ color: 'var(--color-heat-700)', marginBottom: '1rem', textTransform: 'capitalize' }}>
                {activeTab} Thermal Metrics
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                    Total Thermal Resistance (R-value)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heat-700)' }}>
                    {totalR.toFixed(3)} <span className="data-unit">m²·K/W</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                    Includes Rsi + Rse = {rSurface.toFixed(2)} m²·K/W surface resistances
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                    Thermal Transmittance (U-value)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heat-700)' }}>
                    {uValue.toFixed(3)} <span className="data-unit">W/(m²·K)</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-heat-200)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                    Total Construction Thickness
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeLayers.reduce((s, l) => s + l.thickness_mm, 0)} <span className="data-unit">mm</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                    Areal Mass
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-structure-700)' }}>
                    {totalMassKgM2.toFixed(1)} <span className="data-unit">kg/m²</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                    Thermal Capacitance
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-climate-700)' }}>
                    {thermalCapacitanceKJ.toFixed(1)} <span className="data-unit">kJ/(m²·K)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Windows / Glazing Tab */
        <div className="card" style={{ padding: '1.5rem' }}>
          <h5 style={{ marginBottom: '1rem' }}>Glazing & Fenestration Schedule</h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {windows.map((w, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '0.75rem',
                  background: 'var(--color-bg-paper-warm)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Face</div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{w.face}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Dimensions</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{w.width}m × {w.height}m</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Count</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{w.count}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>U-Value</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-heat-600)' }}>{w.u_value} W/m²K</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>SHGC</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-solar-600)' }}>{w.shgc}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total Area</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{(w.width * w.height * w.count).toFixed(2)} m²</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add Layer from Database */}
      {showAddLayerModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '1.5rem', position: 'relative' }}>
            <button
              onClick={() => setShowAddLayerModal(false)}
              className="btn-ghost"
              style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.25rem' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '0.25rem', textTransform: 'capitalize' }}>
              Add Layer to {activeTab}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Select a verified material from the database and specify thickness.
            </p>

            <form onSubmit={handleAddLayerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                  MATERIAL FROM DATABASE
                </label>
                <select
                  className="input"
                  value={selectedMatId}
                  onChange={(e) => setSelectedMatId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {dbMaterials.map((m) => (
                    <option key={m.id || m.name} value={m.id || m.name}>
                      {m.name} ({m.category}) — k = {m.thermal_conductivity_k} W/mK
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                  THICKNESS (mm)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  className="input"
                  value={layerThicknessMm}
                  onChange={(e) => setLayerThicknessMm(parseFloat(e.target.value) || 10)}
                  style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddLayerModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Insert Layer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sequential Navigation */}
      <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1.5rem' }}>
        <Link to={`/scenario/${scenario.id}/materials`} className="btn btn-outline" style={{ padding: '0.75rem 1.5rem' }}>
          ← Back: Materials Library
        </Link>
        <Link 
          to={`/scenario/${scenario.id}/operating`} 
          className="btn btn-primary" 
          style={{ 
            padding: '0.75rem 2rem',
            pointerEvents: wall_layers.length > 0 && roof_layers.length > 0 ? 'auto' : 'none',
            opacity: wall_layers.length > 0 && roof_layers.length > 0 ? 1 : 0.5
          }}
        >
          Next: Operating Conditions →
        </Link>
      </div>
    </div>
  )
}
