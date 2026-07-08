from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    ALLOWED_ORIGINS: List[str] = ["http://localhost:4000", "http://localhost:3000"]
    
    # Z-score anomaly threshold — a composite z-score above this fires Stage 1 anomaly
    # This is deliberately conservative (high value = fewer false positives)
    ANOMALY_Z_THRESHOLD: float = 4.5
    
    # Absolute floor — even if z-score fires, peak_accel must exceed this (m/s²)
    # Prevents calibration-drift false positives on very smooth riders
    ANOMALY_ABS_FLOOR_ACCEL: float = 15.0  # ~1.5G
    
    # Minimum samples before baseline is considered valid
    MIN_BASELINE_SAMPLES: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
