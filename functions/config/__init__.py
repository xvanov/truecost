"""TrueCost configuration.

This package contains:
- settings: Environment variables and configuration
- secrets: Unified secret access (Firebase Secrets Manager)
- errors: Custom exceptions and error codes
"""

from config.settings import settings
from config.errors import TrueCostError
from config.secrets import get_secret, get_openai_api_key, get_serp_api_key, get_bls_api_key

__all__ = [
    "settings",
    "TrueCostError",
    "get_secret",
    "get_openai_api_key",
    "get_serp_api_key",
    "get_bls_api_key",
]



