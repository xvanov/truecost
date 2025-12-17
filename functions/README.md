# TrueCost Python Functions

Python Cloud Functions for the TrueCost deep estimation pipeline, PDF generation, and A2A (Agent-to-Agent) protocol.

## Overview

This directory contains Python-based Firebase Cloud Functions that complement the Node.js functions in `collabcanvas/functions/`. The Python functions handle:

- **Deep Estimation Pipeline** - Multi-agent system for construction cost estimation
- **PDF Generation** - Report generation using WeasyPrint
- **A2A Protocol** - Agent-to-Agent communication between estimation agents

## Prerequisites

- Python 3.12+
- Firebase CLI (`npm install -g firebase-tools`)
- Virtual environment

## Setup

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Local Development

### Secrets

All secrets are managed via **Firebase Secrets Manager**. For local development, set them as environment variables:

```bash
# Get secret from Firebase
firebase functions:secrets:access OPENAI_API_KEY

# Set as environment variable
export OPENAI_API_KEY='sk-proj-...'
```

### Running Locally

```bash
# Activate virtual environment
source venv/bin/activate

# Set required secrets
export OPENAI_API_KEY='sk-proj-...'

# Start local server (port 5003)
python serve_local.py
```

The server runs on port 5003 to avoid conflicts with the Firebase Functions emulator (port 5001).

### Environment Configuration

Non-secret configuration is in `.env`:

```bash
# Emulator mode
USE_FIREBASE_EMULATORS=true
FIRESTORE_EMULATOR_HOST=localhost:8081
FUNCTIONS_EMULATOR=true
GCLOUD_PROJECT=collabcanvas-dev

# A2A Protocol
A2A_BASE_URL=http://127.0.0.1:5003/collabcanvas-dev/us-central1

# LLM Configuration (non-secret)
LLM_MODEL=gpt-4o
LLM_TEMPERATURE=0.1
```

## Project Structure

```
functions/
├── agents/              # A2A agent implementations
│   ├── critics/         # Critic agents (validation)
│   ├── primary/         # Primary agents (estimation)
│   └── scorers/         # Scorer agents (evaluation)
├── config/
│   ├── __init__.py
│   ├── errors.py        # Error handling
│   ├── secrets.py       # Unified secret access
│   └── settings.py      # Configuration
├── models/              # Data models (Pydantic)
├── services/
│   ├── firestore_service.py
│   ├── llm_service.py
│   ├── monte_carlo_service.py
│   └── pdf_generator.py
├── tests/               # Unit and integration tests
├── main.py              # Cloud Functions entry point
├── serve_local.py       # Local development server
├── requirements.txt     # Python dependencies
└── .env                 # Non-secret configuration
```

## Secrets Management

### Production

In production, secrets are loaded from **Firebase Secrets Manager** via the `config/secrets.py` module:

```python
from config.secrets import get_openai_api_key

api_key = get_openai_api_key()
```

### Local Development

For local development, set secrets as environment variables:

```bash
export OPENAI_API_KEY='sk-proj-...'
export SERP_API_KEY='...'
export BLS_API_KEY='...'
```

### Managing Secrets

```bash
# Set a secret
firebase functions:secrets:set OPENAI_API_KEY

# View a secret
firebase functions:secrets:access OPENAI_API_KEY

# List all secrets
firebase functions:secrets:list
```

## Deployment

Python functions are deployed alongside Node.js functions:

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy only Python functions
firebase deploy --only functions:python
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=.

# Run specific test file
pytest tests/unit/test_llm_service.py
```

## API Endpoints

When running locally (`serve_local.py`), endpoints are available at:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/collabcanvas-dev/us-central1/start_deep_pipeline` | POST | Start estimation pipeline |
| `/collabcanvas-dev/us-central1/get_pipeline_status` | POST | Get pipeline status |
| `/collabcanvas-dev/us-central1/delete_estimate` | POST | Delete estimate |
| `/collabcanvas-dev/us-central1/generate_pdf` | POST | Generate PDF report |
| `/collabcanvas-dev/us-central1/a2a_*` | POST | A2A agent endpoints |

## Further Documentation

- [Firebase Configuration & Secrets](../collabcanvas/docs/firebase-configuration.md) - Comprehensive secrets management guide
- [Deployment Guide](../collabcanvas/DEPLOYMENT.md) - Production deployment instructions
- [Dev Setup](../collabcanvas/DEV-SETUP.md) - Local development setup
