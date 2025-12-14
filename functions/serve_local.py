#!/usr/bin/env python3
"""Local development server for TrueCost Python functions.

Run this instead of `python3 -m http.server 8000` for proper function handling.
This server mimics the Firebase Functions emulator endpoints.

Usage:
    cd functions
    source venv/bin/activate
    python serve_local.py

This will start a Flask server on port 8080 that handles:
- POST /start_deep_pipeline -> start_deep_pipeline function
- POST /get_pipeline_status -> get_pipeline_status function
- POST /delete_estimate -> delete_estimate function
- POST /a2a_* -> Agent-to-Agent endpoints

The TypeScript orchestrator will call these endpoints when PYTHON_FUNCTIONS_URL is set.
"""

import os
import sys

# Set environment for local development
os.environ.setdefault('FUNCTIONS_EMULATOR', 'true')
os.environ.setdefault('GCLOUD_PROJECT', 'collabcanvas-dev')
os.environ.setdefault('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8081')

from flask import Flask, request, jsonify
from flask_cors import CORS
import json

# Import the main module after setting env vars
from main import (
    start_deep_pipeline,
    get_pipeline_status,
    delete_estimate,
    a2a_location,
    a2a_scope,
    a2a_cost,
    a2a_risk,
    a2a_timeline,
    a2a_final,
    a2a_location_scorer,
    a2a_scope_scorer,
    a2a_cost_scorer,
    a2a_risk_scorer,
    a2a_timeline_scorer,
    a2a_final_scorer,
    a2a_location_critic,
    a2a_scope_critic,
    a2a_cost_critic,
    a2a_risk_critic,
    a2a_timeline_critic,
    a2a_final_critic,
)

app = Flask(__name__)
CORS(app)


class MockRequest:
    """Mock Firebase request object to wrap Flask request."""

    def __init__(self, flask_request):
        self._request = flask_request
        self._json_data = None
        self.method = flask_request.method
        self.headers = dict(flask_request.headers)

    def get_json(self, force=False):
        if self._json_data is None:
            self._json_data = self._request.get_json(force=force) or {}
        return self._json_data


def wrap_firebase_function(firebase_fn):
    """Wrap a Firebase function to work with Flask."""
    def wrapper():
        mock_req = MockRequest(request)
        response = firebase_fn(mock_req)
        # Firebase Response has response_value, status, headers
        return response.response[0], response.status_code, dict(response.headers)
    return wrapper


# Pipeline endpoints (matching Firebase emulator URL structure)
@app.route('/collabcanvas-dev/us-central1/start_deep_pipeline', methods=['POST', 'OPTIONS'])
def handle_start_pipeline():
    return wrap_firebase_function(start_deep_pipeline)()

@app.route('/collabcanvas-dev/us-central1/get_pipeline_status', methods=['POST', 'OPTIONS'])
def handle_get_status():
    return wrap_firebase_function(get_pipeline_status)()

@app.route('/collabcanvas-dev/us-central1/delete_estimate', methods=['POST', 'OPTIONS'])
def handle_delete_estimate():
    return wrap_firebase_function(delete_estimate)()

# A2A endpoints
@app.route('/collabcanvas-dev/us-central1/a2a_location', methods=['POST', 'OPTIONS'])
def handle_a2a_location():
    return wrap_firebase_function(a2a_location)()

@app.route('/collabcanvas-dev/us-central1/a2a_scope', methods=['POST', 'OPTIONS'])
def handle_a2a_scope():
    return wrap_firebase_function(a2a_scope)()

@app.route('/collabcanvas-dev/us-central1/a2a_cost', methods=['POST', 'OPTIONS'])
def handle_a2a_cost():
    return wrap_firebase_function(a2a_cost)()

@app.route('/collabcanvas-dev/us-central1/a2a_risk', methods=['POST', 'OPTIONS'])
def handle_a2a_risk():
    return wrap_firebase_function(a2a_risk)()

@app.route('/collabcanvas-dev/us-central1/a2a_timeline', methods=['POST', 'OPTIONS'])
def handle_a2a_timeline():
    return wrap_firebase_function(a2a_timeline)()

@app.route('/collabcanvas-dev/us-central1/a2a_final', methods=['POST', 'OPTIONS'])
def handle_a2a_final():
    return wrap_firebase_function(a2a_final)()

# Scorer endpoints
@app.route('/collabcanvas-dev/us-central1/a2a_location_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_location_scorer():
    return wrap_firebase_function(a2a_location_scorer)()

@app.route('/collabcanvas-dev/us-central1/a2a_scope_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_scope_scorer():
    return wrap_firebase_function(a2a_scope_scorer)()

@app.route('/collabcanvas-dev/us-central1/a2a_cost_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_cost_scorer():
    return wrap_firebase_function(a2a_cost_scorer)()

@app.route('/collabcanvas-dev/us-central1/a2a_risk_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_risk_scorer():
    return wrap_firebase_function(a2a_risk_scorer)()

@app.route('/collabcanvas-dev/us-central1/a2a_timeline_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_timeline_scorer():
    return wrap_firebase_function(a2a_timeline_scorer)()

@app.route('/collabcanvas-dev/us-central1/a2a_final_scorer', methods=['POST', 'OPTIONS'])
def handle_a2a_final_scorer():
    return wrap_firebase_function(a2a_final_scorer)()

# Critic endpoints
@app.route('/collabcanvas-dev/us-central1/a2a_location_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_location_critic():
    return wrap_firebase_function(a2a_location_critic)()

@app.route('/collabcanvas-dev/us-central1/a2a_scope_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_scope_critic():
    return wrap_firebase_function(a2a_scope_critic)()

@app.route('/collabcanvas-dev/us-central1/a2a_cost_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_cost_critic():
    return wrap_firebase_function(a2a_cost_critic)()

@app.route('/collabcanvas-dev/us-central1/a2a_risk_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_risk_critic():
    return wrap_firebase_function(a2a_risk_critic)()

@app.route('/collabcanvas-dev/us-central1/a2a_timeline_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_timeline_critic():
    return wrap_firebase_function(a2a_timeline_critic)()

@app.route('/collabcanvas-dev/us-central1/a2a_final_critic', methods=['POST', 'OPTIONS'])
def handle_a2a_final_critic():
    return wrap_firebase_function(a2a_final_critic)()


# Health check
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'truecost-python-functions'})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    print(f"""
╔════════════════════════════════════════════════════════════════╗
║  TrueCost Python Functions - Local Development Server          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Server running on: http://127.0.0.1:{port}                     ║
║                                                                ║
║  Endpoints:                                                    ║
║  • POST /collabcanvas-dev/us-central1/start_deep_pipeline      ║
║  • POST /collabcanvas-dev/us-central1/get_pipeline_status      ║
║  • POST /collabcanvas-dev/us-central1/delete_estimate          ║
║  • POST /collabcanvas-dev/us-central1/a2a_*                    ║
║                                                                ║
║  The TypeScript orchestrator expects port 5001, so either:     ║
║  1. Update PYTHON_FUNCTIONS_URL env var, OR                    ║
║  2. Run this on port 5001 if Firebase emulators aren't running ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
""")
    app.run(host='127.0.0.1', port=port, debug=True, threaded=True)
