"""
Boundary Condition Mapping for ANSYS Fluent.
Maps NASA POWER hourly climate timeseries and operating internal gains
to external convection, radiation flux, and fluid zone source terms.
"""

from typing import Dict, Any, List


class BoundaryConditionMapper:
    @staticmethod
    def compute_convection_coefficient(wind_speed_ms: float) -> float:
        """
        Calculates exterior surface convective heat transfer coefficient (W/m²K)
        using the Mitchell / McAdams empirical building correlation:
        h_c = 5.7 + 3.8 * V
        """
        return 5.7 + 3.8 * max(0.1, wind_speed_ms)

    @staticmethod
    def map_climate_step_to_bc(
        ambient_temp_c: float,
        wind_speed_ms: float,
        solar_ghi: float,
        internal_heat_gain_w: float,
        fluid_volume_m3: float,
        orientation_deg: float = 180.0
    ) -> Dict[str, Any]:
        """
        Maps single-timestep environmental state to Fluent thermal boundary conditions.
        """
        h_c = BoundaryConditionMapper.compute_convection_coefficient(wind_speed_ms)
        ambient_temp_k = ambient_temp_c + 273.15

        # Solar heat flux per face orientation (approximate direct + diffuse distribution)
        solar_flux_w_m2 = max(0.0, solar_ghi)

        # Volumetric heat generation in indoor fluid zone from occupants and equipment
        volumetric_source_w_m3 = internal_heat_gain_w / max(1.0, fluid_volume_m3)

        return {
            "ambient_temp_k": round(ambient_temp_k, 2),
            "ambient_temp_c": round(ambient_temp_c, 2),
            "h_ext_w_m2k": round(h_c, 2),
            "solar_flux_w_m2": round(solar_flux_w_m2, 2),
            "volumetric_source_w_m3": round(volumetric_source_w_m3, 2),
            "gravity": [0.0, 0.0, -9.81],
        }
