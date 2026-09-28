"""
ANSYS Fluent Meshing and Solver Configuration.
Handles computational grid generation and transient thermal CFD solution setup.
"""

from typing import Dict, Any, List


class FluentMesher:
    @staticmethod
    def get_mesh_parameters(resolution: str = "medium", volume_m3: float = 72.0) -> Dict[str, Any]:
        """
        Determines target cell sizes and boundary layer inflation layers.
        """
        res_map = {
            "coarse": {"min_size_m": 0.08, "max_size_m": 0.25, "growth_rate": 1.25, "inflation_layers": 3},
            "medium": {"min_size_m": 0.04, "max_size_m": 0.15, "growth_rate": 1.20, "inflation_layers": 5},
            "fine": {"min_size_m": 0.02, "max_size_m": 0.08, "growth_rate": 1.15, "inflation_layers": 8},
        }
        cfg = res_map.get(resolution.lower(), res_map["medium"])

        # Estimate cell count for domain
        avg_cell_vol = ((cfg["min_size_m"] + cfg["max_size_m"]) / 2.0) ** 3
        est_cell_count = int(volume_m3 / avg_cell_vol)

        return {
            "resolution": resolution,
            "min_size_m": cfg["min_size_m"],
            "max_size_m": cfg["max_size_m"],
            "growth_rate": cfg["growth_rate"],
            "inflation_layers": cfg["inflation_layers"],
            "estimated_cells": est_cell_count,
            "element_type": "poly-hexcore"
        }


class FluentSolverSetup:
    @staticmethod
    def build_solver_commands(
        timestep_s: int = 60,
        total_steps: int = 72,
        precision: str = "double"
    ) -> Dict[str, Any]:
        """
        Generates the solver configuration dictionary for PyFluent execution.
        """
        return {
            "models": {
                "energy": {"enabled": True},
                "viscous": {"model": "laminar"},  # Or realizable-ke for high Reynolds forced flow
                "radiation": {"model": "discrete-ordinates"},
                "gravity": [0.0, 0.0, -9.81],
            },
            "time": {
                "transient": True,
                "timestep_size_s": timestep_s,
                "number_of_timesteps": total_steps,
                "max_iterations_per_timestep": 20
            },
            "convergence_residuals": {
                "continuity": 1e-4,
                "x-velocity": 1e-4,
                "y-velocity": 1e-4,
                "z-velocity": 1e-4,
                "energy": 1e-6,
                "do-intensity": 1e-5
            },
            "monitors": [
                "volume-average-temperature-fluid",
                "area-weighted-temperature-south-wall",
                "area-weighted-temperature-roof",
                "total-heat-flux-walls"
            ]
        }
