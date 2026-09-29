import { create } from 'zustand'

/* ══════════════════════════════════════════════════════════════════════
   App-level UI state
   ══════════════════════════════════════════════════════════════════════ */

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  scrollProgress: number
  setScrollProgress: (progress: number) => void
  activeWizardStep: number
  setActiveWizardStep: (step: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  scrollProgress: 0,
  setScrollProgress: (progress) => set({ scrollProgress: progress }),
  activeWizardStep: 0,
  setActiveWizardStep: (step) => set({ activeWizardStep: step }),
}))

/* ══════════════════════════════════════════════════════════════════════
   Scenario state — wizard data, current project
   ══════════════════════════════════════════════════════════════════════ */

export interface ScenarioLocation {
  name: string
  latitude: number
  longitude: number
  elevation: number
  climate_zone: string
  city?: string
  district?: string
  state?: string
  country?: string
  timezone?: string
  elevation_source?: string
}

export interface ScenarioGeometry {
  length: number
  width: number
  height: number
  roof_type: string
  roof_pitch: number
  orientation: number
}

export interface MaterialLayerData {
  id: string
  name: string
  thickness_mm: number
  conductivity: number
  density: number
  specific_heat: number
}

export interface EnvelopeData {
  wall_layers: MaterialLayerData[]
  roof_layers: MaterialLayerData[]
  floor_layers: MaterialLayerData[]
  windows: { face: string; width: number; height: number; count: number; u_value: number; shgc: number }[]
}

export interface OperatingData {
  occupants: number
  metabolic_rate: number
  internal_gains: number
  target_temp: number
  comfort_band: number
  hvac_mode: string
  ach_natural: number
  ach_infiltration: number
}

export interface ScenarioData {
  id: string
  name: string
  location: ScenarioLocation
  geometry: ScenarioGeometry
  envelope: EnvelopeData
  operating: OperatingData
  lastSaved: string | null
}

const DEFAULT_LOCATION: ScenarioLocation = {
  name: 'Leh, Ladakh',
  latitude: 34.15,
  longitude: 77.58,
  elevation: 3500,
  climate_zone: 'Cold Desert',
}

const DEFAULT_GEOMETRY: ScenarioGeometry = {
  length: 6,
  width: 4,
  height: 3,
  roof_type: 'gable',
  roof_pitch: 15,
  orientation: 180,
}

const DEFAULT_ENVELOPE: EnvelopeData = {
  wall_layers: [
    { id: '1', name: 'Cement Plaster', thickness_mm: 15, conductivity: 0.7, density: 1300, specific_heat: 840 },
    { id: '2', name: 'Stone Masonry', thickness_mm: 300, conductivity: 1.5, density: 2500, specific_heat: 900 },
    { id: '3', name: 'EPS Insulation', thickness_mm: 100, conductivity: 0.035, density: 25, specific_heat: 1400 },
    { id: '4', name: 'Cement Plaster', thickness_mm: 15, conductivity: 0.7, density: 1300, specific_heat: 840 },
  ],
  roof_layers: [
    { id: '5', name: 'Metal Sheet', thickness_mm: 2, conductivity: 50, density: 7800, specific_heat: 500 },
    { id: '6', name: 'XPS Insulation', thickness_mm: 120, conductivity: 0.034, density: 35, specific_heat: 1400 },
    { id: '7', name: 'Plywood', thickness_mm: 18, conductivity: 0.13, density: 550, specific_heat: 1700 },
  ],
  floor_layers: [
    { id: '8', name: 'Concrete', thickness_mm: 150, conductivity: 1.4, density: 2300, specific_heat: 880 },
    { id: '9', name: 'XPS Insulation', thickness_mm: 80, conductivity: 0.034, density: 35, specific_heat: 1400 },
  ],
  windows: [
    { face: 'south', width: 1.2, height: 1.0, count: 2, u_value: 2.8, shgc: 0.65 },
  ],
}

const DEFAULT_OPERATING: OperatingData = {
  occupants: 4,
  metabolic_rate: 100,
  internal_gains: 200,
  target_temp: 18,
  comfort_band: 2,
  hvac_mode: 'heated',
  ach_natural: 0.3,
  ach_infiltration: 0.2,
}

interface ScenarioState {
  scenario: ScenarioData
  updateLocation: (loc: Partial<ScenarioLocation>) => void
  updateGeometry: (geo: Partial<ScenarioGeometry>) => void
  updateEnvelope: (env: Partial<EnvelopeData>) => void
  updateOperating: (op: Partial<OperatingData>) => void
  setScenarioName: (name: string) => void
  applyPreset: (preset: string) => void
  resetScenario: () => void
}

// Location presets for smart defaults
const PRESETS: Record<string, Partial<ScenarioData>> = {
  leh: {
    location: { ...DEFAULT_LOCATION },
    geometry: { ...DEFAULT_GEOMETRY },
    envelope: { ...DEFAULT_ENVELOPE },
    operating: { ...DEFAULT_OPERATING },
  },
  jaisalmer: {
    location: { name: 'Jaisalmer, Rajasthan', latitude: 26.92, longitude: 70.9, elevation: 225, climate_zone: 'Hot Arid' },
    geometry: { length: 5, width: 4, height: 3.5, roof_type: 'flat', roof_pitch: 5, orientation: 0 },
    envelope: {
      wall_layers: [
        { id: '1', name: 'Lime Plaster', thickness_mm: 20, conductivity: 0.7, density: 1600, specific_heat: 840 },
        { id: '2', name: 'Sandstone', thickness_mm: 350, conductivity: 1.7, density: 2200, specific_heat: 920 },
        { id: '3', name: 'Lime Plaster', thickness_mm: 20, conductivity: 0.7, density: 1600, specific_heat: 840 },
      ],
      roof_layers: [
        { id: '5', name: 'Lime Concrete', thickness_mm: 100, conductivity: 0.7, density: 1800, specific_heat: 880 },
        { id: '6', name: 'Mud Phuska', thickness_mm: 150, conductivity: 0.52, density: 1622, specific_heat: 880 },
        { id: '7', name: 'Brick Tiles', thickness_mm: 25, conductivity: 0.8, density: 1900, specific_heat: 880 },
      ],
      floor_layers: [
        { id: '8', name: 'Sandstone', thickness_mm: 200, conductivity: 1.7, density: 2200, specific_heat: 920 },
      ],
      windows: [
        { face: 'north', width: 1.0, height: 0.8, count: 2, u_value: 5.7, shgc: 0.76 },
      ],
    },
    operating: { occupants: 4, metabolic_rate: 100, internal_gains: 150, target_temp: 26, comfort_band: 2.5, hvac_mode: 'cooled', ach_natural: 0.5, ach_infiltration: 0.3 },
  },
}

export const useScenarioStore = create<ScenarioState>((set) => ({
  scenario: {
    id: 'demo-leh-001',
    name: 'Leh Winter High-Altitude Shelter',
    location: { ...DEFAULT_LOCATION },
    geometry: { ...DEFAULT_GEOMETRY },
    envelope: { ...DEFAULT_ENVELOPE },
    operating: { ...DEFAULT_OPERATING },
    lastSaved: null,
  },
  updateLocation: (loc) =>
    set((s) => ({ scenario: { ...s.scenario, location: { ...s.scenario.location, ...loc }, lastSaved: new Date().toISOString() } })),
  updateGeometry: (geo) =>
    set((s) => ({ scenario: { ...s.scenario, geometry: { ...s.scenario.geometry, ...geo }, lastSaved: new Date().toISOString() } })),
  updateEnvelope: (env) =>
    set((s) => ({ scenario: { ...s.scenario, envelope: { ...s.scenario.envelope, ...env }, lastSaved: new Date().toISOString() } })),
  updateOperating: (op) =>
    set((s) => ({ scenario: { ...s.scenario, operating: { ...s.scenario.operating, ...op }, lastSaved: new Date().toISOString() } })),
  setScenarioName: (name) => set((s) => ({ scenario: { ...s.scenario, name } })),
  applyPreset: (preset) => {
    const p = PRESETS[preset]
    if (p) set((s) => ({ scenario: { ...s.scenario, ...p, lastSaved: new Date().toISOString() } }))
  },
  resetScenario: () =>
    set({
      scenario: {
        id: 'demo-leh-001', name: 'Leh Winter High-Altitude Shelter',
        location: { ...DEFAULT_LOCATION }, geometry: { ...DEFAULT_GEOMETRY },
        envelope: { ...DEFAULT_ENVELOPE }, operating: { ...DEFAULT_OPERATING },
        lastSaved: null,
      },
    }),
}))

/* ══════════════════════════════════════════════════════════════════════
   Simulation state
   ══════════════════════════════════════════════════════════════════════ */

export interface SimulationStage {
  name: string
  label: string
  progress: number
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface SimulationState {
  jobId: string | null
  status: 'idle' | 'running' | 'completed' | 'failed'
  stages: SimulationStage[]
  overallProgress: number
  results: any | null
  startSimulation: () => void
  updateStage: (name: string, update: Partial<SimulationStage>) => void
  setResults: (results: any) => void
  resetSimulation: () => void
}

const DEFAULT_STAGES: SimulationStage[] = [
  { name: 'climate', label: 'Climate Data', progress: 0, status: 'pending' },
  { name: 'solar', label: 'Solar Model', progress: 0, status: 'pending' },
  { name: 'thermal', label: 'Thermal Network', progress: 0, status: 'pending' },
  { name: 'ventilation', label: 'Ventilation', progress: 0, status: 'pending' },
  { name: 'comfort', label: 'Comfort Analysis', progress: 0, status: 'pending' },
  { name: 'results', label: 'Results', progress: 0, status: 'pending' },
]

export const useSimulationStore = create<SimulationState>((set, get) => ({
  jobId: null,
  status: 'idle',
  stages: DEFAULT_STAGES.map((s) => ({ ...s })),
  overallProgress: 0,
  results: null,

  startSimulation: () => {
    const scenarioState = useScenarioStore.getState().scenario
    const jobId = `sim-${Date.now()}`

    set({
      jobId,
      status: 'running',
      stages: DEFAULT_STAGES.map((s) => ({ ...s })),
      overallProgress: 0,
      results: null,
    })

    // Build the payload from the current scenario in Zustand
    const payload = buildSimulationPayload(scenarioState)

    // Map WebSocket stage names to UI stage names
    const WS_STAGE_MAP: Record<string, { uiStages: string[]; progress: number }> = {
      CLIMATE_INGEST: { uiStages: ['climate'], progress: 15 },
      RC_MATRIX_BUILD: { uiStages: ['solar', 'thermal'], progress: 35 },
      SOLVER_INTEGRATION: { uiStages: ['thermal', 'ventilation'], progress: 75 },
      COMFORT_EVAL: { uiStages: ['comfort'], progress: 90 },
      CONVERGENCE_CHECK: { uiStages: ['results'], progress: 100 },
    }

    // Try WebSocket first, fall back to HTTP POST
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/simulations/ws`

    let wsConnected = false

    try {
      const ws = new WebSocket(wsUrl)

      const wsTimeout = setTimeout(() => {
        if (!wsConnected) {
          ws.close()
          runHttpFallback(payload, set)
        }
      }, 3000)

      ws.onopen = () => {
        wsConnected = true
        clearTimeout(wsTimeout)
        ws.send(JSON.stringify(payload))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'PROGRESS') {
            const mapping = WS_STAGE_MAP[msg.stage]
            if (mapping) {
              set((s) => {
                const newStages = s.stages.map((st) => {
                  if (mapping.uiStages.includes(st.name)) {
                    return { ...st, status: 'running' as const, progress: msg.progress }
                  }
                  // Mark earlier stages as completed
                  const stageOrder = ['climate', 'solar', 'thermal', 'ventilation', 'comfort', 'results']
                  const currentIdx = Math.min(...mapping.uiStages.map((u) => stageOrder.indexOf(u)))
                  const thisIdx = stageOrder.indexOf(st.name)
                  if (thisIdx < currentIdx && st.status !== 'completed') {
                    return { ...st, status: 'completed' as const, progress: 100 }
                  }
                  return st
                })
                return { stages: newStages, overallProgress: mapping.progress }
              })
            }
          } else if (msg.type === 'COMPLETED') {
            set((s) => ({
              stages: s.stages.map((st) => ({ ...st, status: 'completed' as const, progress: 100 })),
              overallProgress: 100,
              results: msg.result,
              status: 'completed',
            }))
            ws.close()
          } else if (msg.type === 'ERROR') {
            console.error('Simulation error from backend:', msg.error)
            set({ status: 'failed' })
            ws.close()
          }
        } catch (parseErr) {
          console.error('Failed to parse WS message:', parseErr)
        }
      }

      ws.onerror = () => {
        if (!wsConnected) {
          clearTimeout(wsTimeout)
          runHttpFallback(payload, set)
        }
      }

      ws.onclose = () => {
        // If never completed successfully, the state is already set
      }
    } catch {
      runHttpFallback(payload, set)
    }
  },

  updateStage: (name, update) =>
    set((s) => ({
      stages: s.stages.map((st) => (st.name === name ? { ...st, ...update } : st)),
    })),

  setResults: (results) => set({ results }),
  resetSimulation: () => set({ jobId: null, status: 'idle', stages: DEFAULT_STAGES.map((s) => ({ ...s })), overallProgress: 0, results: null }),
}))

/**
 * Build the RunSimulationPayload from the Zustand ScenarioData.
 * Maps Zustand store fields to backend API contract.
 */
function buildSimulationPayload(scenario: ScenarioData) {
  return {
    scenario_id: scenario.id,
    length_m: scenario.geometry.length,
    width_m: scenario.geometry.width,
    height_m: scenario.geometry.height,
    roof_pitch_deg: scenario.geometry.roof_pitch,
    orientation_deg: scenario.geometry.orientation,
    elevation_m: scenario.location.elevation,
    wall_layers: scenario.envelope.wall_layers.map((l) => ({
      name: l.name,
      thickness_mm: l.thickness_mm,
      conductivity: l.conductivity,
      density: l.density,
      specific_heat: l.specific_heat,
    })),
    roof_layers: scenario.envelope.roof_layers.map((l) => ({
      name: l.name,
      thickness_mm: l.thickness_mm,
      conductivity: l.conductivity,
      density: l.density,
      specific_heat: l.specific_heat,
    })),
    floor_layers: scenario.envelope.floor_layers.map((l) => ({
      name: l.name,
      thickness_mm: l.thickness_mm,
      conductivity: l.conductivity,
      density: l.density,
      specific_heat: l.specific_heat,
    })),
    openings: scenario.envelope.windows.map((w) => ({
      name: `Window (${w.face})`,
      width_m: w.width,
      height_m: w.height,
      wall_face: w.face,
      u_value: w.u_value,
      shgc: w.shgc,
      count: w.count,
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
  }
}

/**
 * HTTP POST fallback when WebSocket is unavailable.
 * Animates UI progress stages progressively, then calls the sync endpoint.
 */
async function runHttpFallback(
  payload: ReturnType<typeof buildSimulationPayload>,
  set: (fn: (s: SimulationState) => Partial<SimulationState>) => void
) {
  const uiStages = ['climate', 'solar', 'thermal', 'ventilation', 'comfort', 'results']

  // Animate stages while we wait for the HTTP response
  const animationPromise = (async () => {
    for (let i = 0; i < uiStages.length - 1; i++) {
      await new Promise((r) => setTimeout(r, 400))
      set((s) => {
        const newStages = s.stages.map((st) => {
          if (st.name === uiStages[i]) return { ...st, status: 'running' as const, progress: 50 }
          return st
        })
        return { stages: newStages, overallProgress: ((i + 1) / uiStages.length) * 100 }
      })
      await new Promise((r) => setTimeout(r, 300))
      set((s) => {
        const newStages = s.stages.map((st) => {
          if (st.name === uiStages[i]) return { ...st, status: 'completed' as const, progress: 100 }
          return st
        })
        return { stages: newStages }
      })
    }
  })()

  try {
    const response = await fetch('/api/v1/simulations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Simulation HTTP error ${response.status}: ${errText}`)
    }

    const result = await response.json()
    await animationPromise // Ensure animation finishes before showing results

    set((s) => ({
      stages: s.stages.map((st) => ({ ...st, status: 'completed' as const, progress: 100 })),
      overallProgress: 100,
      results: result,
      status: 'completed',
    }))
  } catch (err) {
    console.error('HTTP simulation fallback failed:', err)
    await animationPromise
    set(() => ({ status: 'failed' }))
  }
}
