"""Unified secret access for TrueCost Python functions.

This module provides a consistent interface for accessing secrets that works
in both local development (emulator) and production environments.

In production: Uses Google Cloud Secret Manager (Firebase Secrets)
In emulator: Falls back to environment variables

Usage:
    from config.secrets import get_openai_api_key, get_secret

    # Get a specific secret
    api_key = get_openai_api_key()

    # Get any secret by name
    custom_secret = get_secret('MY_SECRET_NAME')
"""

import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)


def is_emulator_mode() -> bool:
    """Check if running in Firebase emulator mode."""
    return (
        os.environ.get('FUNCTIONS_EMULATOR') == 'true' or
        os.environ.get('FIRESTORE_EMULATOR_HOST') is not None
    )


def get_secret(secret_id: str) -> Optional[str]:
    """
    Get secret from Firebase Secrets Manager (production) or environment (local).

    Args:
        secret_id: The name of the secret (e.g., 'OPENAI_API_KEY')

    Returns:
        The secret value, or None if not found

    In production: Uses Google Cloud Secret Manager
    In emulator: Falls back to environment variables for local development
    """
    # In emulator mode, use environment variables
    if is_emulator_mode():
        value = os.environ.get(secret_id)
        if value:
            logger.debug(f"Secret {secret_id} loaded from environment (emulator mode)")
        else:
            logger.warning(f"Secret {secret_id} not found in environment variables")
        return value

    # Production: Use Secret Manager
    try:
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        project_id = os.environ.get('GCLOUD_PROJECT') or os.environ.get('GOOGLE_CLOUD_PROJECT', 'collabcanvas-dev')
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"

        response = client.access_secret_version(request={"name": name})
        value = response.payload.data.decode("UTF-8")
        logger.debug(f"Secret {secret_id} loaded from Secret Manager")
        return value

    except ImportError:
        logger.warning("google-cloud-secret-manager not installed, falling back to environment")
        return os.environ.get(secret_id)

    except Exception as e:
        logger.warning(f"Failed to load secret {secret_id} from Secret Manager: {e}")
        # Fallback to environment variable
        return os.environ.get(secret_id)


# Cached secret accessors for commonly used secrets
# Using lru_cache to avoid repeated API calls

@lru_cache(maxsize=1)
def get_openai_api_key() -> Optional[str]:
    """Get OpenAI API key from secrets."""
    return get_secret('OPENAI_API_KEY')


@lru_cache(maxsize=1)
def get_serp_api_key() -> Optional[str]:
    """Get SerpAPI key from secrets."""
    return get_secret('SERP_API_KEY')


@lru_cache(maxsize=1)
def get_bls_api_key() -> Optional[str]:
    """Get Bureau of Labor Statistics API key from secrets."""
    return get_secret('BLS_API_KEY')


def clear_secret_cache() -> None:
    """Clear cached secrets. Useful for testing or when secrets are rotated."""
    get_openai_api_key.cache_clear()
    get_serp_api_key.cache_clear()
    get_bls_api_key.cache_clear()
