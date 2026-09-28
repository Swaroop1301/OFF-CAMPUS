"""
ANSYS Fluent Material Mapping Engine.
Maps PostgreSQL database materials to PyFluent material properties.
Checks that all required CFD thermal properties are present.
"""

from typing import Dict, Any, List


class FluentMaterialMapper:
    @staticmethod
    def validate_material_for_cfd(mat_data: Dict[str, Any]) -> List[str]:
        """Verifies that all required CFD physical properties exist."""
        missing = []
        if not mat_data.get("thermal_conductivity_k"):
            missing.append("thermal_conductivity_k")
        if not mat_data.get("density_rho"):
            missing.append("density_rho")
        if not mat_data.get("specific_heat_cp"):
            missing.append("specific_heat_cp")
        return missing

    @staticmethod
    def build_fluent_material_commands(materials: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Creates PyFluent material definition dictionaries.
        """
        fluent_materials = []
        for m in materials:
            missing = FluentMaterialMapper.validate_material_for_cfd(m)
            if missing:
                raise ValueError(
                    f"Material '{m.get('name')}' is missing required CFD properties: {', '.join(missing)}"
                )

            fluent_materials.append({
                "name": m.get("name", "custom_mat").lower().replace(" ", "_"),
                "chemical_formula": "",
                "density": {"option": "constant", "value": float(m["density_rho"])},
                "specific_heat": {"option": "constant", "value": float(m["specific_heat_cp"])},
                "thermal_conductivity": {"option": "constant", "value": float(m["thermal_conductivity_k"])},
                "emissivity": float(m.get("emissivity", 0.90)),
                "solar_absorptivity": float(m.get("solar_absorptivity", 0.60)),
            })

        # Add air fluid properties at atmospheric pressure
        fluent_materials.append({
            "name": "air",
            "type": "fluid",
            "density": {"option": "incompressible-ideal-gas"},
            "specific_heat": {"option": "constant", "value": 1006.43},
            "thermal_conductivity": {"option": "constant", "value": 0.0242},
            "viscosity": {"option": "constant", "value": 1.7894e-05}
        })

        return fluent_materials
