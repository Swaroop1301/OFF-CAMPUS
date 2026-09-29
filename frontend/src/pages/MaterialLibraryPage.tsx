import { motion } from 'framer-motion'
import { Search, Plus, RefreshCw, Layers, ShieldCheck, AlertTriangle, BookOpen, X, CheckCircle2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useScenarioStore } from '@/stores/appStore'

interface MaterialItem {
  id: string
  name: string
  category: string
  description?: string
  thermal_conductivity_k: number
  density_rho: number
  specific_heat_cp: number
  emissivity: number
  solar_absorptivity: number
  embodied_carbon?: number
  cost?: number
  units?: string
  source?: string
  reference?: string
  is_custom?: boolean
}

// Category swatch colors matching design system
const CATEGORY_COLORS: Record<string, string> = {
  Masonry: '#A0826D',
  Structure: '#8B8680',
  Finish: '#D0C8BC',
  Insulation: '#B8D4E8',
  Roofing: '#C0C0C0',
  Wood: '#C9A96E',
  Glazing: '#B8D8E8',
  Metal: '#A8A8A8',
  Traditional: '#C4664A',
  BioComposite: '#7EA172',
  Membrane: '#5A6B7C',
}

export default function MaterialLibraryPage() {
  const { scenario } = useScenarioStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Custom Material Creation Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formSuccess, setFormSuccess] = useState(false)
  const [newMat, setNewMat] = useState({
    name: '',
    category: 'Masonry',
    description: '',
    thermal_conductivity_k: 0.5,
    density_rho: 1500,
    specific_heat_cp: 880,
    emissivity: 0.9,
    solar_absorptivity: 0.65,
    embodied_carbon: 0.15,
    cost: 4500,
    reference: 'User Custom Specification',
  })

  const fetchMaterials = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/materials')
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to query material catalog`)
      const data: MaterialItem[] = await res.json()
      setMaterials(data)
    } catch (err: any) {
      console.error('Material retrieval error:', err)
      setError(err.message || 'PostgreSQL Material database connection error')
      setMaterials([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMaterials()
  }, [])

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMat),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'Failed to persist custom material')
      }
      setFormSuccess(true)
      setTimeout(() => {
        setFormSuccess(false)
        setShowAddModal(false)
        fetchMaterials()
      }, 900)
    } catch (err: any) {
      alert(`Could not create material: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const categories = [...new Set(materials.map((m) => m.category))]
  const filtered = materials.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter && m.category !== categoryFilter) return false
    return true
  })

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-structure" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Layers size={14} /> Database-Backed Catalog
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Authoritative Thermophysical Library (IS 3792 / NBC 2016 / ASHRAE)
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Material Library
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            PostgreSQL-persisted thermophysical properties for building envelope simulation and ANSYS CFD conjugate heat transfer.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={15} /> Add Custom Material
          </button>
          <button className="btn btn-outline" onClick={fetchMaterials} disabled={isLoading} title="Refresh materials" style={{ padding: '0.5rem' }}>
            <RefreshCw size={14} className={isLoading ? 'animate-pulse-soft' : ''} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="banner banner-warning" style={{ marginBottom: '1.5rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>DATABASE ERROR:</strong> {error}. Ensure backend FastAPI and PostgreSQL are reachable.
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="input"
            placeholder="Search verified materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          <button className={`btn ${!categoryFilter ? 'btn-primary' : 'btn-outline'}`} onClick={() => setCategoryFilter(null)} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
            All ({materials.length})
          </button>
          {categories.map((c) => (
            <button key={c} className={`btn ${categoryFilter === c ? 'btn-primary' : 'btn-outline'}`} onClick={() => setCategoryFilter(c)} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && materials.length === 0 && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <RefreshCw size={24} className="animate-pulse-soft" color="var(--color-structure-500)" style={{ marginBottom: '1rem' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading verified materials from database…</p>
        </div>
      )}

      {/* Material Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {filtered.map((mat) => (
          <motion.div
            key={mat.id || mat.name}
            className="card"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderLeft: `4px solid ${CATEGORY_COLORS[mat.category] || 'var(--color-structure-400)'}`,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{mat.name}</h4>
                <span className="chip" style={{ fontSize: '0.625rem', background: 'var(--color-bg-paper-warm)', color: 'var(--color-text-secondary)' }}>
                  {mat.category}
                </span>
              </div>
              {mat.description && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  {mat.description}
                </p>
              )}

              {/* Physical Properties Table */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--color-bg-paper-warm)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Conductivity (k)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heat-600)' }}>
                    {mat.thermal_conductivity_k} <span style={{ fontSize: '0.65rem' }}>W/(m·K)</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Density (ρ)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-structure-600)' }}>
                    {mat.density_rho} <span style={{ fontSize: '0.65rem' }}>kg/m³</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Specific Heat (Cp)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-climate-600)' }}>
                    {mat.specific_heat_cp} <span style={{ fontSize: '0.65rem' }}>J/(kg·K)</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Emissivity (ε)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-solar-600)' }}>
                    {mat.emissivity}
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Citation */}
            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <BookOpen size={11} /> {mat.reference || 'Standard Engineering Table'}
              </span>
              {mat.embodied_carbon !== undefined && (
                <span title="Embodied Carbon" style={{ fontFamily: 'var(--font-mono)' }}>
                  {mat.embodied_carbon} kgCO₂e/kg
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal: Add Custom Material */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', position: 'relative' }}>
            <button
              onClick={() => setShowAddModal(false)}
              className="btn-ghost"
              style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.25rem' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', marginBottom: '0.25rem' }}>
              Add Custom Material
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Persist custom thermophysical material to PostgreSQL for transient envelope analysis & ANSYS meshing.
            </p>

            {formSuccess ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <CheckCircle2 size={36} color="var(--color-comfort-600)" style={{ marginBottom: '0.75rem' }} />
                <h4>Material Saved!</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Updated PostgreSQL material catalog.</p>
              </div>
            ) : (
              <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>MATERIAL NAME *</label>
                  <input
                    required
                    className="input"
                    value={newMat.name}
                    placeholder="e.g. Hempcrete Block, Stabilized Earth"
                    onChange={(e) => setNewMat({ ...newMat, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>CATEGORY</label>
                    <select
                      className="input"
                      value={newMat.category}
                      onChange={(e) => setNewMat({ ...newMat, category: e.target.value })}
                    >
                      <option value="Masonry">Masonry</option>
                      <option value="Insulation">Insulation</option>
                      <option value="Traditional">Traditional</option>
                      <option value="Wood">Wood</option>
                      <option value="BioComposite">BioComposite</option>
                      <option value="Finish">Finish</option>
                      <option value="Metal">Metal</option>
                      <option value="Glazing">Glazing</option>
                      <option value="Membrane">Membrane</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>REFERENCE / STANDARD</label>
                    <input
                      className="input"
                      value={newMat.reference}
                      placeholder="e.g. NBC 2016, Manufacturer Datasheet"
                      onChange={(e) => setNewMat({ ...newMat, reference: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>CONDUCTIVITY k [W/(m·K)] *</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      className="input"
                      value={newMat.thermal_conductivity_k}
                      onChange={(e) => setNewMat({ ...newMat, thermal_conductivity_k: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>DENSITY ρ [kg/m³] *</label>
                    <input
                      type="number"
                      step="1"
                      required
                      className="input"
                      value={newMat.density_rho}
                      onChange={(e) => setNewMat({ ...newMat, density_rho: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>SPECIFIC HEAT Cp [J/(kg·K)] *</label>
                    <input
                      type="number"
                      step="1"
                      required
                      className="input"
                      value={newMat.specific_heat_cp}
                      onChange={(e) => setNewMat({ ...newMat, specific_heat_cp: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>EMISSIVITY ε (0–1)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="1.0"
                      className="input"
                      value={newMat.emissivity}
                      onChange={(e) => setNewMat({ ...newMat, emissivity: parseFloat(e.target.value) || 0.9 })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>EMBODIED CARBON (kg CO₂e/kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={newMat.embodied_carbon}
                      onChange={(e) => setNewMat({ ...newMat, embodied_carbon: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>EST. COST (INR / m³)</label>
                    <input
                      type="number"
                      step="50"
                      className="input"
                      value={newMat.cost}
                      onChange={(e) => setNewMat({ ...newMat, cost: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>DESCRIPTION</label>
                  <textarea
                    rows={2}
                    className="input"
                    value={newMat.description}
                    placeholder="Material composition, recommended applications, curing constraints..."
                    onChange={(e) => setNewMat({ ...newMat, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving to Database…' : 'Save Material'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Sequential Navigation */}
      <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1.5rem' }}>
        <Link to={`/scenario/${scenario.id}/geometry`} className="btn btn-outline" style={{ padding: '0.75rem 1.5rem' }}>
          ← Back: Geometry
        </Link>
        <Link to={`/scenario/${scenario.id}/envelope`} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
          Next: Envelope Construction →
        </Link>
      </div>
    </div>
  )
}
