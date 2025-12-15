"""ClarificationOutput v3.0.0 Pydantic models.

This module defines the data models for the handoff artifact between
the Clarification Agent (Dev 3) and the Deep Agent Pipeline (Dev 2).

Schema Version: 3.0.0
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


# =============================================================================
# ENUMS
# =============================================================================


class ClarificationStatus(str, Enum):
    """Status of the clarification process."""

    COMPLETE = "complete"
    NEEDS_REVIEW = "needs_review"


class ProjectType(str, Enum):
    """Type of construction project."""

    KITCHEN_REMODEL = "kitchen_remodel"
    BATHROOM_REMODEL = "bathroom_remodel"
    BEDROOM_REMODEL = "bedroom_remodel"
    LIVING_ROOM_REMODEL = "living_room_remodel"
    BASEMENT_FINISH = "basement_finish"
    ATTIC_CONVERSION = "attic_conversion"
    WHOLE_HOUSE_REMODEL = "whole_house_remodel"
    ADDITION = "addition"
    DECK_PATIO = "deck_patio"
    GARAGE = "garage"
    OTHER = "other"


class CSIDivisionStatus(str, Enum):
    """Status of a CSI division in the project scope."""

    INCLUDED = "included"
    EXCLUDED = "excluded"
    BY_OWNER = "by_owner"
    NOT_APPLICABLE = "not_applicable"


class CSIUnit(str, Enum):
    """Units of measurement for line items."""

    EACH = "each"
    EA = "ea"
    LINEAR_FEET = "linear_feet"
    LF = "lf"
    SQUARE_FEET = "square_feet"
    SF = "sf"
    CUBIC_FEET = "cubic_feet"
    CF = "cf"
    CUBIC_YARDS = "cubic_yards"
    CY = "cy"
    POUNDS = "pounds"
    LBS = "lbs"
    GALLONS = "gallons"
    GAL = "gal"
    HOURS = "hours"
    HR = "hr"
    DAYS = "days"
    ALLOWANCE = "allowance"
    LS = "ls"
    PER_OPENING = "per_opening"
    PER_FIXTURE = "per_fixture"


class LineItemSource(str, Enum):
    """Source of a line item's data."""

    CAD_EXTRACTION = "cad_extraction"
    USER_INPUT = "user_input"
    INFERRED = "inferred"
    STANDARD_ALLOWANCE = "standard_allowance"


class TimelineFlexibility(str, Enum):
    """Timeline flexibility preference."""

    STRICT = "strict"
    FLEXIBLE = "flexible"
    OPEN = "open"


class FinishLevel(str, Enum):
    """Quality/finish level of the project."""

    BUDGET = "budget"
    MID_RANGE = "mid_range"
    HIGH_END = "high_end"
    LUXURY = "luxury"


class ProjectComplexity(str, Enum):
    """Complexity level of the project."""

    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class WallType(str, Enum):
    """Type of wall."""

    INTERIOR = "interior"
    EXTERIOR = "exterior"
    LOAD_BEARING = "load_bearing"
    PARTITION = "partition"


class OpeningType(str, Enum):
    """Type of opening in a wall."""

    DOOR = "door"
    WINDOW = "window"
    ARCHWAY = "archway"
    PASS_THROUGH = "pass_through"


class SwingDirection(str, Enum):
    """Direction a door swings."""

    IN = "in"
    OUT = "out"
    LEFT = "left"
    RIGHT = "right"
    SLIDING = "sliding"
    POCKET = "pocket"


class ConnectionType(str, Enum):
    """Type of connection between rooms."""

    DOOR = "door"
    ARCHWAY = "archway"
    OPEN = "open"
    WINDOW = "window"


class ExtractionMethod(str, Enum):
    """Method used to extract CAD data."""

    EZDXF = "ezdxf"
    VISION = "vision"


class FileType(str, Enum):
    """Type of CAD file."""

    DWG = "dwg"
    DXF = "dxf"
    PDF = "pdf"
    PNG = "png"
    JPG = "jpg"


class InputMethod(str, Enum):
    """Method of user input."""

    TEXT = "text"
    VOICE = "voice"
    MIXED = "mixed"


class LengthUnit(str, Enum):
    """Units for length measurements."""

    FEET = "feet"
    INCHES = "inches"
    METERS = "meters"


class PositionSide(str, Enum):
    """Side position for openings."""

    LEFT = "left"
    RIGHT = "right"
    CENTER = "center"


# =============================================================================
# LOCATION MODELS
# =============================================================================


class Coordinates(BaseModel):
    """Geographic coordinates."""

    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")


class Location(BaseModel):
    """Project location details."""

    fullAddress: str = Field(
        ..., description="Full address (e.g., '1234 Main St, Unit 5B, Denver, CO 80202')"
    )
    streetAddress: str = Field(..., description="Street address")
    unit: Optional[str] = Field(None, description="Unit/apartment number")
    city: str = Field(..., description="City name")
    state: str = Field(..., description="State abbreviation")
    zipCode: str = Field(..., description="ZIP code")
    county: Optional[str] = Field(None, description="County name")
    coordinates: Optional[Coordinates] = Field(None, description="Geographic coordinates")


# =============================================================================
# TIMELINE MODEL
# =============================================================================


class Timeline(BaseModel):
    """Project timeline preferences."""

    desiredStart: Optional[str] = Field(None, description="Desired start date (ISO date)")
    deadline: Optional[str] = Field(None, description="Project deadline (ISO date)")
    flexibility: TimelineFlexibility = Field(
        ..., description="Timeline flexibility level"
    )


# =============================================================================
# SCOPE SUMMARY MODEL
# =============================================================================


class ScopeSummary(BaseModel):
    """High-level scope summary."""

    description: str = Field(..., description="Natural language summary of the project")
    totalSqft: float = Field(..., ge=0, description="Total square footage")
    rooms: List[str] = Field(..., description="List of rooms involved")
    finishLevel: FinishLevel = Field(..., description="Quality/finish level")
    projectComplexity: ProjectComplexity = Field(..., description="Project complexity")
    includedDivisions: List[str] = Field(
        ..., description="CSI division codes that are included"
    )
    excludedDivisions: List[str] = Field(
        ..., description="CSI division codes that are excluded"
    )
    byOwnerDivisions: List[str] = Field(
        ..., description="CSI division codes handled by owner"
    )
    notApplicableDivisions: List[str] = Field(
        ..., description="CSI division codes not applicable"
    )
    totalIncluded: int = Field(..., ge=0, description="Count of included divisions")
    totalExcluded: int = Field(..., ge=0, description="Count of excluded divisions")


# =============================================================================
# COST PREFERENCES (USER-SELECTED DEFAULTS)
# =============================================================================


class CostPreferences(BaseModel):
    """User-selected costing assumptions passed into the deep pipeline.

    Notes:
    - All percentage values are decimals in [0, 1] (e.g., 0.10 == 10%).
    - These are *inputs* chosen by the user during scope definition.
    """

    overheadPct: float = Field(0.10, ge=0, le=1, description="Overhead percent (decimal)")
    profitPct: float = Field(0.10, ge=0, le=1, description="Profit percent (decimal)")
    contingencyPct: float = Field(0.05, ge=0, le=1, description="Contingency percent (decimal)")
    wasteFactor: float = Field(1.10, ge=1, le=2, description="Waste multiplier (e.g., 1.10 == +10%)")


# =============================================================================
# PROJECT BRIEF MODEL
# =============================================================================


class ProjectBrief(BaseModel):
    """User intent and project requirements."""

    projectType: ProjectType = Field(..., description="Type of project")
    location: Location = Field(..., description="Project location")
    scopeSummary: ScopeSummary = Field(..., description="High-level scope summary")
    costPreferences: Optional[CostPreferences] = Field(
        None,
        description=(
            "User-selected costing preferences/assumptions used by the pipeline "
            "(percentages are decimals, e.g. 0.10 == 10%)."
        ),
    )
    specialRequirements: List[str] = Field(
        default_factory=list, description="Special requirements"
    )
    exclusions: List[str] = Field(
        default_factory=list, description="Items explicitly not included"
    )
    timeline: Timeline = Field(..., description="Timeline preferences")


# =============================================================================
# CSI LINE ITEM MODEL
# =============================================================================


class CSILineItem(BaseModel):
    """Individual line item in a CSI division."""

    id: str = Field(..., description="Unique identifier (e.g., '06-001')")
    item: str = Field(..., description="Item description")
    subdivisionCode: Optional[str] = Field(
        None, description="CSI subdivision code (e.g., '06 41 00')"
    )
    quantity: float = Field(..., ge=0, description="Quantity of the item")
    unit: CSIUnit = Field(..., description="Unit of measurement")
    unitDescription: Optional[str] = Field(
        None, description="Description of the unit"
    )
    specifications: Optional[str] = Field(None, description="Detailed specifications")
    notes: Optional[str] = Field(None, description="Additional notes")
    confidence: float = Field(
        ..., ge=0, le=1, description="Extraction confidence (0-1)"
    )
    source: LineItemSource = Field(..., description="Source of this line item")


# =============================================================================
# CSI DIVISION MODEL
# =============================================================================


class CSIDivision(BaseModel):
    """A single CSI MasterFormat division."""

    code: str = Field(..., description="Division code (e.g., '01', '02')")
    name: str = Field(..., description="Standard CSI division name")
    status: CSIDivisionStatus = Field(..., description="Division status in project scope")
    exclusionReason: Optional[str] = Field(
        None, description="Required if status is 'excluded'"
    )
    description: str = Field(..., description="Scope description for this division")
    items: List[CSILineItem] = Field(
        default_factory=list, description="Line items in this division"
    )

    @model_validator(mode="after")
    def check_exclusion_reason(self) -> "CSIDivision":
        """Validate that excluded divisions have an exclusion reason."""
        if self.status == CSIDivisionStatus.EXCLUDED and not self.exclusionReason:
            raise ValueError(
                f"Division {self.code} ({self.name}) has status 'excluded' "
                "but no exclusionReason provided"
            )
        return self


# =============================================================================
# CSI SCOPE MODEL (All 24 Divisions)
# =============================================================================


class CSIScope(BaseModel):
    """Complete CSI MasterFormat scope with all 24 divisions."""

    div01_general_requirements: CSIDivision = Field(
        ..., description="Division 01 - General Requirements"
    )
    div02_existing_conditions: CSIDivision = Field(
        ..., description="Division 02 - Existing Conditions"
    )
    div03_concrete: CSIDivision = Field(..., description="Division 03 - Concrete")
    div04_masonry: CSIDivision = Field(..., description="Division 04 - Masonry")
    div05_metals: CSIDivision = Field(..., description="Division 05 - Metals")
    div06_wood_plastics_composites: CSIDivision = Field(
        ..., description="Division 06 - Wood, Plastics, and Composites"
    )
    div07_thermal_moisture: CSIDivision = Field(
        ..., description="Division 07 - Thermal and Moisture Protection"
    )
    div08_openings: CSIDivision = Field(..., description="Division 08 - Openings")
    div09_finishes: CSIDivision = Field(..., description="Division 09 - Finishes")
    div10_specialties: CSIDivision = Field(
        ..., description="Division 10 - Specialties"
    )
    div11_equipment: CSIDivision = Field(..., description="Division 11 - Equipment")
    div12_furnishings: CSIDivision = Field(
        ..., description="Division 12 - Furnishings"
    )
    div13_special_construction: CSIDivision = Field(
        ..., description="Division 13 - Special Construction"
    )
    div14_conveying_equipment: CSIDivision = Field(
        ..., description="Division 14 - Conveying Equipment"
    )
    div21_fire_suppression: CSIDivision = Field(
        ..., description="Division 21 - Fire Suppression"
    )
    div22_plumbing: CSIDivision = Field(..., description="Division 22 - Plumbing")
    div23_hvac: CSIDivision = Field(
        ..., description="Division 23 - HVAC"
    )
    div25_integrated_automation: CSIDivision = Field(
        ..., description="Division 25 - Integrated Automation"
    )
    div26_electrical: CSIDivision = Field(..., description="Division 26 - Electrical")
    div27_communications: CSIDivision = Field(
        ..., description="Division 27 - Communications"
    )
    div28_electronic_safety_security: CSIDivision = Field(
        ..., description="Division 28 - Electronic Safety and Security"
    )
    div31_earthwork: CSIDivision = Field(..., description="Division 31 - Earthwork")
    div32_exterior_improvements: CSIDivision = Field(
        ..., description="Division 32 - Exterior Improvements"
    )
    div33_utilities: CSIDivision = Field(..., description="Division 33 - Utilities")

    def get_all_divisions(self) -> List[CSIDivision]:
        """Return all divisions as a list."""
        return [
            self.div01_general_requirements,
            self.div02_existing_conditions,
            self.div03_concrete,
            self.div04_masonry,
            self.div05_metals,
            self.div06_wood_plastics_composites,
            self.div07_thermal_moisture,
            self.div08_openings,
            self.div09_finishes,
            self.div10_specialties,
            self.div11_equipment,
            self.div12_furnishings,
            self.div13_special_construction,
            self.div14_conveying_equipment,
            self.div21_fire_suppression,
            self.div22_plumbing,
            self.div23_hvac,
            self.div25_integrated_automation,
            self.div26_electrical,
            self.div27_communications,
            self.div28_electronic_safety_security,
            self.div31_earthwork,
            self.div32_exterior_improvements,
            self.div33_utilities,
        ]

    def get_division_by_code(self, code: str) -> Optional[CSIDivision]:
        """Get a division by its code."""
        code_map = {
            "01": self.div01_general_requirements,
            "02": self.div02_existing_conditions,
            "03": self.div03_concrete,
            "04": self.div04_masonry,
            "05": self.div05_metals,
            "06": self.div06_wood_plastics_composites,
            "07": self.div07_thermal_moisture,
            "08": self.div08_openings,
            "09": self.div09_finishes,
            "10": self.div10_specialties,
            "11": self.div11_equipment,
            "12": self.div12_furnishings,
            "13": self.div13_special_construction,
            "14": self.div14_conveying_equipment,
            "21": self.div21_fire_suppression,
            "22": self.div22_plumbing,
            "23": self.div23_hvac,
            "25": self.div25_integrated_automation,
            "26": self.div26_electrical,
            "27": self.div27_communications,
            "28": self.div28_electronic_safety_security,
            "31": self.div31_earthwork,
            "32": self.div32_exterior_improvements,
            "33": self.div33_utilities,
        }
        return code_map.get(code)


# All 24 CSI division codes
ALL_CSI_DIVISION_CODES = [
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "21", "22", "23", "25", "26", "27",
    "28", "31", "32", "33",
]

# Mapping of division codes to names
CSI_DIVISION_NAMES = {
    "01": "General Requirements",
    "02": "Existing Conditions",
    "03": "Concrete",
    "04": "Masonry",
    "05": "Metals",
    "06": "Wood, Plastics, and Composites",
    "07": "Thermal and Moisture Protection",
    "08": "Openings",
    "09": "Finishes",
    "10": "Specialties",
    "11": "Equipment",
    "12": "Furnishings",
    "13": "Special Construction",
    "14": "Conveying Equipment",
    "21": "Fire Suppression",
    "22": "Plumbing",
    "23": "Heating, Ventilating, and Air Conditioning",
    "25": "Integrated Automation",
    "26": "Electrical",
    "27": "Communications",
    "28": "Electronic Safety and Security",
    "31": "Earthwork",
    "32": "Exterior Improvements",
    "33": "Utilities",
}


# =============================================================================
# CAD DATA MODELS
# =============================================================================


class BoundingBox(BaseModel):
    """Bounding box dimensions for a space."""

    length: float = Field(..., ge=0, description="Length dimension")
    width: float = Field(..., ge=0, description="Width dimension")
    height: float = Field(..., ge=0, description="Height dimension")
    units: LengthUnit = Field(..., description="Unit of measurement")


class Scale(BaseModel):
    """Scale information for CAD extraction."""

    detected: bool = Field(..., description="Whether scale was detected")
    ratio: Optional[float] = Field(
        None, ge=0, description="Scale ratio (e.g., 48 for 1/4\"=1')"
    )
    units: LengthUnit = Field(..., description="Unit of measurement")


class RoomDimensions(BaseModel):
    """Dimensions of a room."""

    length: float = Field(..., ge=0, description="Room length")
    width: float = Field(..., ge=0, description="Room width")
    height: Optional[float] = Field(None, ge=0, description="Room height (ceiling)")


class Room(BaseModel):
    """A room in the space model."""

    id: str = Field(..., description="Unique room identifier")
    name: str = Field(..., description="Room name")
    type: str = Field(..., description="Room type (e.g., 'kitchen', 'bathroom')")
    sqft: float = Field(..., ge=0, description="Square footage")
    dimensions: RoomDimensions = Field(..., description="Room dimensions")
    confidence: float = Field(..., ge=0, le=1, description="Extraction confidence")
    needsVerification: bool = Field(
        ..., description="Whether verification is needed"
    )


class Wall(BaseModel):
    """A wall in the space model."""

    id: str = Field(..., description="Unique wall identifier")
    length: float = Field(..., ge=0, description="Wall length")
    height: Optional[float] = Field(None, ge=0, description="Wall height")
    thickness: Optional[float] = Field(None, ge=0, description="Wall thickness")
    type: WallType = Field(..., description="Type of wall")
    material: Optional[str] = Field(None, description="Wall material")
    connectsRooms: List[str] = Field(
        default_factory=list, description="Room IDs this wall borders"
    )
    adjacentWalls: List[str] = Field(
        default_factory=list, description="Wall IDs that connect to this wall"
    )
    confidence: float = Field(..., ge=0, le=1, description="Extraction confidence")


class OpeningPosition(BaseModel):
    """Position of an opening in a wall."""

    distanceFromCorner: float = Field(
        ..., ge=0, description="Distance from nearest corner"
    )
    side: PositionSide = Field(..., description="Which side of the wall")


class Opening(BaseModel):
    """An opening (door, window, etc.) in a wall."""

    id: str = Field(..., description="Unique opening identifier")
    type: OpeningType = Field(..., description="Type of opening")
    width: float = Field(..., ge=0, description="Opening width")
    height: float = Field(..., ge=0, description="Opening height")
    # NOTE:
    # The TypeScript ClarificationOutput producer (Epic 6 estimator) currently does not
    # emit structural wall linkage for openings. We treat this as optional so the deep
    # pipeline can run with CAD openings present but not fully attributed.
    inWall: Optional[str] = Field(
        None, description="ID of wall containing this opening (optional if not derived)"
    )
    connectsRooms: List[str] = Field(
        default_factory=list, description="Which rooms this opening connects"
    )
    position: Optional[OpeningPosition] = Field(
        None, description="Position in wall (optional if not derived)"
    )
    swing: Optional[SwingDirection] = Field(
        None, description="Door swing direction"
    )
    confidence: float = Field(..., ge=0, le=1, description="Extraction confidence")


class SpaceModel(BaseModel):
    """Physical space model extracted from CAD."""

    totalSqft: float = Field(..., ge=0, description="Total square footage")
    boundingBox: BoundingBox = Field(..., description="Bounding box dimensions")
    scale: Scale = Field(..., description="Scale information")
    rooms: List[Room] = Field(default_factory=list, description="List of rooms")
    walls: List[Wall] = Field(default_factory=list, description="List of walls")
    openings: List[Opening] = Field(
        default_factory=list, description="List of openings"
    )


class RoomAdjacency(BaseModel):
    """Adjacency relationship between two rooms."""

    room1: str = Field(..., description="First room ID or name")
    room2: str = Field(..., description="Second room ID or name")
    connection: ConnectionType = Field(..., description="Type of connection")
    openingId: Optional[str] = Field(None, description="ID of the opening")


class EntryPoint(BaseModel):
    """An entry point to the space."""

    openingId: str = Field(..., description="ID of the opening")
    fromSpace: str = Field(
        ..., description="What space this entry comes from (e.g., 'hallway')"
    )
    isPrimary: bool = Field(..., description="Whether this is the primary entry")


class SpatialRelationships(BaseModel):
    """Spatial relationships between elements."""

    layoutNarrative: str = Field(
        ..., min_length=1, description="Full narrative description of the space (min 200 chars recommended)"
    )
    roomAdjacencies: List[RoomAdjacency] = Field(
        default_factory=list, description="Room adjacency relationships"
    )
    entryPoints: List[EntryPoint] = Field(
        default_factory=list, description="Entry points to the space"
    )


# =============================================================================
# PROJECT-TYPE-SPECIFIC DATA MODELS
# =============================================================================


# Kitchen-specific models


class KitchenSink(BaseModel):
    """Kitchen sink details."""

    type: str = Field(..., description="Sink type")
    location: str = Field(..., description="Location description")
    width: float = Field(..., ge=0, description="Sink width")
    adjacentTo: List[str] = Field(
        default_factory=list, description="Adjacent elements"
    )


class KitchenStove(BaseModel):
    """Kitchen stove/range details."""

    type: str = Field(..., description="Stove type (range, cooktop, wall_oven)")
    fuel: str = Field(..., description="Fuel type (gas, electric, induction)")
    location: str = Field(..., description="Location description")
    width: float = Field(..., ge=0, description="Width")
    ventilation: str = Field(..., description="Ventilation type")
    adjacentTo: List[str] = Field(
        default_factory=list, description="Adjacent elements"
    )


class KitchenRefrigerator(BaseModel):
    """Refrigerator details."""

    type: str = Field(..., description="Refrigerator type")
    location: str = Field(..., description="Location description")
    width: float = Field(..., ge=0, description="Width")
    adjacentTo: List[str] = Field(
        default_factory=list, description="Adjacent elements"
    )


class KitchenDishwasher(BaseModel):
    """Dishwasher details."""

    present: bool = Field(..., description="Whether dishwasher is present")
    location: Optional[str] = Field(None, description="Location description")
    adjacentTo: Optional[List[str]] = Field(
        None, description="Adjacent elements"
    )


class KitchenFixtures(BaseModel):
    """Kitchen fixture details."""

    sink: KitchenSink = Field(..., description="Sink details")
    stove: KitchenStove = Field(..., description="Stove details")
    refrigerator: KitchenRefrigerator = Field(..., description="Refrigerator details")
    dishwasher: KitchenDishwasher = Field(..., description="Dishwasher details")


class WorkTriangle(BaseModel):
    """Kitchen work triangle measurements."""

    sinkToStove: float = Field(..., ge=0, description="Distance sink to stove (feet)")
    stoveToFridge: float = Field(
        ..., ge=0, description="Distance stove to fridge (feet)"
    )
    fridgeToSink: float = Field(
        ..., ge=0, description="Distance fridge to sink (feet)"
    )
    triangleValid: bool = Field(
        ..., description="Whether triangle sum is between 13-26 feet"
    )


class UpperCabinets(BaseModel):
    """Upper cabinet details."""

    linearFeet: float = Field(..., ge=0, description="Linear feet of cabinets")
    walls: List[str] = Field(default_factory=list, description="Walls with cabinets")
    height: float = Field(..., ge=0, description="Cabinet height (inches)")


class LowerCabinets(BaseModel):
    """Lower cabinet details."""

    linearFeet: float = Field(..., ge=0, description="Linear feet of cabinets")
    walls: List[str] = Field(default_factory=list, description="Walls with cabinets")


class IslandDimensions(BaseModel):
    """Island dimensions."""

    length: float = Field(..., ge=0, description="Island length")
    width: float = Field(..., ge=0, description="Island width")


class KitchenIsland(BaseModel):
    """Kitchen island details."""

    present: bool = Field(..., description="Whether island is present")
    dimensions: Optional[IslandDimensions] = Field(None, description="Island dimensions")
    hasSink: Optional[bool] = Field(None, description="Whether island has a sink")
    hasCooktop: Optional[bool] = Field(None, description="Whether island has a cooktop")
    seatingCount: Optional[int] = Field(None, ge=0, description="Number of seats")


class Pantry(BaseModel):
    """Pantry details."""

    type: str = Field(..., description="Pantry type")
    sqft: Optional[float] = Field(None, ge=0, description="Square footage")


class KitchenCabinets(BaseModel):
    """Kitchen cabinet details."""

    upperCabinets: UpperCabinets = Field(..., description="Upper cabinet details")
    lowerCabinets: LowerCabinets = Field(..., description="Lower cabinet details")
    island: Optional[KitchenIsland] = Field(None, description="Island details")
    pantry: Optional[Pantry] = Field(None, description="Pantry details")


class KitchenCountertops(BaseModel):
    """Countertop measurements."""

    totalSqft: float = Field(..., ge=0, description="Total countertop square footage")
    backsplashLinearFeet: float = Field(..., ge=0, description="Linear feet of backsplash")
    backsplashHeight: float = Field(..., ge=0, description="Backsplash height (inches)")


class KitchenSpecificData(BaseModel):
    """Kitchen-specific extracted data."""

    workTriangle: WorkTriangle = Field(..., description="Work triangle measurements")
    fixtures: KitchenFixtures = Field(..., description="Kitchen fixtures")
    cabinets: KitchenCabinets = Field(..., description="Cabinet details")
    countertops: KitchenCountertops = Field(..., description="Countertop measurements")


# Bathroom-specific models


class BathroomToilet(BaseModel):
    """Toilet details."""

    present: bool = Field(..., description="Whether toilet is present")
    location: str = Field(..., description="Location description")
    type: str = Field(..., description="Toilet type")
    adjacentTo: List[str] = Field(
        default_factory=list, description="Adjacent elements"
    )
    clearanceToWall: float = Field(..., ge=0, description="Clearance to wall (inches)")
    clearanceToVanity: Optional[float] = Field(
        None, ge=0, description="Clearance to vanity (inches)"
    )


class BathroomVanity(BaseModel):
    """Vanity details."""

    type: str = Field(..., description="Vanity type")
    width: float = Field(..., ge=0, description="Vanity width")
    location: str = Field(..., description="Location description")
    sinkCount: int = Field(..., ge=1, description="Number of sinks")
    adjacentTo: List[str] = Field(
        default_factory=list, description="Adjacent elements"
    )


class ShowerDimensions(BaseModel):
    """Shower dimensions."""

    width: float = Field(..., ge=0, description="Shower width")
    depth: float = Field(..., ge=0, description="Shower depth")


class BathroomShower(BaseModel):
    """Shower details."""

    present: bool = Field(..., description="Whether shower is present")
    type: Optional[str] = Field(None, description="Shower type")
    dimensions: Optional[ShowerDimensions] = Field(None, description="Dimensions")
    location: Optional[str] = Field(None, description="Location description")
    doorType: Optional[str] = Field(None, description="Door type")
    showerhead: Optional[str] = Field(None, description="Showerhead type")
    hasNiche: Optional[bool] = Field(None, description="Has built-in niche")
    hasBench: Optional[bool] = Field(None, description="Has built-in bench")


class TubDimensions(BaseModel):
    """Tub dimensions."""

    length: float = Field(..., ge=0, description="Tub length")
    width: float = Field(..., ge=0, description="Tub width")


class BathroomTub(BaseModel):
    """Bathtub details."""

    present: bool = Field(..., description="Whether tub is present")
    type: Optional[str] = Field(None, description="Tub type")
    dimensions: Optional[TubDimensions] = Field(None, description="Dimensions")
    location: Optional[str] = Field(None, description="Location description")
    hasJets: Optional[bool] = Field(None, description="Has jets/whirlpool")


class BathroomMirror(BaseModel):
    """Mirror details."""

    present: bool = Field(..., description="Whether mirror is present")
    type: str = Field(..., description="Mirror type")
    width: Optional[float] = Field(None, ge=0, description="Mirror width")
    height: Optional[float] = Field(None, ge=0, description="Mirror height")
    location: str = Field(..., description="Location description")
    aboveVanity: bool = Field(..., description="Whether above vanity")


class BathroomFixtures(BaseModel):
    """Bathroom fixture details."""

    toilet: BathroomToilet = Field(..., description="Toilet details")
    vanity: BathroomVanity = Field(..., description="Vanity details")
    shower: Optional[BathroomShower] = Field(None, description="Shower details")
    tub: Optional[BathroomTub] = Field(None, description="Tub details")
    mirror: BathroomMirror = Field(..., description="Mirror details")


class BathroomVentilation(BaseModel):
    """Bathroom ventilation details."""

    type: str = Field(..., description="Ventilation type")
    cfm: Optional[int] = Field(None, ge=0, description="CFM rating")


class BathroomSpecificData(BaseModel):
    """Bathroom-specific extracted data."""

    fixtures: BathroomFixtures = Field(..., description="Fixture details")
    ventilation: BathroomVentilation = Field(..., description="Ventilation details")
    floorDrain: Optional[bool] = Field(None, description="Has floor drain")
    heatedFloor: Optional[bool] = Field(None, description="Has heated floor")


# Bedroom-specific models


class BedroomCloset(BaseModel):
    """Closet details."""

    type: str = Field(..., description="Closet type")
    sqft: float = Field(..., ge=0, description="Square footage")
    location: str = Field(..., description="Location description")
    hasBuiltIns: bool = Field(..., description="Has built-in organizers")


class BedroomWindow(BaseModel):
    """Bedroom window details."""

    wall: str = Field(..., description="Wall location")
    width: float = Field(..., ge=0, description="Window width")
    height: float = Field(..., ge=0, description="Window height")
    type: str = Field(..., description="Window type")


class BedroomSpecificData(BaseModel):
    """Bedroom-specific extracted data."""

    closets: List[BedroomCloset] = Field(
        default_factory=list, description="Closet details"
    )
    windows: List[BedroomWindow] = Field(
        default_factory=list, description="Window details"
    )
    ceilingType: str = Field(..., description="Ceiling type")
    ceilingHeight: float = Field(..., ge=0, description="Ceiling height")


# Living area-specific models


class Fireplace(BaseModel):
    """Fireplace details."""

    present: bool = Field(..., description="Whether fireplace is present")
    type: str = Field(..., description="Fireplace type")
    location: str = Field(..., description="Location description")
    mantle: bool = Field(..., description="Has mantle")


class BuiltInDimensions(BaseModel):
    """Built-in dimensions."""

    width: float = Field(..., ge=0, description="Width")
    height: float = Field(..., ge=0, description="Height")
    depth: float = Field(..., ge=0, description="Depth")


class BuiltIn(BaseModel):
    """Built-in furniture details."""

    type: str = Field(..., description="Built-in type")
    location: str = Field(..., description="Location description")
    dimensions: BuiltInDimensions = Field(..., description="Dimensions")


class LivingAreaSpecificData(BaseModel):
    """Living area-specific extracted data."""

    fireplace: Optional[Fireplace] = Field(None, description="Fireplace details")
    builtIns: Optional[List[BuiltIn]] = Field(None, description="Built-in details")
    ceilingType: str = Field(..., description="Ceiling type")
    ceilingHeight: float = Field(..., ge=0, description="Ceiling height")


# =============================================================================
# CAD DATA MODEL
# =============================================================================


class CADData(BaseModel):
    """CAD data extracted from uploaded files."""

    fileUrl: str = Field(..., min_length=1, description="Firebase Storage URL (required)")
    fileType: FileType = Field(..., description="Type of CAD file")
    extractionMethod: ExtractionMethod = Field(..., description="Extraction method used")
    extractionConfidence: float = Field(
        ..., ge=0, le=1, description="Overall extraction confidence"
    )
    spaceModel: SpaceModel = Field(..., description="Physical space model")
    spatialRelationships: SpatialRelationships = Field(
        ..., description="Spatial relationships"
    )
    kitchenSpecific: Optional[KitchenSpecificData] = Field(
        None, description="Kitchen-specific data"
    )
    bathroomSpecific: Optional[BathroomSpecificData] = Field(
        None, description="Bathroom-specific data"
    )
    bedroomSpecific: Optional[BedroomSpecificData] = Field(
        None, description="Bedroom-specific data"
    )
    livingAreaSpecific: Optional[LivingAreaSpecificData] = Field(
        None, description="Living area-specific data"
    )
    rawExtraction: Optional[Dict[str, Any]] = Field(
        None, description="Raw extraction data for debugging"
    )


# =============================================================================
# CONVERSATION HISTORY MODEL
# =============================================================================


class ClarificationQuestion(BaseModel):
    """A single clarification Q&A exchange."""

    question: str = Field(..., description="The question asked")
    answer: str = Field(..., description="The user's answer")
    inputMethod: InputMethod = Field(..., description="How the answer was provided")
    extractedData: Dict[str, Any] = Field(
        default_factory=dict, description="Data extracted from this Q&A"
    )


class ConversationHistory(BaseModel):
    """Audit trail of the clarification conversation."""

    inputMethod: InputMethod = Field(..., description="Primary input method")
    messageCount: int = Field(..., ge=0, description="Total message count")
    clarificationQuestions: List[ClarificationQuestion] = Field(
        default_factory=list, description="List of Q&A exchanges"
    )
    confidenceScore: float = Field(
        ..., ge=0, le=1, description="Overall understanding confidence"
    )


# =============================================================================
# VALIDATION FLAGS MODEL
# =============================================================================


class LowConfidenceItem(BaseModel):
    """An item with low confidence that may need verification."""

    field: str = Field(..., description="JSON path to the field")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score")
    reason: str = Field(..., description="Reason for low confidence")


class ValidationFlags(BaseModel):
    """Flags for downstream processing."""

    lowConfidenceItems: List[LowConfidenceItem] = Field(
        default_factory=list, description="Items needing verification"
    )
    missingData: List[str] = Field(
        default_factory=list, description="Data that couldn't be determined"
    )
    userVerificationRequired: bool = Field(
        ..., description="Whether user verification is required"
    )
    verificationItems: List[str] = Field(
        default_factory=list, description="Specific items to verify"
    )


# =============================================================================
# ROOT MODEL
# =============================================================================


class ClarificationOutput(BaseModel):
    """Root model for ClarificationOutput v3.0.0.

    This is the handoff artifact between the Clarification Agent (Dev 3)
    and the Deep Agent Pipeline (Dev 2).
    """

    # Metadata
    estimateId: str = Field(..., description="Unique estimate identifier")
    schemaVersion: Literal["3.0.0"] = Field(
        ..., description="Schema version (must be '3.0.0')"
    )
    timestamp: str = Field(..., description="ISO 8601 creation timestamp")
    clarificationStatus: ClarificationStatus = Field(
        ..., description="Status of clarification process"
    )

    # Core data sections
    projectBrief: ProjectBrief = Field(..., description="User intent and requirements")
    csiScope: CSIScope = Field(..., description="All 24 CSI divisions")
    cadData: CADData = Field(..., description="Mandatory CAD extraction")
    conversation: ConversationHistory = Field(
        ..., description="Clarification Q&A audit trail"
    )
    flags: ValidationFlags = Field(..., description="Downstream processing flags")

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "estimateId": "est_abc123",
                "schemaVersion": "3.0.0",
                "timestamp": "2025-12-10T14:30:00Z",
                "clarificationStatus": "complete",
            }
        }



