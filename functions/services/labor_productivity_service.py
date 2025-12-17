"""Labor Productivity Service for TrueCost.

Provides researched labor productivity data for residential construction.
Includes base labor hours, crew factors, and complexity multipliers.

Data sources: Industry standards, RSMeans benchmarks, NAHB guidelines.
"""

from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
from dataclasses import dataclass
import structlog

logger = structlog.get_logger()


class ProjectType(Enum):
    """Type of construction project."""
    NEW_CONSTRUCTION = "new_construction"
    REMODEL = "remodel"
    REPAIR = "repair"
    ADDITION = "addition"


class Complexity(Enum):
    """Project complexity level."""
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class TradeType(Enum):
    """Construction trade types."""
    GENERAL_LABOR = "general_labor"
    CARPENTER = "carpenter"
    ELECTRICIAN = "electrician"
    PLUMBER = "plumber"
    HVAC = "hvac"
    PAINTER = "painter"
    TILE_SETTER = "tile_setter"
    DRYWALL = "drywall"
    ROOFER = "roofer"
    FLOORING = "flooring"
    CONCRETE = "concrete"
    DEMOLITION = "demolition"
    CABINET_INSTALLER = "cabinet_installer"
    COUNTERTOP_INSTALLER = "countertop_installer"
    APPLIANCE_INSTALLER = "appliance_installer"


@dataclass
class CrewComposition:
    """Defines typical crew composition for a trade."""
    journeymen: int
    helpers: int
    productivity_factor: float  # Output multiplier vs single worker
    description: str


@dataclass
class LaborProductivityData:
    """Labor productivity data for a specific task."""
    base_hours_per_unit: float
    unit: str
    trade: TradeType
    typical_crew: CrewComposition
    includes_cleanup: bool = True
    notes: str = ""


# =============================================================================
# CREW COMPOSITIONS BY TRADE
# =============================================================================
# Based on industry standards for residential work
# productivity_factor accounts for coordination overhead

CREW_COMPOSITIONS: Dict[TradeType, CrewComposition] = {
    TradeType.GENERAL_LABOR: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.7,
        description="1 laborer + 1 helper"
    ),
    TradeType.CARPENTER: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.6,
        description="1 journeyman carpenter + 1 helper"
    ),
    TradeType.ELECTRICIAN: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.5,
        description="1 journeyman electrician + 1 apprentice"
    ),
    TradeType.PLUMBER: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.5,
        description="1 journeyman plumber + 1 apprentice"
    ),
    TradeType.HVAC: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.5,
        description="1 HVAC technician + 1 helper"
    ),
    TradeType.PAINTER: CrewComposition(
        journeymen=2, helpers=0, productivity_factor=1.8,
        description="2 painters working together"
    ),
    TradeType.TILE_SETTER: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.5,
        description="1 tile setter + 1 helper for mixing/cutting"
    ),
    TradeType.DRYWALL: CrewComposition(
        journeymen=2, helpers=0, productivity_factor=1.9,
        description="2-person drywall crew (hang) or 1 (finish)"
    ),
    TradeType.ROOFER: CrewComposition(
        journeymen=2, helpers=1, productivity_factor=2.2,
        description="2 roofers + 1 ground helper"
    ),
    TradeType.FLOORING: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.6,
        description="1 flooring installer + 1 helper"
    ),
    TradeType.CONCRETE: CrewComposition(
        journeymen=2, helpers=2, productivity_factor=2.5,
        description="2 finishers + 2 laborers for residential"
    ),
    TradeType.DEMOLITION: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.8,
        description="2-person demo crew"
    ),
    TradeType.CABINET_INSTALLER: CrewComposition(
        journeymen=1, helpers=1, productivity_factor=1.5,
        description="1 installer + 1 helper"
    ),
    TradeType.COUNTERTOP_INSTALLER: CrewComposition(
        journeymen=2, helpers=0, productivity_factor=1.8,
        description="2-person install team (heavy material)"
    ),
    TradeType.APPLIANCE_INSTALLER: CrewComposition(
        journeymen=1, helpers=0, productivity_factor=1.0,
        description="Single installer"
    ),
}


# =============================================================================
# COMPLEXITY MULTIPLIERS
# =============================================================================
# Adjusts labor hours based on job complexity

COMPLEXITY_MULTIPLIERS: Dict[Complexity, float] = {
    Complexity.SIMPLE: 0.85,      # Straightforward work, good access, no surprises
    Complexity.MODERATE: 1.00,    # Typical residential conditions
    Complexity.COMPLEX: 1.35,     # Difficult access, custom work, old home issues
}


# =============================================================================
# PROJECT TYPE MULTIPLIERS
# =============================================================================
# Remodel work typically takes longer than new construction

PROJECT_TYPE_MULTIPLIERS: Dict[ProjectType, float] = {
    ProjectType.NEW_CONSTRUCTION: 0.90,  # Open access, no existing conditions
    ProjectType.REMODEL: 1.15,           # Work around existing, protection needed
    ProjectType.REPAIR: 1.25,            # Diagnostic time, matching existing
    ProjectType.ADDITION: 1.05,          # Mix of new and tie-in work
}


# =============================================================================
# LABOR PRODUCTIVITY DATABASE
# =============================================================================
# Base hours per unit for residential construction tasks
# Hours are for a SINGLE WORKER - divide by crew productivity_factor for crew hours
# Based on industry standards and RSMeans benchmarks

LABOR_PRODUCTIVITY_DATABASE: Dict[str, Dict[str, LaborProductivityData]] = {
    # =========================================================================
    # DIVISION 01 - GENERAL REQUIREMENTS
    # =========================================================================
    "01": {
        "site_protection": LaborProductivityData(
            base_hours_per_unit=0.05, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
            notes="Floor/surface protection"
        ),
        "cleanup_daily": LaborProductivityData(
            base_hours_per_unit=0.02, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
            notes="Daily cleanup and debris removal"
        ),
        "final_cleanup": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
            notes="Final construction cleanup"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.05, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
        ),
    },

    # =========================================================================
    # DIVISION 02 - EXISTING CONDITIONS (DEMOLITION)
    # =========================================================================
    "02": {
        "demo_drywall": LaborProductivityData(
            base_hours_per_unit=0.04, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove drywall, includes hauling"
        ),
        "demo_flooring_carpet": LaborProductivityData(
            base_hours_per_unit=0.03, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove carpet and pad"
        ),
        "demo_flooring_tile": LaborProductivityData(
            base_hours_per_unit=0.12, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove ceramic/porcelain tile"
        ),
        "demo_flooring_hardwood": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove hardwood flooring"
        ),
        "demo_cabinets": LaborProductivityData(
            base_hours_per_unit=0.50, unit="LF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove base or wall cabinets"
        ),
        "demo_countertop": LaborProductivityData(
            base_hours_per_unit=0.35, unit="LF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove countertops"
        ),
        "demo_fixture_plumbing": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Remove toilet, sink, or tub"
        ),
        "demo_wall_framing": LaborProductivityData(
            base_hours_per_unit=0.15, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
            notes="Remove non-bearing wall"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.DEMOLITION,
            typical_crew=CREW_COMPOSITIONS[TradeType.DEMOLITION],
        ),
    },

    # =========================================================================
    # DIVISION 03 - CONCRETE
    # =========================================================================
    "03": {
        "slab_on_grade": LaborProductivityData(
            base_hours_per_unit=0.06, unit="SF",
            trade=TradeType.CONCRETE,
            typical_crew=CREW_COMPOSITIONS[TradeType.CONCRETE],
            notes="4\" residential slab with finish"
        ),
        "footings": LaborProductivityData(
            base_hours_per_unit=0.25, unit="LF",
            trade=TradeType.CONCRETE,
            typical_crew=CREW_COMPOSITIONS[TradeType.CONCRETE],
            notes="Continuous footings"
        ),
        "sidewalk": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.CONCRETE,
            typical_crew=CREW_COMPOSITIONS[TradeType.CONCRETE],
            notes="4\" sidewalk/patio"
        ),
        "steps": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.CONCRETE,
            typical_crew=CREW_COMPOSITIONS[TradeType.CONCRETE],
            notes="Per step/tread"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.CONCRETE,
            typical_crew=CREW_COMPOSITIONS[TradeType.CONCRETE],
        ),
    },

    # =========================================================================
    # DIVISION 06 - WOOD/PLASTICS/COMPOSITES (CARPENTRY)
    # =========================================================================
    "06": {
        "framing_wall_interior": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Interior 2x4 wall framing"
        ),
        "framing_wall_exterior": LaborProductivityData(
            base_hours_per_unit=0.12, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Exterior 2x6 wall framing"
        ),
        "framing_floor": LaborProductivityData(
            base_hours_per_unit=0.04, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Floor joist system"
        ),
        "framing_ceiling": LaborProductivityData(
            base_hours_per_unit=0.05, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Ceiling joist system"
        ),
        "subfloor": LaborProductivityData(
            base_hours_per_unit=0.025, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="3/4\" plywood subfloor"
        ),
        "blocking_backing": LaborProductivityData(
            base_hours_per_unit=0.15, unit="LF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Blocking for cabinets, fixtures"
        ),
        "trim_base": LaborProductivityData(
            base_hours_per_unit=0.06, unit="LF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Baseboard installation"
        ),
        "trim_crown": LaborProductivityData(
            base_hours_per_unit=0.12, unit="LF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Crown molding"
        ),
        "trim_casing": LaborProductivityData(
            base_hours_per_unit=0.20, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Door/window casing per opening"
        ),
        "shelving_closet": LaborProductivityData(
            base_hours_per_unit=0.25, unit="LF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Wire or wood closet shelving"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
        ),
    },

    # =========================================================================
    # DIVISION 07 - THERMAL/MOISTURE PROTECTION
    # =========================================================================
    "07": {
        "insulation_batt": LaborProductivityData(
            base_hours_per_unit=0.015, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Batt insulation in walls/ceilings"
        ),
        "insulation_blown": LaborProductivityData(
            base_hours_per_unit=0.008, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
            notes="Blown-in insulation"
        ),
        "roofing_shingle": LaborProductivityData(
            base_hours_per_unit=0.025, unit="SF",
            trade=TradeType.ROOFER,
            typical_crew=CREW_COMPOSITIONS[TradeType.ROOFER],
            notes="Asphalt shingle roofing"
        ),
        "roofing_underlayment": LaborProductivityData(
            base_hours_per_unit=0.008, unit="SF",
            trade=TradeType.ROOFER,
            typical_crew=CREW_COMPOSITIONS[TradeType.ROOFER],
            notes="Felt or synthetic underlayment"
        ),
        "siding_vinyl": LaborProductivityData(
            base_hours_per_unit=0.035, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Vinyl siding installation"
        ),
        "siding_hardie": LaborProductivityData(
            base_hours_per_unit=0.055, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Fiber cement siding"
        ),
        "waterproofing": LaborProductivityData(
            base_hours_per_unit=0.02, unit="SF",
            trade=TradeType.GENERAL_LABOR,
            typical_crew=CREW_COMPOSITIONS[TradeType.GENERAL_LABOR],
            notes="Membrane waterproofing"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.03, unit="SF",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
        ),
    },

    # =========================================================================
    # DIVISION 08 - OPENINGS (DOORS/WINDOWS)
    # =========================================================================
    "08": {
        "door_interior_prehung": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Prehung interior door"
        ),
        "door_exterior": LaborProductivityData(
            base_hours_per_unit=3.0, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Exterior entry door"
        ),
        "door_sliding_glass": LaborProductivityData(
            base_hours_per_unit=4.0, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Sliding patio door"
        ),
        "window_standard": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Standard window replacement"
        ),
        "window_large": LaborProductivityData(
            base_hours_per_unit=2.5, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Large or picture window"
        ),
        "hardware_door": LaborProductivityData(
            base_hours_per_unit=0.5, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
            notes="Lockset/handle installation"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.CARPENTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CARPENTER],
        ),
    },

    # =========================================================================
    # DIVISION 09 - FINISHES
    # =========================================================================
    "09": {
        "drywall_hang": LaborProductivityData(
            base_hours_per_unit=0.018, unit="SF",
            trade=TradeType.DRYWALL,
            typical_crew=CREW_COMPOSITIONS[TradeType.DRYWALL],
            notes="Hang drywall sheets"
        ),
        "drywall_finish_level4": LaborProductivityData(
            base_hours_per_unit=0.025, unit="SF",
            trade=TradeType.DRYWALL,
            typical_crew=CrewComposition(1, 0, 1.0, "Single finisher"),
            notes="Tape and 3-coat finish"
        ),
        "drywall_finish_level5": LaborProductivityData(
            base_hours_per_unit=0.035, unit="SF",
            trade=TradeType.DRYWALL,
            typical_crew=CrewComposition(1, 0, 1.0, "Single finisher"),
            notes="Level 5 smooth finish"
        ),
        "paint_walls_primer": LaborProductivityData(
            base_hours_per_unit=0.008, unit="SF",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
            notes="Prime coat on walls"
        ),
        "paint_walls_finish": LaborProductivityData(
            base_hours_per_unit=0.010, unit="SF",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
            notes="Finish coat on walls (per coat)"
        ),
        "paint_ceiling": LaborProductivityData(
            base_hours_per_unit=0.012, unit="SF",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
            notes="Ceiling paint per coat"
        ),
        "paint_trim": LaborProductivityData(
            base_hours_per_unit=0.04, unit="LF",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
            notes="Paint trim/base"
        ),
        "paint_door": LaborProductivityData(
            base_hours_per_unit=0.75, unit="EA",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
            notes="Paint door both sides"
        ),
        "tile_floor": LaborProductivityData(
            base_hours_per_unit=0.20, unit="SF",
            trade=TradeType.TILE_SETTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.TILE_SETTER],
            notes="Ceramic/porcelain floor tile"
        ),
        "tile_wall": LaborProductivityData(
            base_hours_per_unit=0.25, unit="SF",
            trade=TradeType.TILE_SETTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.TILE_SETTER],
            notes="Wall tile (shower, backsplash)"
        ),
        "tile_backsplash": LaborProductivityData(
            base_hours_per_unit=0.30, unit="SF",
            trade=TradeType.TILE_SETTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.TILE_SETTER],
            notes="Kitchen backsplash tile"
        ),
        "flooring_hardwood": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.FLOORING,
            typical_crew=CREW_COMPOSITIONS[TradeType.FLOORING],
            notes="Hardwood flooring install"
        ),
        "flooring_laminate": LaborProductivityData(
            base_hours_per_unit=0.05, unit="SF",
            trade=TradeType.FLOORING,
            typical_crew=CREW_COMPOSITIONS[TradeType.FLOORING],
            notes="Laminate flooring install"
        ),
        "flooring_lvp": LaborProductivityData(
            base_hours_per_unit=0.04, unit="SF",
            trade=TradeType.FLOORING,
            typical_crew=CREW_COMPOSITIONS[TradeType.FLOORING],
            notes="Luxury vinyl plank/tile"
        ),
        "flooring_carpet": LaborProductivityData(
            base_hours_per_unit=0.025, unit="SF",
            trade=TradeType.FLOORING,
            typical_crew=CREW_COMPOSITIONS[TradeType.FLOORING],
            notes="Carpet and pad"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.06, unit="SF",
            trade=TradeType.PAINTER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PAINTER],
        ),
    },

    # =========================================================================
    # DIVISION 12 - FURNISHINGS (CABINETS/COUNTERTOPS)
    # =========================================================================
    "12": {
        "cabinets_base": LaborProductivityData(
            base_hours_per_unit=0.75, unit="LF",
            trade=TradeType.CABINET_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CABINET_INSTALLER],
            notes="Base cabinet installation"
        ),
        "cabinets_wall": LaborProductivityData(
            base_hours_per_unit=0.65, unit="LF",
            trade=TradeType.CABINET_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CABINET_INSTALLER],
            notes="Wall cabinet installation"
        ),
        "cabinets_tall": LaborProductivityData(
            base_hours_per_unit=1.25, unit="EA",
            trade=TradeType.CABINET_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CABINET_INSTALLER],
            notes="Tall pantry/utility cabinet"
        ),
        "countertop_laminate": LaborProductivityData(
            base_hours_per_unit=0.35, unit="LF",
            trade=TradeType.COUNTERTOP_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.COUNTERTOP_INSTALLER],
            notes="Post-form laminate countertop"
        ),
        "countertop_granite": LaborProductivityData(
            base_hours_per_unit=0.50, unit="LF",
            trade=TradeType.COUNTERTOP_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.COUNTERTOP_INSTALLER],
            notes="Granite/quartz slab countertop"
        ),
        "countertop_butcher_block": LaborProductivityData(
            base_hours_per_unit=0.45, unit="LF",
            trade=TradeType.COUNTERTOP_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.COUNTERTOP_INSTALLER],
            notes="Butcher block countertop"
        ),
        "vanity": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.CABINET_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CABINET_INSTALLER],
            notes="Bathroom vanity cabinet"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=0.60, unit="LF",
            trade=TradeType.CABINET_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.CABINET_INSTALLER],
        ),
    },

    # =========================================================================
    # DIVISION 22 - PLUMBING
    # =========================================================================
    "22": {
        "rough_in_sink": LaborProductivityData(
            base_hours_per_unit=3.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Rough plumbing for sink location"
        ),
        "rough_in_toilet": LaborProductivityData(
            base_hours_per_unit=2.5, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Rough plumbing for toilet"
        ),
        "rough_in_shower": LaborProductivityData(
            base_hours_per_unit=4.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Rough plumbing for shower/tub"
        ),
        "fixture_toilet": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install toilet"
        ),
        "fixture_sink_kitchen": LaborProductivityData(
            base_hours_per_unit=2.5, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install kitchen sink and faucet"
        ),
        "fixture_sink_bath": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install bathroom sink and faucet"
        ),
        "fixture_tub": LaborProductivityData(
            base_hours_per_unit=4.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install bathtub"
        ),
        "fixture_shower": LaborProductivityData(
            base_hours_per_unit=5.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install shower pan/base and valve"
        ),
        "fixture_disposal": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install garbage disposal"
        ),
        "fixture_dishwasher": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Connect dishwasher (plumbing only)"
        ),
        "water_heater": LaborProductivityData(
            base_hours_per_unit=4.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install tank water heater"
        ),
        "water_heater_tankless": LaborProductivityData(
            base_hours_per_unit=6.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Install tankless water heater"
        ),
        "pipe_supply": LaborProductivityData(
            base_hours_per_unit=0.15, unit="LF",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="Water supply piping"
        ),
        "pipe_drain": LaborProductivityData(
            base_hours_per_unit=0.20, unit="LF",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
            notes="DWV drain piping"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.PLUMBER,
            typical_crew=CREW_COMPOSITIONS[TradeType.PLUMBER],
        ),
    },

    # =========================================================================
    # DIVISION 23 - HVAC
    # =========================================================================
    "23": {
        "furnace": LaborProductivityData(
            base_hours_per_unit=8.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install gas furnace"
        ),
        "ac_condenser": LaborProductivityData(
            base_hours_per_unit=6.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install AC condenser unit"
        ),
        "ac_coil": LaborProductivityData(
            base_hours_per_unit=3.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install evaporator coil"
        ),
        "heat_pump": LaborProductivityData(
            base_hours_per_unit=10.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install heat pump system"
        ),
        "mini_split": LaborProductivityData(
            base_hours_per_unit=6.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install ductless mini-split"
        ),
        "ductwork": LaborProductivityData(
            base_hours_per_unit=0.08, unit="SF",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Ductwork per SF of conditioned space"
        ),
        "register": LaborProductivityData(
            base_hours_per_unit=0.5, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Supply/return register"
        ),
        "thermostat": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Install thermostat"
        ),
        "exhaust_fan": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Bathroom exhaust fan"
        ),
        "range_hood": LaborProductivityData(
            base_hours_per_unit=2.5, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
            notes="Kitchen range hood with duct"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=3.0, unit="EA",
            trade=TradeType.HVAC,
            typical_crew=CREW_COMPOSITIONS[TradeType.HVAC],
        ),
    },

    # =========================================================================
    # DIVISION 26 - ELECTRICAL
    # =========================================================================
    "26": {
        "panel_main": LaborProductivityData(
            base_hours_per_unit=8.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Main electrical panel"
        ),
        "panel_sub": LaborProductivityData(
            base_hours_per_unit=4.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Sub-panel installation"
        ),
        "circuit_15_20amp": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="New 15/20 amp circuit"
        ),
        "circuit_dedicated": LaborProductivityData(
            base_hours_per_unit=2.5, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Dedicated circuit (appliance)"
        ),
        "outlet_standard": LaborProductivityData(
            base_hours_per_unit=0.75, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Standard duplex outlet"
        ),
        "outlet_gfci": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="GFCI outlet"
        ),
        "outlet_220v": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="220V outlet (dryer, range)"
        ),
        "switch_standard": LaborProductivityData(
            base_hours_per_unit=0.5, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Single pole switch"
        ),
        "switch_3way": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="3-way switch pair"
        ),
        "switch_dimmer": LaborProductivityData(
            base_hours_per_unit=0.75, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Dimmer switch"
        ),
        "light_fixture_standard": LaborProductivityData(
            base_hours_per_unit=0.75, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Standard light fixture"
        ),
        "light_fixture_recessed": LaborProductivityData(
            base_hours_per_unit=0.5, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Recessed can light"
        ),
        "light_fixture_chandelier": LaborProductivityData(
            base_hours_per_unit=2.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Chandelier/pendant"
        ),
        "fan_ceiling": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Ceiling fan"
        ),
        "smoke_detector": LaborProductivityData(
            base_hours_per_unit=0.5, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Hardwired smoke detector"
        ),
        "wire_rough": LaborProductivityData(
            base_hours_per_unit=0.04, unit="SF",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
            notes="Rough wiring per SF of space"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.ELECTRICIAN,
            typical_crew=CREW_COMPOSITIONS[TradeType.ELECTRICIAN],
        ),
    },

    # =========================================================================
    # DIVISION 44 - APPLIANCES (Custom for TrueCost)
    # =========================================================================
    "44": {
        "refrigerator": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Deliver and install refrigerator"
        ),
        "range_gas": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Gas range (plumber for gas line)"
        ),
        "range_electric": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Electric range"
        ),
        "dishwasher": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Dishwasher installation"
        ),
        "microwave_built_in": LaborProductivityData(
            base_hours_per_unit=1.5, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Built-in/OTR microwave"
        ),
        "washer_dryer": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
            notes="Washer or dryer hookup"
        ),
        "default": LaborProductivityData(
            base_hours_per_unit=1.0, unit="EA",
            trade=TradeType.APPLIANCE_INSTALLER,
            typical_crew=CREW_COMPOSITIONS[TradeType.APPLIANCE_INSTALLER],
        ),
    },
}


# =============================================================================
# COMPLEXITY INFERENCE KEYWORDS
# =============================================================================
# Used by AI to infer project complexity

COMPLEXITY_INDICATORS = {
    "simple": [
        "cosmetic", "refresh", "update", "replace existing",
        "same footprint", "no structural", "basic", "standard",
        "newer home", "built after 2000", "good condition",
        "easy access", "single story", "open floor plan"
    ],
    "moderate": [
        "remodel", "renovation", "some changes", "modify layout",
        "1980s", "1990s", "average condition", "typical",
        "two story", "standard access"
    ],
    "complex": [
        "historic", "old home", "pre-1960", "custom", "high-end",
        "structural changes", "load bearing", "difficult access",
        "tight spaces", "asbestos", "lead paint", "permits required",
        "code upgrades", "multi-story", "basement", "crawl space",
        "plaster walls", "knob and tube", "galvanized pipes",
        "matching existing", "restore", "preserve character"
    ]
}


class LaborProductivityService:
    """Service for calculating labor hours with productivity factors."""

    def __init__(self):
        """Initialize the labor productivity service."""
        self.database = LABOR_PRODUCTIVITY_DATABASE
        self.complexity_multipliers = COMPLEXITY_MULTIPLIERS
        self.project_type_multipliers = PROJECT_TYPE_MULTIPLIERS
        self.crew_compositions = CREW_COMPOSITIONS

    def get_labor_hours(
        self,
        division: str,
        task_type: str = "default",
        quantity: float = 1.0,
        complexity: Complexity = Complexity.MODERATE,
        project_type: ProjectType = ProjectType.REMODEL,
        use_crew_factor: bool = True
    ) -> Dict[str, Any]:
        """Calculate labor hours for a task.

        Args:
            division: CSI division code (e.g., "09", "22")
            task_type: Specific task within division (e.g., "tile_floor")
            quantity: Number of units
            complexity: Project complexity level
            project_type: Type of construction project
            use_crew_factor: Whether to apply crew productivity factor

        Returns:
            Dict with labor hour calculations and metadata
        """
        # Get division data
        division_data = self.database.get(division, self.database.get("01"))

        # Get task-specific or default productivity data
        productivity = division_data.get(task_type, division_data.get("default"))

        # Base calculation
        base_hours = productivity.base_hours_per_unit * quantity

        # Apply crew productivity factor
        crew_hours = base_hours
        if use_crew_factor:
            crew_hours = base_hours / productivity.typical_crew.productivity_factor

        # Apply complexity multiplier
        complexity_factor = self.complexity_multipliers[complexity]
        adjusted_hours = crew_hours * complexity_factor

        # Apply project type multiplier
        project_factor = self.project_type_multipliers[project_type]
        final_hours = adjusted_hours * project_factor

        return {
            "base_hours_per_unit": productivity.base_hours_per_unit,
            "quantity": quantity,
            "unit": productivity.unit,
            "base_hours": round(base_hours, 2),
            "crew_adjusted_hours": round(crew_hours, 2),
            "complexity_factor": complexity_factor,
            "project_type_factor": project_factor,
            "final_hours": round(final_hours, 2),
            "trade": productivity.trade.value,
            "crew": {
                "journeymen": productivity.typical_crew.journeymen,
                "helpers": productivity.typical_crew.helpers,
                "productivity_factor": productivity.typical_crew.productivity_factor,
                "description": productivity.typical_crew.description
            },
            "notes": productivity.notes
        }

    def get_labor_hours_simple(
        self,
        division: str,
        quantity: float = 1.0,
        complexity: Complexity = Complexity.MODERATE,
        project_type: ProjectType = ProjectType.REMODEL
    ) -> float:
        """Get just the final labor hours value.

        Args:
            division: CSI division code
            quantity: Number of units
            complexity: Project complexity level
            project_type: Type of construction project

        Returns:
            Final labor hours as float
        """
        result = self.get_labor_hours(
            division=division,
            quantity=quantity,
            complexity=complexity,
            project_type=project_type
        )
        return result["final_hours"]

    def infer_complexity(self, project_description: str) -> Complexity:
        """Infer project complexity from description.

        This is a simple keyword-based approach. The cost agent uses
        LLM for more sophisticated inference.

        Args:
            project_description: Text describing the project

        Returns:
            Inferred Complexity level
        """
        description_lower = project_description.lower()

        # Count indicators for each complexity level
        scores = {
            Complexity.SIMPLE: 0,
            Complexity.MODERATE: 0,
            Complexity.COMPLEX: 0
        }

        for keyword in COMPLEXITY_INDICATORS["simple"]:
            if keyword in description_lower:
                scores[Complexity.SIMPLE] += 1

        for keyword in COMPLEXITY_INDICATORS["moderate"]:
            if keyword in description_lower:
                scores[Complexity.MODERATE] += 1

        for keyword in COMPLEXITY_INDICATORS["complex"]:
            if keyword in description_lower:
                scores[Complexity.COMPLEX] += 1

        # Return highest scoring complexity
        if scores[Complexity.COMPLEX] >= 2:
            return Complexity.COMPLEX
        elif scores[Complexity.SIMPLE] >= 2 and scores[Complexity.COMPLEX] == 0:
            return Complexity.SIMPLE
        else:
            return Complexity.MODERATE

    def infer_project_type(self, project_description: str) -> ProjectType:
        """Infer project type from description.

        Args:
            project_description: Text describing the project

        Returns:
            Inferred ProjectType
        """
        description_lower = project_description.lower()

        if any(kw in description_lower for kw in ["new construction", "new build", "new home", "ground up"]):
            return ProjectType.NEW_CONSTRUCTION
        elif any(kw in description_lower for kw in ["addition", "add on", "expand", "extension"]):
            return ProjectType.ADDITION
        elif any(kw in description_lower for kw in ["repair", "fix", "patch", "replace broken"]):
            return ProjectType.REPAIR
        else:
            return ProjectType.REMODEL

    def get_available_tasks(self, division: str) -> List[str]:
        """Get list of available task types for a division.

        Args:
            division: CSI division code

        Returns:
            List of task type keys
        """
        division_data = self.database.get(division, {})
        return list(division_data.keys())

    def get_trade_for_division(self, division: str) -> TradeType:
        """Get the primary trade for a division.

        Args:
            division: CSI division code

        Returns:
            Primary TradeType for the division
        """
        division_data = self.database.get(division)
        if division_data and "default" in division_data:
            return division_data["default"].trade
        return TradeType.GENERAL_LABOR


# Module-level singleton for easy access
_service_instance: Optional[LaborProductivityService] = None


def get_labor_productivity_service() -> LaborProductivityService:
    """Get the singleton labor productivity service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = LaborProductivityService()
    return _service_instance
