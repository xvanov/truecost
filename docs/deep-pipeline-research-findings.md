# TrueCost Deep Pipeline: Comprehensive Improvement Plan

## Executive Summary

This document outlines the complete overhaul of the TrueCost estimation pipeline to **eliminate all mock data** and use **real-time web-sourced data** for accurate construction cost estimation.

**Core Principle: NO MOCK DATA - All data must come from real sources via web search, APIs, or databases.**

---

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              USER INPUT                                       │
│  Project Description + Location (ZIP Code)                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. LOCATION AGENT (Web Search + BLS API)                                    │
│     → Real labor rates, cost-of-living, weather data                         │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. SCOPE AGENT (LLM + Serper API Web Search)                                │
│     → Detailed material list with specific product names                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. COST AGENT (Global DB + Serper API + BLS API)                            │
│     → Real material prices from HD/Lowe's + real labor rates                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. CODE COMPLIANCE AGENT (Serper API Web Search)                            │
│     → Real permit fees from city/county websites                             │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5. RISK AGENT (Serper API Web Search)                                       │
│     → Current market risks, supply chain issues, delays                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  6. TIMELINE AGENT (Uses real data from above)                               │
│     → CPM scheduling with accurate labor hours                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  7. FINAL AGENT                                                               │
│     → Aggregates all real data into final estimate                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent-by-Agent Implementation Plan

---

## 1. LOCATION AGENT

### Current Problem
- Uses `MOCK_LOCATIONS` dict with only 6 cities
- Hardcoded labor rates, permit costs, weather factors
- Falls back to 65% confidence estimates for unknown ZIPs

### New Approach: 100% Web-Sourced Data

**Data Sources:**
| Data Type | Source | API/Method |
|-----------|--------|------------|
| Labor Rates | BLS API | Occupational Employment Statistics |
| Cost of Living | Serper API | Search "[city] cost of living index 2025" |
| Weather Data | Serper API | Search "[city] average weather construction" |
| Union Status | Serper API | Search "[city] construction union rates" |

**Implementation:**

```python
# functions/agents/primary/location_agent.py

class LocationAgent(BaseA2AAgent):
    """Location Agent - fetches ALL data from real sources."""

    async def run(self, estimate_id: str, input_data: Dict, feedback: Optional[Dict] = None) -> Dict:
        zip_code = input_data["clarification_output"]["projectBrief"]["zipCode"]

        # Step 1: Get city/state from ZIP (use web search)
        location_info = await self._get_location_from_zip(zip_code)
        city = location_info["city"]
        state = location_info["state"]

        # Step 2: Get labor rates from BLS API
        labor_rates = await self._get_bls_labor_rates(state)

        # Step 3: Get cost of living index via web search
        col_index = await self._search_cost_of_living(city, state)

        # Step 4: Get weather factors via web search
        weather_factors = await self._search_weather_data(city, state)

        # Step 5: Get union status via web search
        union_info = await self._search_union_status(city, state)

        return {
            "zipCode": zip_code,
            "city": city,
            "state": state,
            "laborRates": labor_rates,
            "costOfLivingIndex": col_index,
            "locationFactor": col_index / 100,  # Normalize
            "weatherFactors": weather_factors,
            "unionStatus": union_info,
            "confidence": 0.90,
            "dataSources": ["bls_api", "serper_web_search"]
        }

    async def _get_location_from_zip(self, zip_code: str) -> Dict:
        """Get city/state from ZIP using web search."""
        results = await self._serper_search(f"{zip_code} ZIP code city state")
        # LLM extracts city/state from results
        return await self._llm_extract_location(results)

    async def _get_bls_labor_rates(self, state: str) -> Dict:
        """Get labor rates from BLS API."""
        rates = {}
        for trade, occ_code in BLS_OCCUPATION_CODES.items():
            rate = await self.bls_service.get_hourly_wage(occ_code, state)
            rates[trade] = rate
        return rates

    async def _search_cost_of_living(self, city: str, state: str) -> float:
        """Search for cost of living index."""
        results = await self._serper_search(f"{city} {state} cost of living index 2025")
        # LLM extracts COL index from results
        return await self._llm_extract_col_index(results)

    async def _search_weather_data(self, city: str, state: str) -> Dict:
        """Search for weather factors affecting construction."""
        results = await self._serper_search(
            f"{city} {state} average weather construction season delays"
        )
        return await self._llm_extract_weather_factors(results)

    async def _search_union_status(self, city: str, state: str) -> Dict:
        """Search for union labor information."""
        results = await self._serper_search(
            f"{city} {state} construction union labor rates prevailing wage"
        )
        return await self._llm_extract_union_info(results)
```

---

## 2. SCOPE AGENT

### Current Problem
- Generates high-level line items like "Install interior partition walls"
- No specific product names for price lookup
- Cannot generate BOM

### New Approach: Detailed Material Lists via Web Search

**Goal:** Generate specific, searchable product names like "2x4x8 SPF Stud" instead of "lumber"

**Implementation:**

```python
# functions/agents/primary/scope_agent.py

SCOPE_AGENT_SYSTEM_PROMPT = """You are an expert construction estimator.

Your task is to generate a DETAILED material list for the project.

CRITICAL REQUIREMENTS:
1. Every material must have a SPECIFIC, SEARCHABLE product name
2. Product names must match what you'd find on Home Depot or Lowe's
3. Include exact sizes, dimensions, and specifications
4. Calculate accurate quantities based on project scope

EXAMPLES OF CORRECT OUTPUT:
✅ "2x4x8 SPF Stud" (qty: 180, unit: EA)
✅ "1/2in Drywall Sheet 4x8" (qty: 32, unit: EA)
✅ "Moen Arbor Kitchen Faucet Chrome" (qty: 1, unit: EA)
✅ "LVP Flooring Plank 7x48in Oak" (qty: 250, unit: SF)

EXAMPLES OF INCORRECT OUTPUT (DO NOT USE):
❌ "Lumber" - too vague
❌ "Drywall materials" - not searchable
❌ "Kitchen faucet" - no brand/model
❌ "Flooring" - no specifications

For each line item, provide:
- productName: Specific searchable name
- quantity: Calculated amount
- unit: EA, SF, LF, etc.
- category: lumber, electrical, plumbing, etc.
"""

class ScopeAgent(BaseA2AAgent):
    """Scope Agent - generates detailed material lists using web search."""

    async def run(self, estimate_id: str, input_data: Dict, feedback: Optional[Dict] = None) -> Dict:
        project_brief = input_data["clarification_output"]["projectBrief"]
        project_type = project_brief["projectType"]
        scope_summary = project_brief["scopeSummary"]

        # Step 1: Web search for materials needed for this project type
        materials_research = await self._research_materials_needed(project_type, scope_summary)

        # Step 2: LLM generates detailed product list with quantities
        detailed_materials = await self._generate_detailed_materials(
            project_type=project_type,
            scope_summary=scope_summary,
            research_data=materials_research,
            feedback=feedback
        )

        return {
            "divisions": detailed_materials,
            "totalLineItems": sum(len(d["lineItems"]) for d in detailed_materials),
            "confidence": 0.85,
            "dataSources": ["serper_web_search", "llm_analysis"]
        }

    async def _research_materials_needed(self, project_type: str, scope: Dict) -> Dict:
        """Research what materials are needed for this project type."""

        # Search for materials needed
        search_queries = [
            f"{project_type} materials list complete",
            f"{project_type} what materials needed",
            f"{project_type} home depot shopping list",
            f"{project_type} bill of materials BOM",
        ]

        research_results = {}
        for query in search_queries:
            results = await self._serper_search(query)
            research_results[query] = results

        return research_results

    async def _generate_detailed_materials(
        self,
        project_type: str,
        scope_summary: Dict,
        research_data: Dict,
        feedback: Optional[Dict]
    ) -> List[Dict]:
        """Generate detailed material list using LLM + research data."""

        user_message = f"""
Project Type: {project_type}
Scope: {json.dumps(scope_summary, indent=2)}

Research Data from Web Search:
{json.dumps(research_data, indent=2)}

Based on the above, generate a DETAILED material list with specific product names.
Every product name must be searchable on Home Depot or Lowe's.

Return JSON with divisions containing line items with:
- productName (specific, searchable)
- quantity (calculated)
- unit
- category
"""

        result = await self.llm.generate_json(
            system_prompt=SCOPE_AGENT_SYSTEM_PROMPT,
            user_message=user_message
        )

        return result["content"]["divisions"]
```

**Example Output:**

```json
{
  "divisions": [
    {
      "divisionCode": "06",
      "divisionName": "Wood and Plastics",
      "lineItems": [
        {"productName": "2x4x8 SPF Stud", "quantity": 180, "unit": "EA", "category": "lumber"},
        {"productName": "2x6x10 Pressure Treated", "quantity": 24, "unit": "EA", "category": "lumber"},
        {"productName": "3/4in Plywood Sheathing 4x8", "quantity": 12, "unit": "EA", "category": "lumber"}
      ]
    },
    {
      "divisionCode": "09",
      "divisionName": "Finishes",
      "lineItems": [
        {"productName": "1/2in Drywall Sheet 4x8", "quantity": 32, "unit": "EA", "category": "drywall"},
        {"productName": "Drywall Screws 1-5/8in 1lb Box", "quantity": 4, "unit": "EA", "category": "fasteners"},
        {"productName": "USG Joint Compound 5gal", "quantity": 2, "unit": "EA", "category": "drywall"}
      ]
    }
  ]
}
```

---

## 3. COST AGENT

### Current Problem
- Uses hardcoded mock costs
- Price comparison service is fragile
- Falls back to empty dict on failure

### New Approach: Global DB + Serper API (Like priceComparison.ts)

**Price Lookup Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    FOR EACH MATERIAL                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Check globalMaterials Database                          │
│  - Search by product name + ZIP code                             │
│  - LLM validates match confidence                                │
│  - If confidence >= 0.75: USE CACHED PRICE                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Not found or low confidence
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Serper API (Google Shopping)                            │
│  - Search product name                                           │
│  - Filter by Home Depot / Lowe's                                 │
│  - LLM selects best match                                        │
│  - Get lowest price between retailers                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Auto-save to globalMaterials                            │
│  - Save successful result for future cache hits                  │
│  - Generate aliases for better matching                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Return: price, retailer, confidence, source                     │
└─────────────────────────────────────────────────────────────────┘
```

**Labor Rate Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│  BLS API → Get hourly wage by occupation + state                 │
│  Apply location factor from Location Agent                       │
│  Apply union adjustment if applicable                            │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```python
# functions/agents/primary/cost_agent.py

class CostAgent(BaseA2AAgent):
    """Cost Agent - gets real prices from Global DB + Serper API + BLS."""

    def __init__(self, ...):
        super().__init__(...)
        self.serper_service = SerperService()
        self.bls_service = BLSService()

    async def run(self, estimate_id: str, input_data: Dict, feedback: Optional[Dict] = None) -> Dict:
        scope_output = input_data["scope_output"]
        location_output = input_data["location_output"]

        line_items = []

        # Process each material from Scope Agent
        for division in scope_output["divisions"]:
            for item in division["lineItems"]:
                # Get material price
                price_result = await self._get_material_price(
                    product_name=item["productName"],
                    zip_code=location_output["zipCode"]
                )

                # Get labor cost
                labor_result = await self._get_labor_cost(
                    category=item["category"],
                    quantity=item["quantity"],
                    location_output=location_output
                )

                line_items.append({
                    "productName": item["productName"],
                    "quantity": item["quantity"],
                    "unit": item["unit"],
                    "unitPrice": price_result["price"],
                    "totalMaterialCost": price_result["price"] * item["quantity"],
                    "laborCost": labor_result["cost"],
                    "retailer": price_result["retailer"],
                    "priceSource": price_result["source"],
                    "confidence": price_result["confidence"]
                })

        return {
            "lineItems": line_items,
            "totalMaterialCost": sum(i["totalMaterialCost"] for i in line_items),
            "totalLaborCost": sum(i["laborCost"] for i in line_items),
            "dataSources": ["global_materials_db", "serper_api", "bls_api"]
        }

    async def _get_material_price(self, product_name: str, zip_code: str) -> Dict:
        """Get material price: Global DB first, then Serper API."""

        # Step 1: Check Global Materials Database
        db = get_firestore_client()
        candidates = await find_in_global_materials(db, product_name, zip_code)

        if candidates:
            best_match = await select_best_global_match(product_name, candidates)
            if best_match["confidence"] >= 0.75:
                # Increment match count (analytics)
                await increment_match_count(db, best_match["id"])

                return {
                    "price": min(
                        best_match.get("hdPrice", float("inf")),
                        best_match.get("lowesPrice", float("inf"))
                    ),
                    "retailer": best_match["bestRetailer"],
                    "source": "global_db",
                    "confidence": best_match["confidence"]
                }

        # Step 2: Serper API (Google Shopping)
        hd_results = await self.serper_service.search_google_shopping(
            query=product_name,
            merchant_filter="Home Depot"
        )
        lowes_results = await self.serper_service.search_google_shopping(
            query=product_name,
            merchant_filter="Lowe's"
        )

        # LLM selects best match from each retailer
        hd_match = await self._llm_select_best_match(product_name, hd_results)
        lowes_match = await self._llm_select_best_match(product_name, lowes_results)

        # Get lowest price
        hd_price = hd_match["price"] if hd_match else float("inf")
        lowes_price = lowes_match["price"] if lowes_match else float("inf")

        best_price = min(hd_price, lowes_price)
        best_retailer = "homeDepot" if hd_price <= lowes_price else "lowes"

        # Step 3: Auto-save to Global Materials
        await self._auto_save_to_global_materials(
            product_name=product_name,
            zip_code=zip_code,
            hd_match=hd_match,
            lowes_match=lowes_match
        )

        return {
            "price": best_price,
            "retailer": best_retailer,
            "source": "serper_api",
            "confidence": 0.85
        }

    async def _get_labor_cost(self, category: str, quantity: float, location_output: Dict) -> Dict:
        """Get labor cost from BLS rates."""

        # Map category to trade
        trade = self._category_to_trade(category)

        # Get BLS rate (already fetched by Location Agent)
        hourly_rate = location_output["laborRates"].get(trade, 45.0)

        # Apply union adjustment
        if location_output["unionStatus"]["isUnion"]:
            hourly_rate *= 1.25  # Union premium

        # Estimate labor hours based on category
        labor_hours = await self._estimate_labor_hours(category, quantity)

        return {
            "hourlyRate": hourly_rate,
            "hours": labor_hours,
            "cost": hourly_rate * labor_hours,
            "trade": trade,
            "source": "bls_api"
        }
```

---

## 4. CODE COMPLIANCE AGENT (Permits)

### Current Problem
- Uses hardcoded permit fees
- No real data

### New Approach: Web Search for Permit Fees

**Implementation:**

```python
# functions/agents/primary/code_compliance_agent.py

class CodeComplianceAgent(BaseA2AAgent):
    """Code Compliance Agent - searches for real permit fees."""

    async def run(self, estimate_id: str, input_data: Dict, feedback: Optional[Dict] = None) -> Dict:
        location_output = input_data["location_output"]
        scope_output = input_data["scope_output"]

        city = location_output["city"]
        state = location_output["state"]
        project_type = input_data["clarification_output"]["projectBrief"]["projectType"]

        # Search for permit information
        permit_data = await self._search_permit_fees(city, state, project_type)

        return {
            "permits": permit_data["permits"],
            "totalPermitCost": permit_data["total"],
            "requirements": permit_data["requirements"],
            "dataSources": ["serper_web_search"],
            "confidence": permit_data["confidence"],
            "notes": permit_data.get("notes", "")
        }

    async def _search_permit_fees(self, city: str, state: str, project_type: str) -> Dict:
        """Search for permit fees via Serper API."""

        # Multiple search queries to find permit info
        search_queries = [
            f"{city} {state} building permit fees 2025",
            f"{city} {state} {project_type} permit cost",
            f"{city} {state} residential remodel permit requirements",
            f"{city} building department permit fee schedule",
        ]

        all_results = []
        for query in search_queries:
            results = await self._serper_search(query)
            all_results.extend(results)

        # LLM extracts permit fees from search results
        permit_data = await self._llm_extract_permit_fees(
            city=city,
            state=state,
            project_type=project_type,
            search_results=all_results
        )

        return permit_data

    async def _llm_extract_permit_fees(
        self,
        city: str,
        state: str,
        project_type: str,
        search_results: List[Dict]
    ) -> Dict:
        """Use LLM to extract permit fees from search results."""

        prompt = f"""
Based on these search results for {city}, {state} permit fees:

{json.dumps(search_results, indent=2)}

Extract the permit fees for a {project_type} project.

If specific fees are found, return them with high confidence.
If fees cannot be found, estimate based on:
- Similar cities in {state}
- National averages for {project_type}
- Project size and complexity

Return JSON:
{{
    "permits": [
        {{"type": "Building Permit", "cost": 350, "source": "city website or estimated"}},
        {{"type": "Electrical Permit", "cost": 125, "source": "..."}},
        {{"type": "Plumbing Permit", "cost": 125, "source": "..."}}
    ],
    "total": 600,
    "requirements": ["Permit required for...", "Inspection needed for..."],
    "confidence": 0.85,
    "notes": "Based on {city} building department fee schedule"
}}
"""

        result = await self.llm.generate_json(
            system_prompt="You are an expert at finding and extracting permit fee information.",
            user_message=prompt
        )

        return result["content"]
```

---

## 5. RISK AGENT

### Current Problem
- Uses LLM knowledge only
- No current market data

### New Approach: Web Search for Current Risks

**Implementation:**

```python
# functions/agents/primary/risk_agent.py

class RiskAgent(BaseA2AAgent):
    """Risk Agent - searches for current construction risks."""

    async def run(self, estimate_id: str, input_data: Dict, feedback: Optional[Dict] = None) -> Dict:
        project_type = input_data["clarification_output"]["projectBrief"]["projectType"]
        location = input_data["location_output"]

        # Search for current risks
        risks = await self._search_current_risks(project_type, location)

        return {
            "risks": risks,
            "contingencyRecommendation": self._calculate_contingency(risks),
            "dataSources": ["serper_web_search"]
        }

    async def _search_current_risks(self, project_type: str, location: Dict) -> List[Dict]:
        """Search for current construction risks."""

        search_queries = [
            f"{project_type} common problems issues 2025",
            f"construction supply chain delays 2025",
            f"{location['city']} {location['state']} construction market conditions",
            f"{project_type} cost overruns reasons",
            f"home improvement material shortages 2025",
        ]

        all_results = []
        for query in search_queries:
            results = await self._serper_search(query)
            all_results.extend(results)

        # LLM analyzes and categorizes risks
        risks = await self._llm_analyze_risks(project_type, location, all_results)

        return risks
```

---

## 6. TIMELINE AGENT

**No Changes Needed** - uses data from other agents (which now have real data).

---

## 7. FINAL AGENT

**No Changes Needed** - aggregates outputs from other agents.

---

## Serper API Service

**Shared service for all agents:**

```python
# functions/services/serper_service.py

import httpx
from typing import List, Dict, Optional

SERPER_API_URL = "https://google.serper.dev"
SERPER_TIMEOUT_MS = 30000

class SerperService:
    """Service for Serper API (Google Search & Shopping)."""

    def __init__(self):
        self.api_key = os.environ.get("SERP_API_KEY")
        if not self.api_key:
            raise ValueError("SERP_API_KEY environment variable required")

    async def search(self, query: str, num_results: int = 10) -> List[Dict]:
        """General web search via Serper API."""

        async with httpx.AsyncClient(timeout=SERPER_TIMEOUT_MS/1000) as client:
            response = await client.post(
                f"{SERPER_API_URL}/search",
                headers={
                    "X-API-KEY": self.api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "q": query,
                    "num": num_results,
                    "gl": "us",
                    "hl": "en"
                }
            )
            response.raise_for_status()
            data = response.json()

            return data.get("organic", [])

    async def search_google_shopping(
        self,
        query: str,
        merchant_filter: Optional[str] = None
    ) -> List[Dict]:
        """Google Shopping search via Serper API."""

        async with httpx.AsyncClient(timeout=SERPER_TIMEOUT_MS/1000) as client:
            response = await client.post(
                f"{SERPER_API_URL}/shopping",
                headers={
                    "X-API-KEY": self.api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "q": query,
                    "gl": "us",
                    "hl": "en"
                }
            )
            response.raise_for_status()
            data = response.json()

            results = data.get("shopping", [])

            # Filter by merchant if specified
            if merchant_filter:
                pattern = re.compile(merchant_filter, re.IGNORECASE)
                results = [r for r in results if pattern.search(r.get("source", ""))]

            return results
```

---

## BLS API Service

**For labor rates:**

```python
# functions/services/bls_service.py

import httpx
from typing import Dict, Optional

BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

# BLS Occupation Codes for Construction Trades
# https://www.bls.gov/oes/current/oes_stru.htm
BLS_OCCUPATION_CODES = {
    "electrician": "47-2111",
    "plumber": "47-2152",
    "carpenter": "47-2031",
    "hvac": "49-9021",
    "painter": "47-2141",
    "roofer": "47-2181",
    "tile_setter": "47-2044",
    "drywall_installer": "47-2081",
    "general_labor": "47-2061",
    "mason": "47-2021",
    "concrete_finisher": "47-2051",
    "flooring_installer": "47-2042",
    "cabinet_installer": "47-2031",  # Carpentry
}

# State FIPS codes for BLS API
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06",
    "CO": "08", "CT": "09", "DE": "10", "FL": "12", "GA": "13",
    "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
    "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24",
    "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29",
    "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34",
    "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45",
    "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50",
    "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
}

class BLSService:
    """Service for Bureau of Labor Statistics API."""

    def __init__(self):
        # BLS API key is optional but recommended for higher rate limits
        self.api_key = os.environ.get("BLS_API_KEY")

    async def get_hourly_wage(
        self,
        occupation_code: str,
        state: str
    ) -> float:
        """Get mean hourly wage for occupation in state."""

        state_fips = STATE_FIPS.get(state.upper(), "00")

        # BLS Series ID format: OEUS + state_fips + area + occupation + data_type
        # Data type 03 = mean hourly wage
        series_id = f"OEUS{state_fips}000000{occupation_code}03"

        payload = {
            "seriesid": [series_id],
            "startyear": "2024",
            "endyear": "2025"
        }

        if self.api_key:
            payload["registrationkey"] = self.api_key

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(BLS_API_URL, json=payload)
            response.raise_for_status()
            data = response.json()

            # Extract latest value
            if data.get("Results", {}).get("series"):
                series_data = data["Results"]["series"][0].get("data", [])
                if series_data:
                    # Get most recent value
                    latest = series_data[0]
                    return float(latest.get("value", 0))

            # Fallback: search for rate via web
            return await self._fallback_web_search(occupation_code, state)

    async def _fallback_web_search(self, occupation_code: str, state: str) -> float:
        """Fallback to web search if BLS API fails."""
        # Use Serper to search for labor rates
        serper = SerperService()
        occupation_name = self._code_to_name(occupation_code)
        results = await serper.search(f"{occupation_name} hourly wage {state} 2025")
        # LLM extracts rate from results
        # ... implementation
        return 45.0  # Default if all else fails

    def _code_to_name(self, code: str) -> str:
        """Convert occupation code to name for search."""
        for name, occ_code in BLS_OCCUPATION_CODES.items():
            if occ_code == code:
                return name.replace("_", " ")
        return "construction worker"
```

---

## BLS API Registration Process

### How to Get a BLS API Key (Free)

1. **Go to BLS Registration Page**
   - URL: https://data.bls.gov/registrationEngine/

2. **Fill out the form:**
   - Email address (required)
   - First name
   - Last name
   - Organization (can use your company name or "Personal")

3. **Receive API Key**
   - Key is sent to your email immediately
   - No approval process required

4. **Add to Environment**
   ```bash
   # .env.local
   BLS_API_KEY=your_key_here
   ```

5. **Benefits of Registration**
   - Without key: 25 queries per day, 10 years of data
   - With key: 500 queries per day, 20 years of data

### BLS API Documentation
- Main docs: https://www.bls.gov/developers/
- Series ID formats: https://www.bls.gov/help/hlpforma.htm
- OES data: https://www.bls.gov/oes/

---

## API Keys Required

| Service | Cost | Required | Notes |
|---------|------|----------|-------|
| **Serper API** | $50/mo (2,500 searches) | Yes | Already using in priceComparison.ts |
| **BLS API** | Free | Yes | Registration required |
| **OpenAI API** | Pay per token | Yes | Already using |
| **Firebase** | Pay as you go | Yes | Already using |

---

## Implementation Priority

| Priority | Agent | Key Changes | Effort |
|----------|-------|-------------|--------|
| P0 | Scope Agent | Add web search for materials | Medium |
| P0 | Cost Agent | Integrate with Global DB + Serper | Medium |
| P0 | Location Agent | Remove mock data, add BLS + web search | Medium |
| P1 | Code Compliance | Add web search for permits | Low |
| P1 | Risk Agent | Add web search for current risks | Low |
| P2 | Create SerperService | Shared service for all agents | Low |
| P2 | Create BLSService | Shared service for labor rates | Low |

---

## Success Criteria

After implementation:

1. **Zero Mock Data** - All data from real sources
2. **Material Prices** - 100% from Global DB or Serper API
3. **Labor Rates** - 100% from BLS API
4. **Permits** - From web search with estimation fallback
5. **Location Data** - From BLS + web search
6. **Risks** - From current web search results

---

## References

- [Serper API Documentation](https://serper.dev/docs)
- [BLS API Documentation](https://www.bls.gov/developers/)
- [BLS Occupational Employment Statistics](https://www.bls.gov/oes/)
- [Google Shopping via Serper](https://serper.dev/docs#google-shopping-api)
- [LangChain Tools Documentation](https://docs.langchain.com/oss/python/langchain/context-engineering)
