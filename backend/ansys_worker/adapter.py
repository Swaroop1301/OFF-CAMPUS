"""
Canonical Scenario Adapter for ANSYS Fluent.
Converts CanonicalScenario into CAD geometry inputs, material mappings,
and transient boundary condition timeseries.
"""

from typing import Dict, Any, List
from schemas.canonical_scenario import CanonicalScenario
from ansys_worker.geometry import ParametricShelterGeometry
from ansys_worker.materials import FluentMaterialMapper
from ansys_worker.boundary_conditions import BoundaryConditionMapper
from ansys_worker.meshing import FluentMesher
from ansys_worker.solver import FluentSolverSetup


class CanonicalToAnsysAdapter:
    @staticmethod
    def prepare_ansys_case(
        scenario: CanonicalScenario,
        climate_data: Dict[str, Any],
        output_workdir: str
    ) -> Dict[str, Any]:
        """
        Translates a CanonicalScenario into a fully specified ANSYS Fluent case package.
        """
        # 1. Geometry
        wall_thick_m = sum(l.thickness_mm for l in scenario.envelope.walls) / 1000.0
        roof_thick_m = sum(l.thickness_mm for l in scenario.envelope.roof) / 1000.0
        floor_thick_m = 0.20
        if scenario.envelope.floor:
            floor_thick_m = sum(l.thickness_mm for l in scenario.envelope.floor) / 1000.0

        geom = ParametricShelterGeometry(
            length_m=scenario.geometry.length_m,
            width_m=scenario.geometry.width_m,
            height_m=scenario.geometry.height_m,
            roof_type=scenario.geometry.roof_type,
            roof_pitch_deg=scenario.geometry.roof_pitch_deg,
            wall_thickness_m=max(0.1, wall_thick_m),
            roof_thickness_m=max(0.05, roof_thick_m),
            floor_thickness_m=max(0.1, floor_thick_m),
            windows=[w.model_dump() for w in (scenario.envelope.windows or [])]
        )
        stl_files = geom.export_geometry_stl(output_workdir)

        # 2. Materials
        materials_list = []
        for l in scenario.envelope.walls:
            materials_list.append({
                "name": l.name,
                "thermal_conductivity_k": l.conductivity,
                "density_rho": l.density,
                "specific_heat_cp": l.specific_heat,
            })
        fluent_materials = FluentMaterialMapper.build_fluent_material_commands(materials_list)

        # 3. Meshing Parameters
        mesh_cfg = FluentMesher.get_mesh_parameters(
            resolution=scenario.ansys_settings.mesh_resolution,
            volume_m3=geom.int_volume
        )

        # 4. Boundary Condition Mapping
        params = climate_data.get("parameters", {})
        t2m = params.get("T2M", {})
        ws10m = params.get("WS10M", {})
        ghi = params.get("ALLSKY_SFC_SW_DWN", {})

        timestamps = sorted(list(t2m.keys()))
        bc_timeline = []
        internal_heat_gain = (
            scenario.operation.occupants * scenario.operation.metabolic_rate_w
            + scenario.operation.internal_gains_w
        )

        for ts in timestamps:
            t_amb = float(t2m.get(ts, -10.0))
            w_spd = float(ws10m.get(ts, 2.0))
            rad = float(ghi.get(ts, 0.0))

            bc_step = BoundaryConditionMapper.map_climate_step_to_bc(
                ambient_temp_c=t_amb,
                wind_speed_ms=w_spd,
                solar_ghi=rad,
                internal_heat_gain_w=internal_heat_gain,
                fluid_volume_m3=geom.int_volume,
                orientation_deg=scenario.geometry.orientation_deg
            )
            bc_step["timestamp"] = ts
            bc_timeline.append(bc_step)

        # 5. Solver Settings
        solver_cfg = FluentSolverSetup.build_solver_commands(
            timestep_s=scenario.physics_settings.timestep_s,
            total_steps=len(bc_timeline),
            precision=scenario.ansys_settings.precision
        )

        return {
            "scenario_id": scenario.id,
            "geometry": stl_files,
            "materials": fluent_materials,
            "mesh": mesh_cfg,
            "solver": solver_cfg,
            "boundary_conditions_timeline": bc_timeline,
            "workdir": output_workdir,
            "total_timesteps": len(bc_timeline)
        }
