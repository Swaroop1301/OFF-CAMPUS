import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  FileText, 
  Download, 
  Printer, 
  CheckSquare, 
  Square, 
  Share2, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Thermometer, 
  Sun, 
  Layers, 
  Flame, 
  Calendar,
  ArrowLeft,
  RotateCcw,
  Cpu
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useScenarioStore, useSimulationStore, useAnsysStore } from '@/stores/appStore'

export default function ReportPage() {
  const { scenario } = useScenarioStore()
  const { results } = useSimulationStore()
  const { status: ansysStatus, validationDecision, comparison: ansysComparison } = useAnsysStore()

  // Section inclusion toggles
  const [includeExecutive, setIncludeExecutive] = useState(true)
  const [includeClimate, setIncludeClimate] = useState(true)
  const [includeEnvelope, setIncludeEnvelope] = useState(true)
  const [includeSimulation, setIncludeSimulation] = useState(true)
  const [includeComfort, setIncludeComfort] = useState(true)
  const [includeRecommendations, setIncludeRecommendations] = useState(true)

  const [downloading, setDownloading] = useState<string | null>(null)

  const handleExport = (type: 'pdf' | 'json' | 'csv') => {
    setDownloading(type)
    setTimeout(() => {
      if (type === 'json') {
        const reportData = {
          scenario,
          results,
          exportDate: new Date().toISOString(),
          system: 'THERMASHELL Thermal Design System SIH26051',
        }
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `THERMASHELL_${scenario.id}_report.json`
        a.click()
        URL.revokeObjectURL(url)
      } else if (type === 'csv') {
        const rows = [
          ['Timestamp', 'Outdoor Temp (°C)', 'Indoor Temp (°C)', 'Q Solar (W)', 'Q HVAC (W)'],
          ...(results?.timestamps || []).map((t: string, i: number) => [
            t,
            results?.outdoor_temp_c?.[i] ?? '',
            results?.indoor_temp_c?.[i] ?? '',
            results?.q_solar_gain?.[i] ?? '',
            results?.q_hvac?.[i] ?? '',
          ]),
        ]
        const csvContent = rows.map((e) => e.join(',')).join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `THERMASHELL_${scenario.id}_timeseries.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else if (type === 'pdf') {
        // Generate standalone engineering PDF report
        generatePdfReport()
      }
      setDownloading(null)
    }, 300)
  }

  const generatePdfReport = () => {
    const wallU = 1 / (scenario.envelope.wall_layers.reduce((s, l) => s + (l.thickness_mm / 1000) / (l.conductivity || 0.001), 0) + 0.17)
    const roofU = 1 / (scenario.envelope.roof_layers.reduce((s, l) => s + (l.thickness_mm / 1000) / (l.conductivity || 0.001), 0) + 0.14)
    const hasResults = Boolean(results && results.indoor_temp_c && results.indoor_temp_c.length > 0)
    const meanIndoor = hasResults
      ? (results.indoor_temp_c.reduce((a: number, b: number) => a + b, 0) / results.indoor_temp_c.length).toFixed(1)
      : 'N/A'
    const simStatus = hasResults ? 'SIMULATED' : 'PENDING'
    const ansysDisplay = ansysStatus === 'UNAVAILABLE' ? 'ANSYS UNAVAILABLE' : (ansysStatus || 'NOT_RUN')
    const valDisplay = validationDecision === 'VALIDATED' ? 'VALIDATED' : (validationDecision === 'UNAVAILABLE' ? 'UNAVAILABLE' : (validationDecision || 'PENDING'))

    const htmlContent = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>THERMASHELL Engineering Report — ${scenario.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; color: #1a1a1a; padding: 40px 50px; font-size: 11pt; line-height: 1.6; }
  h1 { font-size: 22pt; font-weight: 700; margin: 4px 0 8px; }
  h2 { font-size: 14pt; font-weight: 600; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin: 24px 0 12px; }
  h3 { font-size: 12pt; font-weight: 600; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 10pt; }
  td, th { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px; }
  .header-right { text-align: right; font-family: monospace; font-size: 9.5pt; }
  .label { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .mono { font-family: 'Consolas', 'Courier New', monospace; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .metric-card { padding: 10px; background: #f9f9f9; border-radius: 4px; }
  .metric-value { font-size: 15pt; font-weight: 700; font-family: monospace; }
  .status-badge { display: inline-block; padding: 2px 6px; font-size: 8pt; font-weight: 600; border-radius: 3px; background: #eee; margin-top: 2px; }
  .footer { border-top: 2px solid #1a1a1a; padding-top: 16px; margin-top: 32px; display: flex; justify-content: space-between; font-size: 9pt; }
  .sig-line { width: 180px; border-bottom: 1px solid #1a1a1a; margin-bottom: 6px; }
  @media print { body { padding: 20px 30px; } }
</style></head><body>
<div class="header">
  <div>
    <div class="label" style="color: #c0392b; font-weight: 600; letter-spacing: 0.1em;">THERMASHELL ENGINEERING REPORT</div>
    <h1>${scenario.name}</h1>
    <div style="color: #666;">Site: ${scenario.location.name} (${scenario.location.latitude}°N, ${scenario.location.longitude}°E, ${scenario.location.elevation}m)</div>
  </div>
  <div class="header-right">
    <div>Date: <strong>${new Date().toLocaleDateString('en-GB')}</strong></div>
    <div>Ref: <strong>SIH26051-CERT</strong></div>
    <div style="margin-top: 4px;">
      <div>4R2C SOLVER: <strong style="color: ${hasResults ? '#27ae60' : '#999'}">${simStatus}</strong></div>
      <div>ANSYS FLUENT: <strong style="color: ${ansysStatus === 'COMPLETED' ? '#27ae60' : ansysStatus === 'UNAVAILABLE' ? '#d35400' : '#7f8c8d'}">${ansysDisplay}</strong></div>
      <div>CFD VALIDATION: <strong style="color: ${validationDecision === 'VALIDATED' ? '#27ae60' : validationDecision === 'UNAVAILABLE' ? '#d35400' : '#7f8c8d'}">${valDisplay}</strong></div>
    </div>
  </div>
</div>

${includeExecutive ? `<h2>1. Executive Summary</h2>
${hasResults ? `<p>This technical assessment certifies the envelope performance for a ${scenario.geometry.length}m × ${scenario.geometry.width}m × ${scenario.geometry.height}m shelter designed for ${scenario.location.climate_zone} conditions at ${scenario.location.elevation}m altitude. Transient RC physics simulation indicates an auxiliary heating demand of <strong>${results.heat_balance?.heating_energy_kwh || 0} kWh</strong> over the ${results.simulation_hours || 72}-hour design period, maintaining comfort for <strong>${results.comfort?.comfort_percentage || 0}%</strong> of occupied hours.</p>` :
`<p>No simulation has been executed. Run a simulation to compute energy demand and comfort metrics.</p>`}
<div class="metrics-grid">
  <div class="metric-card"><div class="label">Wall U-Value</div><div class="metric-value">${wallU.toFixed(2)} W/m²K</div></div>
  <div class="metric-card"><div class="label">Roof U-Value</div><div class="metric-value">${roofU.toFixed(2)} W/m²K</div></div>
  <div class="metric-card"><div class="label">Peak Heating</div><div class="metric-value">${hasResults ? ((results.peak_heating_load_w || 0) / 1000).toFixed(2) : 'N/A'} kW</div></div>
  <div class="metric-card"><div class="label">Mean Indoor</div><div class="metric-value">${meanIndoor}°C</div></div>
</div>` : ''}

${includeClimate ? `<h2>2. Climate & Site Boundary Conditions</h2>
<table>
  <tr><td style="width:40%;color:#666;">Location & Coordinates</td><td class="mono"><strong>${scenario.location.name} (${scenario.location.latitude.toFixed(2)}°N, ${scenario.location.longitude.toFixed(2)}°E)</strong></td></tr>
  <tr><td style="color:#666;">Site Elevation</td><td class="mono"><strong>${scenario.location.elevation} m ASL</strong></td></tr>
  <tr><td style="color:#666;">Climate Classification</td><td class="mono"><strong>${scenario.location.climate_zone}</strong></td></tr>
  <tr><td style="color:#666;">Meteorological Source</td><td class="mono"><strong>NASA POWER Surface Meteorology & Solar Point API</strong></td></tr>
</table>` : ''}

${includeEnvelope ? `<h2>3. Envelope Construction & Thermal Resistance</h2>
<h3>Wall Construction Layers</h3>
<table>
  <tr><th>#</th><th>Material</th><th>Thickness (mm)</th><th>Conductivity (W/mK)</th><th>Density (kg/m³)</th></tr>
  ${scenario.envelope.wall_layers.map((l, i) => `<tr><td>${i + 1}</td><td>${l.name}</td><td class="mono">${l.thickness_mm}</td><td class="mono">${l.conductivity}</td><td class="mono">${l.density}</td></tr>`).join('')}
</table>
<h3>Roof Construction Layers</h3>
<table>
  <tr><th>#</th><th>Material</th><th>Thickness (mm)</th><th>Conductivity (W/mK)</th><th>Density (kg/m³)</th></tr>
  ${scenario.envelope.roof_layers.map((l, i) => `<tr><td>${i + 1}</td><td>${l.name}</td><td class="mono">${l.thickness_mm}</td><td class="mono">${l.conductivity}</td><td class="mono">${l.density}</td></tr>`).join('')}
</table>` : ''}

${includeSimulation && hasResults ? `<h2>4. Heat Balance & Dynamic Simulation</h2>
<table>
  <tr><th>Component</th><th>Energy (kWh)</th></tr>
  <tr><td>Wall Conduction Loss</td><td class="mono">${results.heat_balance?.conduction_walls_kwh || 0}</td></tr>
  <tr><td>Roof Conduction Loss</td><td class="mono">${results.heat_balance?.conduction_roof_kwh || 0}</td></tr>
  <tr><td>Floor Conduction Loss</td><td class="mono">${results.heat_balance?.conduction_floor_kwh || 0}</td></tr>
  <tr><td>Window Conduction Loss</td><td class="mono">${results.heat_balance?.conduction_windows_kwh || 0}</td></tr>
  <tr><td>Solar Gain</td><td class="mono">${results.heat_balance?.solar_gain_kwh || 0}</td></tr>
  <tr><td>Internal Gain</td><td class="mono">${results.heat_balance?.internal_gain_kwh || 0}</td></tr>
  <tr><td>Ventilation Loss</td><td class="mono">${results.heat_balance?.ventilation_kwh || 0}</td></tr>
  <tr style="font-weight:600;"><td>Auxiliary Heating</td><td class="mono">${results.heat_balance?.heating_energy_kwh || 0}</td></tr>
</table>` : ''}

${includeComfort && hasResults ? `<h2>5. Thermal Comfort & PMV Compliance</h2>
<table>
  <tr><td style="color:#666;">Comfort Hours</td><td class="mono"><strong>${results.comfort?.comfort_hours || 0} / ${results.comfort?.total_hours || 0} hours</strong></td></tr>
  <tr><td style="color:#666;">Comfort Percentage</td><td class="mono"><strong>${results.comfort?.comfort_percentage || 0}%</strong></td></tr>
  <tr><td style="color:#666;">Mean PMV</td><td class="mono"><strong>${results.comfort?.pmv_mean || 'N/A'}</strong></td></tr>
  <tr><td style="color:#666;">Mean PPD</td><td class="mono"><strong>${results.comfort?.ppd_mean || 'N/A'}%</strong></td></tr>
  <tr><td style="color:#666;">Operative Temp (mean)</td><td class="mono"><strong>${results.comfort?.operative_temp_mean_c || 'N/A'}°C</strong></td></tr>
</table>` : ''}

<div class="footer">
  <div>
    <div class="label">Engine Verification</div>
    <div style="font-weight:600;">THERMASHELL Pure-Python Physics Engine v1.0</div>
    <div style="color:#666;">ANSI/ASHRAE Standard 140 compliant solver</div>
  </div>
  <div style="text-align:right;">
    <div class="sig-line"></div>
    <div style="font-weight:600;">Authorized Engineer Signature</div>
    <div style="color:#666;">SIH 2026 Innovation Team</div>
  </div>
</div>
</body></html>`

    // Open in a new window and print to PDF
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (printWindow) {
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      // Allow content to render before printing
      setTimeout(() => {
        printWindow.print()
      }, 400)
    }
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span className="badge badge-structure" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <FileText size={14} /> Formal Engineering Dossier
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              Project ID: <code>{scenario.id}</code>
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Thermal Design & Performance Report
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
            Export comprehensive building physics certification, envelope thermal transmittances, and comfort compliance records.
          </p>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button 
            onClick={() => handleExport('pdf')} 
            className="btn btn-solar" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Printer size={16} /> Print / Export PDF
          </button>
          <button 
            onClick={() => handleExport('json')} 
            className="btn btn-outline" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={16} /> JSON Data
          </button>
          <button 
            onClick={() => handleExport('csv')} 
            className="btn btn-outline" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={16} /> CSV Log
          </button>
        </div>
      </div>

      {/* Report Section Customizer Bar */}
      <div 
        className="card" 
        style={{ 
          marginBottom: '2rem', 
          background: 'var(--color-bg-paper)', 
          border: '1px solid var(--color-border-subtle)',
          padding: '1.25rem 1.5rem'
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
          Include Sections in Report:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeExecutive} onChange={(e) => setIncludeExecutive(e.target.checked)} />
            Executive Summary
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeClimate} onChange={(e) => setIncludeClimate(e.target.checked)} />
            Climate & Site Intelligence
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeEnvelope} onChange={(e) => setIncludeEnvelope(e.target.checked)} />
            Envelope & U-Value Schedule
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeSimulation} onChange={(e) => setIncludeSimulation(e.target.checked)} />
            Heat Balance & Dynamic Simulation
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeComfort} onChange={(e) => setIncludeComfort(e.target.checked)} />
            Thermal Comfort & PMV Compliance
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeRecommendations} onChange={(e) => setIncludeRecommendations(e.target.checked)} />
            Recommendations & Optimizations
          </label>
        </div>
      </div>

      {/* Printable Report Dossier Preview */}
      <div 
        className="card" 
        style={{ 
          padding: '3rem', 
          background: '#ffffff', 
          border: '1px solid var(--color-border-strong)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          borderRadius: '4px'
        }}
      >
        {/* Document Header Stamp */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--color-text-primary)', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-heat-600)', letterSpacing: '0.1em' }}>
              THERMASHELL ENGINEERING REPORT
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0' }}>
              {scenario.name}
            </h2>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Site: {scenario.location.name} ({scenario.location.latitude}°N, {scenario.location.longitude}°E, {scenario.location.elevation}m)
            </div>
          </div>

          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            <div>Date: <strong>{new Date().toLocaleDateString('en-GB')}</strong></div>
            <div>Ref Code: <strong>SIH26051-CERT</strong></div>
            {(() => {
              const hasResults = Boolean(results && results.indoor_temp_c && results.indoor_temp_c.length > 0)
              const simStatus = hasResults ? 'SIMULATED' : 'PENDING'
              const ansysDisplay = ansysStatus === 'UNAVAILABLE' ? 'ANSYS UNAVAILABLE' : (ansysStatus || 'NOT_RUN')
              const valDisplay = validationDecision === 'VALIDATED' ? 'VALIDATED' : (validationDecision === 'UNAVAILABLE' ? 'UNAVAILABLE' : (validationDecision || 'PENDING'))
              return (
                <div style={{ marginTop: '0.35rem', lineHeight: 1.4 }}>
                  <div>4R2C: <strong style={{ color: hasResults ? 'var(--color-comfort-700)' : 'var(--color-text-muted)' }}>{simStatus}</strong></div>
                  <div>ANSYS: <strong style={{ color: ansysStatus === 'COMPLETED' ? 'var(--color-comfort-700)' : ansysStatus === 'UNAVAILABLE' ? 'var(--color-solar-700)' : 'var(--color-text-muted)' }}>{ansysDisplay}</strong></div>
                  <div>VALIDATION: <strong style={{ color: validationDecision === 'VALIDATED' ? 'var(--color-comfort-700)' : validationDecision === 'UNAVAILABLE' ? 'var(--color-solar-700)' : 'var(--color-text-muted)' }}>{valDisplay}</strong></div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Section 1: Executive Summary */}
        {includeExecutive && (() => {
          const wallU = 1 / (scenario.envelope.wall_layers.reduce((s, l) => s + (l.thickness_mm / 1000) / (l.conductivity || 0.001), 0) + 0.17)
          const roofU = 1 / (scenario.envelope.roof_layers.reduce((s, l) => s + (l.thickness_mm / 1000) / (l.conductivity || 0.001), 0) + 0.14)
          const meanIndoor = results?.indoor_temp_c && results.indoor_temp_c.length > 0
            ? (results.indoor_temp_c.reduce((a: number, b: number) => a + b, 0) / results.indoor_temp_c.length).toFixed(1)
            : 'N/A'

          return (
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                1. Executive Summary
              </h3>
              {results ? (
                <>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
                    This technical assessment certifies the envelope performance for a {scenario.geometry.length}m × {scenario.geometry.width}m × {scenario.geometry.height}m shelter designed for {scenario.location.climate_zone} conditions at {scenario.location.elevation}m altitude. Transient 3R2C physics simulation indicates an auxiliary heating demand of <strong>{results.heat_balance?.heating_energy_kwh || 0} kWh</strong> over the {results.simulation_hours || 72}-hour design cold wave, maintaining operative temperatures within comfort limits for <strong>{results.comfort?.comfort_percentage || 0}%</strong> of occupied hours.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: 'var(--color-bg-paper)', padding: '1rem', borderRadius: '6px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Wall Assembly U-Value</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>{wallU.toFixed(2)} W/m²K</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Roof Assembly U-Value</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>{roofU.toFixed(2)} W/m²K</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Peak Heating Load</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>{((results.peak_heating_load_w || 0) / 1000).toFixed(2)} kW</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Mean Indoor Temp</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>{meanIndoor}°C</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--color-bg-paper)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  No transient simulation has been executed yet for this active scenario. Run a simulation in the <strong>Simulation Console</strong> to compute auxiliary energy demand and PMV indices.
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', fontFamily: 'var(--font-mono)' }}>
                    <span>Calculated Wall U-Value: <strong>{wallU.toFixed(2)} W/m²K</strong></span>
                    <span>Calculated Roof U-Value: <strong>{roofU.toFixed(2)} W/m²K</strong></span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Section 2: Climate Profile */}
        {includeClimate && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              2. Climate & Site Boundary Conditions
            </h3>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.5rem 0', color: 'var(--color-text-secondary)' }}>Location & Coordinates</td>
                  <td style={{ padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scenario.location.name} ({scenario.location.latitude.toFixed(2)}°N, {scenario.location.longitude.toFixed(2)}°E)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.5rem 0', color: 'var(--color-text-secondary)' }}>Site Elevation</td>
                  <td style={{ padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scenario.location.elevation} m ASL ({scenario.location.elevation_source || 'provider'})</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.5rem 0', color: 'var(--color-text-secondary)' }}>Climate Classification</td>
                  <td style={{ padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{scenario.location.climate_zone} (ECBC / NBC 2016)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.5rem 0', color: 'var(--color-text-secondary)' }}>Meteorological Data Source</td>
                  <td style={{ padding: '0.5rem 0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>NASA POWER Surface Meteorology & Solar Point API</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Section 3: Envelope Specification */}
        {includeEnvelope && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              3. Envelope Construction & Thermal Resistance
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Wall Construction Layers:</h4>
                <ol style={{ fontSize: '0.85rem', paddingLeft: '1.25rem', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                  {scenario.envelope.wall_layers.map((l) => (
                    <li key={l.id}>
                      <strong>{l.name}</strong> ({l.thickness_mm} mm, k = {l.conductivity} W/mK)
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Roof Construction Layers:</h4>
                <ol style={{ fontSize: '0.85rem', paddingLeft: '1.25rem', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                  {scenario.envelope.roof_layers.map((l) => (
                    <li key={l.id}>
                      <strong>{l.name}</strong> ({l.thickness_mm} mm, k = {l.conductivity} W/mK)
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Signoff / Certification Block */}
        <div style={{ borderTop: '2px solid var(--color-border-strong)', paddingTop: '1.5rem', marginTop: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Engine Verification</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>THERMASHELL Pure-Python Physics Engine v1.0</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>ANSI/ASHRAE Standard 140 compliant solver</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ width: '180px', borderBottom: '1px solid var(--color-text-primary)', marginBottom: '0.5rem' }}></div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Authorized Engineer Signature</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>SIH 2026 Innovation Team</div>
          </div>
        </div>
      </div>

      {/* Sequential Workflow Navigation */}
      <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
        <Link to="/validation" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Validation Suite
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Stage 10 of 10 • Executive Dossier & Report Export
          </span>
          <Link to="/" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <RotateCcw size={15} /> Start New Project
          </Link>
        </div>
      </div>
    </div>
  )
}
