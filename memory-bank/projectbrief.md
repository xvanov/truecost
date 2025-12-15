# TrueCost - Project Brief

## Overview

TrueCost is an AI-powered construction estimation system that transforms project plans (CAD) and descriptions into comprehensive, professionally-credible estimates. It's a **brownfield pivot** from the existing CollabCanvas collaborative canvas application.

## Core Problem

**Estimation inaccuracy kills profitability in residential construction.**
- Contractors who underbid lose money on cost overruns
- Those who overbid lose jobs to competitors
- Manual estimation is time-consuming and error-prone

## Solution

TrueCost employs **7 specialized Deep Agents** that collaborate through structured workflows:

1. **Clarification Agent** - Understands project through natural conversation
2. **CAD Analysis Agent** - Extracts structured data from uploaded plans  
3. **Location Intelligence Agent** - Gathers zip-code specific cost factors
4. **Construction Scope Agent** - Creates Bill of Quantities (CSI MasterFormat)
5. **Cost Estimation Agent** - Calculates material, labor, equipment costs
6. **Risk Analysis Agent** - Models uncertainty with Monte Carlo simulation
7. **Final Estimator Agent** - Synthesizes risk-adjusted estimate and report

## Key Features

- **Dual Input System**: CAD plan upload (mandatory) + text/voice description
- **Probabilistic Estimates**: P50/P80/P90 confidence ranges (not single-point guesses)
- **Professional PDF Output**: Complete estimate with cost breakdown, timeline, risk analysis
- **Real-time Pipeline Visibility**: See each agent's progress and intermediate outputs

## Success Metrics

| Metric | Target | Industry Benchmark |
|--------|--------|-------------------|
| MAPE (Overall) | < 10% | 15-25% typical |
| CAD Extraction Accuracy | > 95% | Manual methods vary |
| Time to Estimate | < 5 minutes | Hours for manual |

## MVP Scope

- Full 7-agent pipeline operational
- Single-family residential projects (remodels, additions, new construction)
- RSMeans-schema mock data (live integration post-MVP)
- Three-section UI: Input → Plan → Final Estimate

## Team Structure (5 Parallel Developers)

| Developer | Epic | Exclusive Ownership |
|-----------|------|---------------------|
| Dev 1 | UI/Frontend | `src/components/estimate/**`, `src/hooks/**`, `src/stores/useEstimateStore.ts` |
| **Dev 2** | **Deep Agent Pipeline** | **`functions/agents/`, `functions/main.py`, Firestore schema** |
| Dev 3 | User Input & Clarification | `functions/agents/clarification_agent.py`, `functions/services/cad_parser.py`, etc. |
| Dev 4 | Data/PDF Services | `functions/services/cost_data_service.py`, `functions/services/monte_carlo.py`, etc. |
| Dev 5 | Stretch Goals | Enhancement features after MVP core |

## Document References

- [PRD](/docs/prd.md) - Full product requirements (78 FRs)
- [Architecture](/docs/architecture.md) - Technical architecture decisions
- [Epics](/docs/epics.md) - Complete epic and story breakdown
- [ClarificationOutput Schema](/docs/clarification-output-schema.md) - Handoff contract from Dev 3




