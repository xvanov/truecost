# Product Brief: TrueCost

**Date:** 2025-12-09
**Author:** xvanov
**Context:** Brownfield Pivot (from CollabCanvas)

---

## Executive Summary

**TrueCost** is an AI-powered construction estimation system built on the LangChain Deep Agents framework. It pivots the existing CollabCanvas collaborative canvas application into an intelligent, multi-agent estimation engine that delivers accurate, risk-adjusted cost and timeline estimates for construction projects.

The system employs a hierarchy of 7 specialized deep agents—each an expert in its domain—that collaborate through structured workflows to transform vague project descriptions into comprehensive, professionally-credible estimates. By leveraging LangGraph for orchestration, persistent memory, and subagent delegation, TrueCost can handle the immense complexity of construction estimation: from clarifying scope, to gathering location-specific data, to calculating labor hours, to modeling risk.

**Target Users:** General contractors and subcontractors who need fast, accurate estimates to win bids and manage project costs.

---

## Core Vision

### Problem Statement

**Construction estimates are inaccurate, and inaccuracy kills profitability.**

General contractors and subcontractors struggle to produce accurate cost estimates. The consequences are severe:
- **Underbid:** Win the job but lose money on cost overruns
- **Overbid:** Lose the job to competitors with tighter margins
- **Missed variables:** Regional labor rates, material price volatility, weather impacts, and regulatory costs are difficult to track and integrate

**Current State:** Most contractors estimate using Excel spreadsheets or Excel-like tools (Procore, Buildertrend). These approaches share a fundamental flaw—they rely on manual data entry, outdated pricing, and human judgment to account for dozens of cost variables. Even with tools that make estimating *easier*, the outputs remain *inaccurate* because:

1. **Static data** - Spreadsheets use pricing snapshots that become stale within weeks
2. **Missing context** - Tools don't automatically factor in location-specific labor rates, union vs. non-union markets, permit costs, or weather delays
3. **Human bottleneck** - Accuracy depends entirely on the estimator's experience and time investment
4. **No risk modeling** - Estimates are single-point figures without probabilistic ranges or contingency analysis

The industry standard for estimate accuracy (AACE Class 3-4) expects ±10-20% variance. Many contractor estimates exceed this, leading to profit erosion or lost bids.

### Problem Impact

- **Profit Margin Erosion:** A 5% estimation error on a $1M project = $50K lost profit
- **Bid Win Rate:** Inaccurate bids (too high or too low) reduce competitive win rates
- **Time Cost:** Manual estimation consumes 20-40+ hours per complex project
- **Expertise Dependency:** Smaller contractors without dedicated estimators are at a disadvantage

### Why Existing Solutions Fall Short

| Solution | Limitation |
|----------|------------|
| **Excel/Spreadsheets** | Manual, static, no real-time data, no risk analysis |
| **Procore/Buildertrend** | Project management focus, estimation is a secondary feature |
| **RSMeans (direct)** | Data source only—requires manual interpretation and application |
| **Dedicated estimating software** | Expensive, steep learning curve, still requires significant manual input |

**None of these solutions provide an intelligent, automated system that synthesizes real-time data from multiple sources and reasons through the complexity of construction estimation.**

### Proposed Solution

**TrueCost is a fully automated construction estimation engine powered by LangChain Deep Agents.**

Instead of a single AI model or a spreadsheet with formulas, TrueCost deploys a **team of 7 specialized AI agents** that collaborate through a structured workflow—mirroring how a professional estimating department operates, but with superhuman data access and consistency.

**The Deep Agent Pipeline:**

```
User Input → [1. Clarification Agent] → Structured Project Brief
                                              ↓
                        ┌─────────────────────┴─────────────────────┐
                        ↓                                           ↓
            [2. Location Intelligence]                [3. Construction Scope]
               (Labor rates, permits,                    (Bill of Quantities
                weather, soil data)                       in CSI format)
                        ↓                                           ↓
                        └─────────────────────┬─────────────────────┘
                                              ↓
                        ┌─────────────────────┴─────────────────────┐
                        ↓                                           ↓
                [4. Cost Estimation]                    [5. Timeline Estimation]
                 (Material, labor,                        (CPM scheduling,
                  equipment costs)                         duration calc)
                        ↓                                           ↓
                        └─────────────────────┬─────────────────────┘
                                              ↓
                                    [6. Risk Analysis]
                                     (Monte Carlo sim,
                                      contingency calc)
                                              ↓
                                    [7. Final Estimator]
                                     (Risk-adjusted estimate,
                                      executive report)
```

**How It Achieves Accuracy:**

1. **Real-Time Data Integration** - Agents query live data sources (RSMeans API, BLS labor rates, NOAA weather, local permit databases) rather than relying on static spreadsheets

2. **Location Intelligence** - Automatically adjusts for regional cost variations, union vs. non-union labor markets, local permit fees, and site-specific conditions (soil, weather patterns)

3. **Granular Labor Calculation** - Uses man-hours-per-unit methodology with adjustment factors for crew experience, site conditions, weather, and project complexity

4. **Risk-Adjusted Outputs** - Provides probabilistic cost ranges (not single-point estimates) using Monte Carlo simulation, giving contractors confidence intervals for bidding

5. **Continuous Learning** - Feedback loop compares estimates to actual project costs, continuously improving accuracy over time

**Key Differentiators:**

| TrueCost | Traditional Tools |
|----------|-------------------|
| 7 specialized agents reasoning together | Single user + spreadsheet |
| Real-time data from 10+ sources | Static/manual pricing |
| Automatic location adjustments | Manual lookup and entry |
| Risk-adjusted ranges | Single-point estimates |
| Continuous accuracy improvement | No learning capability |

**The Magic Moment:** A contractor describes a project in plain English, and within minutes receives a comprehensive, professionally-formatted estimate with cost breakdown, timeline, risk analysis, and confidence intervals—all automatically sourced and calculated.

---

## Target Users

### Primary Users

**Residential General Contractors & Subcontractors**

These are contractors who build, renovate, and remodel homes—from kitchen remodels to custom home builds. They operate in a competitive market where accurate estimates are critical but dedicated estimating staff is a luxury.

**Profile:**

| Attribute | Description |
|-----------|-------------|
| **Business Size** | 1-20 employees, often owner-operated |
| **Project Types** | Kitchen/bath remodels, additions, whole-home renovations, custom home builds |
| **Project Value** | $25K - $500K typical range |
| **Estimates/Month** | 5-20 estimates, win rate ~20-30% |
| **Current Tools** | Excel, QuickBooks, maybe Buildertrend or CoConstruct |

**Their Day-to-Day Reality:**

- **Time-starved:** The owner is the estimator, project manager, AND often on the tools
- **Competitive pressure:** Homeowners get 3+ bids; too high = lose the job, too low = lose money
- **Variable costs:** Material prices (lumber, appliances) fluctuate; labor availability varies by season
- **Scope creep risk:** Residential clients change their minds; estimates need contingency buffers
- **Trust gap:** Homeowners are skeptical of contractor pricing; detailed breakdowns build confidence

**What They'd Value Most:**

1. **Accuracy** - Confidence that material and labor costs reflect current market
2. **Professionalism** - Client-ready estimate documents that build trust
3. **Risk protection** - Built-in contingencies so they don't eat cost overruns

**Technical Comfort Level:** Moderate. They use smartphones, apps, and basic software but aren't technical power users. TrueCost must be simple to use—describe the project, get the estimate.

### Secondary Users

**Specialty Subcontractors (Electrical, Plumbing, HVAC, Roofing)**

Subcontractors who bid on portions of residential projects. They need trade-specific estimates with accurate labor hours for their specialty.

- Focused on their specific trade (e.g., electrical rough-in + trim)
- Need man-hour calculations aligned with their crew productivity
- Often bidding multiple small jobs per week

---

## Success Metrics

**Primary Success Metric: Estimation Accuracy (MAPE)**

The core measure of TrueCost's value is how closely estimates match actual project costs. This is measured using **Mean Absolute Percentage Error (MAPE)**:

```
MAPE = (1/n) × Σ |Actual Cost - Estimated Cost| / Actual Cost × 100%
```

| Metric | Target | Industry Benchmark |
|--------|--------|-------------------|
| **MAPE (Overall)** | < 10% | 15-25% typical for manual estimates |
| **MAPE (Material Costs)** | < 8% | High variance in manual methods |
| **MAPE (Labor Hours)** | < 12% | Often 20%+ due to productivity unknowns |

**How We'll Measure:**

1. **Feedback Loop Integration** - After project completion, contractors input actual costs
2. **Variance Analysis** - System categorizes variances (scope change vs. estimation error vs. market shift)
3. **Continuous Calibration** - Actual data feeds back to improve future estimates

### Key Performance Indicators

| KPI | Definition | Target |
|-----|------------|--------|
| **Estimate Accuracy (MAPE)** | % deviation from actual project cost | < 10% |
| **Estimates Generated** | Monthly estimate volume | Growth indicator |
| **Feedback Completion Rate** | % of estimates with actual cost data submitted | > 30% |
| **Time to Estimate** | Minutes from input to final estimate | < 5 min |
| **User Retention** | Monthly active users returning | > 70% |

---

## MVP Scope

### Core Features

**MVP delivers a complete Deep Agent estimation pipeline for single-family residential projects.**

#### 1. Full 7-Agent Pipeline

All agents operational from day one:

| Agent | MVP Capability |
|-------|----------------|
| **1. Clarification Agent** | Natural language project intake; structured brief generation |
| **2. Location Intelligence Agent** | Zip-code based labor rates, permit cost lookup, weather/seasonal factors |
| **3. Construction Scope Agent** | Bill of Quantities (BoQ) in CSI MasterFormat for residential projects |
| **4. Cost Estimation Agent** | Material, labor, equipment costs using mocked RSMeans data |
| **5. Timeline Estimation Agent** | CPM-based scheduling, duration calculation with productivity factors |
| **6. Risk Analysis Agent** | Monte Carlo simulation, contingency calculation, confidence intervals |
| **7. Final Estimator Agent** | Risk-adjusted estimate, professional report generation |

#### 2. Residential Project Coverage

Support for all single-family home project types:

- **Remodels:** Kitchen, bathroom, basement, whole-home
- **Additions:** Room additions, ADUs, garage conversions
- **New Construction:** Custom home builds
- **Exterior:** Roofing, siding, windows, decks
- **Systems:** HVAC, electrical, plumbing upgrades

#### 3. Data Strategy (MVP)

| Data Type | MVP Approach | Future State |
|-----------|--------------|--------------|
| **Cost Data (RSMeans)** | Mocked dataset with exact RSMeans schema | Full RSMeans API integration |
| **Labor Rates** | BLS data + regional adjustments | RSMeans labor + historical actuals |
| **Location Data** | Zip-code lookup for region, weather, permits | Full geospatial integration |
| **Permit Costs** | Estimated % of project value by region | Municipal API integration |

**RSMeans Mock Data Requirements:**
- Exact schema match for seamless future integration
- Coverage for all CSI divisions relevant to residential (03-Concrete, 06-Wood, 09-Finishes, 22-Plumbing, 23-HVAC, 26-Electrical, etc.)
- Unit costs, labor hours, crew compositions, productivity factors

#### 4. Professional Output Document

Full estimate report including:

- **Executive Summary** - Total cost, timeline, confidence range
- **Detailed Cost Breakdown** - By CSI division, with material/labor/equipment split
- **Bill of Quantities** - Line-item quantities and unit costs
- **Labor Analysis** - Man-hours by trade, crew requirements
- **Project Schedule** - Gantt-style timeline with critical path
- **Risk Assessment** - Key risks, Monte Carlo results, recommended contingency
- **Assumptions & Exclusions** - Transparency on estimate basis

**Format:** PDF export, client-ready presentation

#### 5. User Interface

- **Conversational Input** - Describe project in plain English via chat interface
- **Clarification Flow** - Agent asks follow-up questions to refine scope
- **Estimate Dashboard** - View, compare, and manage estimates
- **Feedback Capture** - Input actual costs post-project for accuracy tracking

### Out of Scope for MVP

| Feature | Rationale |
|---------|-----------|
| **Commercial projects** | Focus on residential to prove accuracy first |
| **Multi-family residential** | Complexity deferred; single-family focus |
| **Live RSMeans integration** | Cost/complexity; mocked data validates pipeline |
| **BIM/CAD file import** | Manual/conversational input sufficient for MVP |
| **Real-time material pricing (Home Depot API)** | Nice-to-have; mocked data covers MVP |
| **Mobile app** | Web-first; mobile can follow |
| **Team collaboration features** | Single-user focus for MVP |
| **Integrations (QuickBooks, Buildertrend)** | Post-MVP after core value proven |

### MVP Success Criteria

- [ ] All 7 agents functional and communicating via LangGraph
- [ ] Generate accurate estimates for 5+ residential project types
- [ ] Professional PDF estimate output
- [ ] MAPE < 15% on test projects (stretch: < 10%)
- [ ] End-to-end estimate generation in < 5 minutes
- [ ] Feedback loop captures actual vs. estimated costs

---

## Technical Preferences

| Aspect | Decision |
|--------|----------|
| **Architecture** | LangChain Deep Agents + LangGraph (per research blueprint) |
| **Infrastructure** | Leverage existing CollabCanvas infrastructure (React + Firebase) |
| **Backend Stack** | To be determined in Architecture phase |
| **Deployment** | API-based service (per research blueprint recommendation) |

**Note:** Detailed technical decisions (Python vs. Node, database choices, hosting) will be made during the Architecture workflow.

---

## Risks and Assumptions

### Key Assumptions

1. **RSMeans Schema Stability** - Mocked data built to RSMeans schema will remain compatible when we integrate the real API
2. **Residential Cost Patterns** - Single-family residential projects have predictable cost structures that can be modeled with 7 agents
3. **User Feedback Willingness** - Contractors will input actual costs post-project to enable accuracy measurement
4. **LangGraph Maturity** - Deep Agents framework is production-ready for complex multi-agent workflows

### Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **RSMeans licensing cost** | High ongoing expense when moving past mocked data | Validate business model supports data costs; explore alternatives (1build API) |
| **Accuracy validation** | Hard to prove < 10% MAPE without real project data | Partner with contractors for pilot; incentivize feedback submission |
| **Agent coordination complexity** | 7-agent pipeline may have edge cases, failures | Robust error handling; human-in-the-loop fallback |
| **Residential scope breadth** | "All single-family" is wide; quality may vary by project type | Prioritize most common types (kitchen, bath) for deepest accuracy |

---

## Future Vision

Post-MVP expansion opportunities:

- **Live RSMeans Integration** - Real-time, verified cost data
- **Commercial Projects** - Expand beyond residential
- **BIM/CAD Import** - Automatic quantity takeoff from design files
- **Real-Time Material Pricing** - Home Depot/Lowes API integration
- **Mobile App** - Estimate on-site from phone
- **Integrations** - QuickBooks, Buildertrend, CoConstruct
- **Team Features** - Multi-user estimates, approval workflows
- **Historical Learning** - Company-specific productivity factors from past projects

---

_This Product Brief captures the vision and requirements for TrueCost._

_It was created through collaborative discovery and reflects the unique needs of this brownfield pivot project._

_Next: Use the PRD workflow to create detailed product requirements from this brief._
