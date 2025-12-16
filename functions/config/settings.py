"""TrueCost configuration settings.

Loads configuration from environment variables with sensible defaults.
Secrets are loaded via Firebase Secrets Manager (production) or environment variables (emulator).
"""

import os
from typing import Optional
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Load .env file for non-secret configuration (emulator hosts, feature flags, etc.)
# Secrets should come from Firebase Secrets Manager or environment variables
load_dotenv()


def _get_default_a2a_url() -> str:
    """Get default A2A URL based on environment mode."""
    if (os.getenv("USE_FIREBASE_EMULATORS", "false").lower() == "true" or
        os.getenv("FUNCTIONS_EMULATOR", "false").lower() == "true"):
        return "http://127.0.0.1:5001/collabcanvas-dev/us-central1"
    return "http://localhost:5001"


@dataclass
class Settings:
    """Application settings loaded from environment variables.

    Note: Secrets (OPENAI_API_KEY, etc.) should be accessed via config.secrets module,
    not directly from this class. The openai_api_key property is provided for
    backwards compatibility but delegates to the secrets module.
    """

    # LLM Configuration (non-secrets)
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4o"))
    llm_temperature: float = field(default_factory=lambda: float(os.getenv("LLM_TEMPERATURE", "0.1")))

    # Firebase Configuration
    firebase_project_id: Optional[str] = field(default_factory=lambda: os.getenv("FIREBASE_PROJECT_ID"))
    use_firebase_emulators: bool = field(default_factory=lambda: os.getenv("USE_FIREBASE_EMULATORS", "false").lower() == "true")
    firestore_emulator_host: str = field(default_factory=lambda: os.getenv("FIRESTORE_EMULATOR_HOST", "localhost:8081"))

    # A2A Protocol Configuration
    a2a_base_url: str = field(default_factory=lambda: os.getenv("A2A_BASE_URL", _get_default_a2a_url()))
    a2a_timeout_seconds: int = field(default_factory=lambda: int(os.getenv("A2A_TIMEOUT_SECONDS", "300")))

    # Pipeline Configuration
    pipeline_max_retries: int = field(default_factory=lambda: int(os.getenv("PIPELINE_MAX_RETRIES", "2")))
    pipeline_passing_score: int = field(default_factory=lambda: int(os.getenv("PIPELINE_PASSING_SCORE", "60")))

    # Monte Carlo Configuration
    monte_carlo_iterations: int = field(default_factory=lambda: int(os.getenv("MONTE_CARLO_ITERATIONS", "10000")))

    # Logging
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    # Internal: cached secret value (use openai_api_key property instead)
    _openai_api_key: Optional[str] = field(default=None, repr=False)

    @property
    def openai_api_key(self) -> Optional[str]:
        """Get OpenAI API key from Firebase Secrets Manager or environment.

        This property uses the unified secrets module for consistent access
        across emulator and production environments.
        """
        if self._openai_api_key is None:
            from config.secrets import get_openai_api_key
            self._openai_api_key = get_openai_api_key()
        return self._openai_api_key

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
