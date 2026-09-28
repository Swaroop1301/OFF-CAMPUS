import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Thermometer, MapPin, Clock, MoreHorizontal, RefreshCw, X, CheckCircle2, AlertTriangle, Layers } from 'lucide-react'

interface ProjectItem {
  id: string
  name: string
  description?: string
  location?: {
    name: string
    latitude: number
    longitude: number
    elevation?: number
    climate_zone?: string
  }
  created_at?: string
  updated_at?: string
  scenarios_count?: number
  status?: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New Project Modal State
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newLocName, setNewLocName] = useState('Leh, Ladakh')
  const [newLat, setNewLat] = useState(34.15)
  const [newLon, setNewLon] = useState(77.58)
  const [newElev, setNewElev] = useState(3500)
  const [newZone, setNewZone] = useState('Cold Desert')

  const fetchProjects = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/projects')
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load projects from cloud database`)
      const data = await res.json()
      setProjects(data)
    } catch (err: any) {
      console.error('Projects fetch error:', err)
      setError(err.message || 'Could not connect to PostgreSQL database.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = {
        name: newName,
        description: newDesc,
        location: {
          name: newLocName,
          latitude: newLat,
          longitude: newLon,
          elevation: newElev,
          climate_zone: newZone,
        },
      }
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to create project')
      }
      setShowModal(false)
      setNewName('')
      setNewDesc('')
      fetchProjects()
    } catch (err: any) {
      alert(`Could not create project: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-structure" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Layers size={14} /> PostgreSQL Authority
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Cloud-Backed Project & Scenario Repository
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Engineering Projects
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Persistent shelter projects, scenarios, transient thermal simulations, and ANSYS verification runs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={fetchProjects} disabled={isLoading} style={{ padding: '0.5rem' }}>
            <RefreshCw size={14} className={isLoading ? 'animate-pulse-soft' : ''} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {error && (
        <div className="banner banner-warning" style={{ marginBottom: '1.5rem' }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {isLoading && projects.length === 0 && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <RefreshCw size={24} className="animate-pulse-soft" color="var(--color-structure-500)" style={{ marginBottom: '1rem' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading projects from database…</p>
        </div>
      )}

      {!isLoading && projects.length === 0 && !error && (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', border: '1px dashed var(--color-border)' }}>
          <Layers size={36} color="var(--color-text-muted)" style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Projects Found</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Create your first high-altitude shelter design project backed by PostgreSQL and NASA POWER.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Create First Project
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Link to={`/scenario/${project.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', cursor: 'pointer', padding: '1.25rem 1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <div style={{
                      width: '1.85rem', height: '1.85rem', borderRadius: 'var(--radius-sm)',
                      background: 'linear-gradient(135deg, var(--color-heat-500), var(--color-solar-500))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Thermometer size={14} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{project.name}</h3>
                    <span className="chip chip-climate" style={{ fontSize: '0.65rem' }}>
                      POSTGRES
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                    {project.description || 'Standard high-altitude shelter project.'}
                  </p>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={12} /> {project.location?.name} ({project.location?.latitude?.toFixed(2)}°N, {project.location?.longitude?.toFixed(2)}°E)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} /> {project.updated_at ? new Date(project.updated_at).toLocaleDateString() : 'Active'}
                    </span>
                    <span className="chip" style={{ background: 'var(--color-bg-paper-warm)', color: 'var(--color-text-secondary)', fontSize: '0.65rem' }}>
                      {project.location?.climate_zone || 'Cold Desert'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="btn-ghost" onClick={(e) => e.preventDefault()} style={{ padding: '0.25rem' }}>
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Modal: New Project */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '1.75rem', position: 'relative' }}>
            <button
              onClick={() => setShowModal(false)}
              className="btn-ghost"
              style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.25rem' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', marginBottom: '0.25rem' }}>
              Create New Engineering Project
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Initializes an authoritative PostgreSQL project record with location coordinates and climate parameters.
            </p>

            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>PROJECT TITLE *</label>
                <input
                  required
                  className="input"
                  placeholder="e.g. Nyoma Border Post Thermal Envelope"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>DESCRIPTION</label>
                <textarea
                  rows={2}
                  className="input"
                  placeholder="Operational context, altitude, structural requirements..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>SITE NAME</label>
                  <input
                    className="input"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>CLIMATE ZONE</label>
                  <select
                    className="input"
                    value={newZone}
                    onChange={(e) => setNewZone(e.target.value)}
                  >
                    <option value="Cold Desert">Cold Desert</option>
                    <option value="Cold">Cold</option>
                    <option value="Temperate">Temperate</option>
                    <option value="Hot Arid">Hot Arid</option>
                    <option value="Warm Humid">Warm Humid</option>
                    <option value="Composite">Composite</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>LATITUDE (°N)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={newLat}
                    onChange={(e) => setNewLat(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>LONGITUDE (°E)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={newLon}
                    onChange={(e) => setNewLon(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>ELEVATION (m)</label>
                  <input
                    type="number"
                    step="1"
                    className="input"
                    value={newElev}
                    onChange={(e) => setNewElev(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating in PostgreSQL…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
