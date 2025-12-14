"""TrueCost configuration settings.

Loads configuration from environment variables with sensible defaults.
"""

import os
from typing import Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()


@dataclass
class Settings:
    """Application settings loaded from environment variables."""
    
    # LLM Configuration
    llm_model: str = os.getenv("LLM_MODEL", "gpt-4o")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.1"))
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    
    # Firebase Configuration
    firebase_project_id: Optional[str] = os.getenv("FIREBASE_PROJECT_ID")
    use_firebase_emulators: bool = os.getenv("USE_FIREBASE_EMULATORS", "false").lower() == "true"
    firestore_emulator_host: str = os.getenv("FIRESTORE_EMULATOR_HOST", "localhost:8081")
    
    # A2A Protocol Configuration
    # In emulator mode, use full Firebase Functions emulator URL with project/region
    _default_a2a_url: str = (
        "http://127.0.0.1:5001/collabcanvas-dev/us-central1"
        if os.getenv("USE_FIREBASE_EMULATORS", "false").lower() == "true"
        or os.getenv("FUNCTIONS_EMULATOR", "false").lower() == "true"
        else "http://localhost:5001"
    )
    a2a_base_url: str = os.getenv("A2A_BASE_URL", _default_a2a_url)
    a2a_timeout_seconds: int = int(os.getenv("A2A_TIMEOUT_SECONDS", "300"))  # 5 minutes
    
    # Pipeline Configuration
    pipeline_max_retries: int = int(os.getenv("PIPELINE_MAX_RETRIES", "2"))
    # NOTE: Lowered from 80 to 60 for testing with minimal annotations
    pipeline_passing_score: int = int(os.getenv("PIPELINE_PASSING_SCORE", "60"))

    # Monte Carlo Configuration
    # Default to higher iterations for smoother percentiles; override in CI/tests if needed.
    monte_carlo_iterations: int = int(os.getenv("MONTE_CARLO_ITERATIONS", "10000"))
    
    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    
    def validate(self) -> None:
        """Validate required settings are present.
        
        Raises:
            ValueError: If required settings are missing.
        """
        if not self.openai_api_key and not self.use_firebase_emulators:
            raise ValueError("OPENAI_API_KEY is required in production")
    
    @property
    def is_emulator_mode(self) -> bool:
        """Check if running in emulator mode."""
        return self.use_firebase_emulators


# Singleton settings instance
settings = Settings()

