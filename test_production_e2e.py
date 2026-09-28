import urllib.request
import json
import sys

def test_endpoint(name, url, method='GET', payload=None):
    try:
        req = urllib.request.Request(url, method=method)
        if payload:
            req.add_header('Content-Type', 'application/json')
            data = json.dumps(payload).encode('utf-8')
        else:
            data = None
        with urllib.request.urlopen(req, data=data, timeout=12) as resp:
            body = resp.read()
            status = resp.status
            try:
                res_json = json.loads(body)
                preview = str(res_json)[:70].replace('\n', ' ')
                print(f"[PASS] {name} -> HTTP {status} | {preview}...")
            except Exception:
                print(f"[PASS] {name} -> HTTP {status} | bytes: {len(body)}")
            return True
    except Exception as e:
        print(f"[FAIL] {name} -> Error: {e}")
        return False

if __name__ == '__main__':
    print("=== VERIFYING THERMASHELL BACKEND & FRONTEND PRODUCTION SERVICES ===")
    results = [
        test_endpoint('1. Frontend Dev Server', 'http://localhost:5173/'),
        test_endpoint('2. Backend Health', 'http://localhost:8000/health'),
        test_endpoint('3. Projects List', 'http://localhost:8000/api/v1/projects'),
        test_endpoint('4. Materials Catalog', 'http://localhost:8000/api/v1/materials'),
        test_endpoint('5. Location Context', 'http://localhost:8000/api/v1/locations/context?lat=34.15&lon=77.58'),
        test_endpoint('6. Location Search', 'http://localhost:8000/api/v1/locations/search?q=Leh'),
        test_endpoint('7. Climate NASA POWER', 'http://localhost:8000/api/v1/climate/power?lat=34.15&lon=77.58&start=20240115&end=20240117&params=T2M'),
        test_endpoint('8. ANSYS Worker Status', 'http://localhost:8000/api/v1/ansys/status'),
        test_endpoint('9. Analytical Validation', 'http://localhost:8000/api/v1/validation/run'),
        test_endpoint('10. Materials Assembly Evaluate', 'http://localhost:8000/api/v1/materials/evaluate', method='POST', payload={
            'assembly_name': 'Exterior Wall 300mm Stone',
            'assembly_type': 'wall',
            'layers': [
                {'material_id': 'mat-stone-granite', 'name': 'Stone Masonry', 'thickness_mm': 300, 'conductivity': 1.5, 'density': 2500, 'specific_heat': 900},
                {'material_id': 'mat-eps', 'name': 'EPS Insulation', 'thickness_mm': 100, 'conductivity': 0.035, 'density': 25, 'specific_heat': 1400}
            ]
        }),
        test_endpoint('11. 3R2C Physics Simulation', 'http://localhost:8000/api/v1/simulations/run', method='POST', payload={
            'scenario_id': 'demo-leh-001',
            'length_m': 6.0, 'width_m': 4.0, 'height_m': 3.0,
            'roof_pitch_deg': 15.0, 'orientation_deg': 180.0, 'elevation_m': 3500.0,
            'wall_layers': [{'name': 'Stone', 'thickness_mm': 300, 'conductivity': 1.5, 'density': 2500, 'specific_heat': 900}],
            'roof_layers': [{'name': 'Sheet', 'thickness_mm': 2, 'conductivity': 50.0, 'density': 7800, 'specific_heat': 500}],
            'occupants': 4, 'metabolic_rate_w': 100, 'internal_gains_w': 200,
            'hvac_mode': 'heated', 'target_temp_c': 18.0, 'comfort_band_c': 2.0,
            'ach_natural': 0.3, 'ach_infiltration': 0.2, 'duration_hours': 24
        }),
        test_endpoint('12. Engineering Report Generation', 'http://localhost:8000/api/v1/reports/generate', method='POST', payload={
            'scenario_id': 'demo-leh-001', 'include_ansys': True, 'include_benchmarks': True
        })
    ]
    print(f"\nResult: {sum(results)}/{len(results)} services verified.")
