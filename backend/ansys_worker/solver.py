"""
ANSYS Fluent Solver Configuration.
Generates transient thermal CFD solution setup commands for PyFluent.
"""

from typing import Dict, Any, List


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
                "viscous": {"model": "laminar"},
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
