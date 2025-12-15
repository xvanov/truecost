"""TrueCost configuration.

This package contains:
- settings: Environment variables and configuration
- errors: Custom exceptions and error codes
"""

from config.settings import settings
from config.errors import TrueCostError

__all__ = ["settings", "TrueCostError"]




