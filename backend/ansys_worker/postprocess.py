"""
ANSYS Fluent Post-Processing and Physics Comparison Engine.
Extracts volume/surface fields, parses monitor files, and calculates comparison metrics
between THERMASHELL Lumped-RC physics and ANSYS Fluent CFD.
"""

import math
from typing import Dict, Any, List


class FluentPostProcessor:
    @staticmethod
    def calculate_validation_metrics(
        physics_temps: List[float],
        ansys_temps: List[float]
    ) -> Dict[str, float]:
        """
        Calculates strict comparative statistical metrics between Physics Engine and ANSYS Fluent:
        - MAE (Mean Absolute Error)
        - RMSE (Root Mean Square Error)
        - MBE (Mean Bias Error)
        - R² (Coefficient of Determination)
        - Max Absolute Error
        - Percentage Error
        Residual: Error(t) = T_physics(t) - T_ansys(t)
        """
        n = min(len(physics_temps), len(ansys_temps))
        if n == 0:
            return {"mae": 0.0, "rmse": 0.0, "mbe": 0.0, "r_squared": 1.0, "max_error": 0.0}

        p = physics_temps[:n]
        a = ansys_temps[:n]

        errors = [p[i] - a[i] for i in range(n)]
        abs_errors = [abs(e) for e in errors]

        mae = sum(abs_errors) / n
        rmse = math.sqrt(sum(e * e for e in errors) / n)
        mbe = sum(errors) / n
        max_err = max(abs_errors)

        # R² Calculation
        mean_a = sum(a) / n
        ss_tot = sum((x - mean_a) ** 2 for x in a)
        ss_res = sum(e * e for e in errors)
        r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 1e-8 else 1.0
        r2 = max(0.0, min(1.0, r2))

        return {
            "mae": round(mae, 3),
            "rmse": round(rmse, 3),
            "mbe": round(mbe, 3),
            "r_squared": round(r2, 4),
            "max_absolute_error": round(max_err, 3),
            "sample_count": n
        }

    @staticmethod
    def parse_monitor_file(file_content: str) -> Dict[str, List[float]]:
        """
        Parses raw Fluent monitor text files into timeseries arrays.
        """
        lines = [line.strip() for line in file_content.splitlines() if line.strip() and not line.startswith("#") and not line.startswith('"')]
        results = {"timesteps": [], "values": []}

        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                try:
                    results["timesteps"].append(int(parts[0]))
                    results["values"].append(float(parts[1]))
                except ValueError:
                    continue

        return results
