"""
BLS (Bureau of Labor Statistics) API Service for TrueCost.

Provides integration with the BLS Occupational Employment Statistics (OES) API
to retrieve real hourly wage data for construction occupations.

Architecture:
- Fetches data by MSA (Metropolitan Statistical Area) codes
- Maps SOC (Standard Occupational Classification) codes to construction trades
- Applies benefits burden calculation to get total hourly rates
- Graceful fallback to cached/default data on API failure

References:
- Story 4.5: Real Data Integration (AC 4.5.1-4.5.3, 4.5.9)
- BLS API Documentation: https://www.bls.gov/developers/api_signature_v2.htm
- SOC Code Structure: https://www.bls.gov/soc/2018/major_groups.htm

API Details:
- Endpoint: https://api.bls.gov/publicAPI/v2/timeseries/data/
- Rate limit: 500 queries/day with API key
- Data updated annually (May release)
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import os
import time

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import structlog

logger = structlog.get_logger(__name__)


# =============================================================================
# Constants and Mappings
# =============================================================================

# BLS API Configuration
BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BLS_API_TIMEOUT = 30.0  # seconds

# SOC Code Mapping for Construction Trades (AC 4.5.2)
# Maps our internal trade names to BLS Standard Occupational Classification codes
SOC_CODE_MAP: Dict[str, str] = {
    "electrician": "47-2111",    # Electricians
    "plumber": "47-2152",        # Plumbers, Pipefitters, and Steamfitters
    "carpenter": "47-2031",      # Carpenters
    "hvac_tech": "49-9021",      # Heating, AC, Refrigeration Mechanics/Installers
    "roofer": "47-2181",         # Roofers
    "painter": "47-2141",        # Painters, Construction and Maintenance
    "tile_setter": "47-2044",    # Tile and Stone Setters
    "general_labor": "47-2061",  # Construction Laborers
}

# Reverse mapping for looking up trade from SOC code
SOC_TO_TRADE_MAP = {v: k for k, v in SOC_CODE_MAP.items()}

# MSA Code Mapping - Maps zip code prefixes to Metropolitan Statistical Areas (AC 4.5.3)
# MSA codes are 5-digit identifiers for metro areas
MSA_CODE_MAP: Dict[str, Dict] = {
    # New York-Newark-Jersey City, NY-NJ-PA
    "10001": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "10002": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "10003": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    # Los Angeles-Long Beach-Anaheim, CA
    "90001": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "90002": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    # Chicago-Naperville-Elgin, IL-IN-WI
    "60601": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "60602": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    # Houston-The Woodlands-Sugar Land, TX
    "77001": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "77002": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    # Phoenix-Mesa-Chandler, AZ
    "85001": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "85002": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    # Denver-Aurora-Lakewood, CO
    "80202": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "80203": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    # Seattle-Tacoma-Bellevue, WA
    "98101": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "98102": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    # Atlanta-Sandy Springs-Alpharetta, GA
    "30301": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    "30302": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    # Durham-Chapel Hill, NC
    "27701": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    "27702": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    "27703": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    # Austin-Round Rock-San Marcos, TX
    "78701": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "78702": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "78703": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
}

# Zip prefix to MSA mapping for fallback (when specific zip not in MSA_CODE_MAP)
ZIP_PREFIX_TO_MSA: Dict[str, Dict] = {
    "100": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "101": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "900": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "901": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "606": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "607": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "770": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "771": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "850": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "851": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "802": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "803": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "981": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "982": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "303": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    "304": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    # Durham-Chapel Hill, NC
    "277": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    # Austin-Round Rock-San Marcos, TX
    "787": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "786": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
}

# Default benefits burden percentage (35%)
DEFAULT_BENEFITS_BURDEN = 0.35

# State FIPS codes for BLS API state-level queries
STATE_FIPS: Dict[str, str] = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06",
    "CO": "08", "CT": "09", "DE": "10", "DC": "11", "FL": "12",
    "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18",
    "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23",
    "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28",
    "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
    "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55",
    "WY": "56",
}

# ZIP code prefix to state mapping (first 3 digits)
ZIP_PREFIX_TO_STATE: Dict[str, str] = {
    # 00xxx - 00999: Puerto Rico (not in FIPS)
    # 01xxx - 02xxx: Massachusetts
    "010": "MA", "011": "MA", "012": "MA", "013": "MA", "014": "MA",
    "015": "MA", "016": "MA", "017": "MA", "018": "MA", "019": "MA",
    "020": "MA", "021": "MA", "022": "MA", "023": "MA", "024": "MA",
    # 02xxx: Rhode Island
    "028": "RI", "029": "RI",
    # 03xxx: New Hampshire
    "030": "NH", "031": "NH", "032": "NH", "033": "NH", "034": "NH",
    "035": "NH", "036": "NH", "037": "NH", "038": "NH",
    # 04xxx: Maine
    "039": "ME", "040": "ME", "041": "ME", "042": "ME", "043": "ME",
    "044": "ME", "045": "ME", "046": "ME", "047": "ME", "048": "ME",
    "049": "ME",
    # 05xxx: Vermont
    "050": "VT", "051": "VT", "052": "VT", "053": "VT", "054": "VT",
    "056": "VT", "057": "VT", "058": "VT", "059": "VT",
    # 06xxx: Connecticut
    "060": "CT", "061": "CT", "062": "CT", "063": "CT", "064": "CT",
    "065": "CT", "066": "CT", "067": "CT", "068": "CT", "069": "CT",
    # 07xxx-08xxx: New Jersey
    "070": "NJ", "071": "NJ", "072": "NJ", "073": "NJ", "074": "NJ",
    "075": "NJ", "076": "NJ", "077": "NJ", "078": "NJ", "079": "NJ",
    "080": "NJ", "081": "NJ", "082": "NJ", "083": "NJ", "084": "NJ",
    "085": "NJ", "086": "NJ", "087": "NJ", "088": "NJ", "089": "NJ",
    # 10xxx-14xxx: New York
    "100": "NY", "101": "NY", "102": "NY", "103": "NY", "104": "NY",
    "105": "NY", "106": "NY", "107": "NY", "108": "NY", "109": "NY",
    "110": "NY", "111": "NY", "112": "NY", "113": "NY", "114": "NY",
    "115": "NY", "116": "NY", "117": "NY", "118": "NY", "119": "NY",
    "120": "NY", "121": "NY", "122": "NY", "123": "NY", "124": "NY",
    "125": "NY", "126": "NY", "127": "NY", "128": "NY", "129": "NY",
    "130": "NY", "131": "NY", "132": "NY", "133": "NY", "134": "NY",
    "135": "NY", "136": "NY", "137": "NY", "138": "NY", "139": "NY",
    "140": "NY", "141": "NY", "142": "NY", "143": "NY", "144": "NY",
    "145": "NY", "146": "NY", "147": "NY", "148": "NY", "149": "NY",
    # 15xxx-19xxx: Pennsylvania
    "150": "PA", "151": "PA", "152": "PA", "153": "PA", "154": "PA",
    "155": "PA", "156": "PA", "157": "PA", "158": "PA", "159": "PA",
    "160": "PA", "161": "PA", "162": "PA", "163": "PA", "164": "PA",
    "165": "PA", "166": "PA", "167": "PA", "168": "PA", "169": "PA",
    "170": "PA", "171": "PA", "172": "PA", "173": "PA", "174": "PA",
    "175": "PA", "176": "PA", "177": "PA", "178": "PA", "179": "PA",
    "180": "PA", "181": "PA", "182": "PA", "183": "PA", "184": "PA",
    "185": "PA", "186": "PA", "187": "PA", "188": "PA", "189": "PA",
    "190": "PA", "191": "PA", "192": "PA", "193": "PA", "194": "PA",
    "195": "PA", "196": "PA",
    # 19xxx-20xxx: Delaware
    "197": "DE", "198": "DE", "199": "DE",
    # 20xxx: DC / Maryland
    "200": "DC", "201": "DC", "202": "DC", "203": "DC", "204": "DC",
    "205": "DC", "206": "MD", "207": "MD", "208": "MD", "209": "MD",
    "210": "MD", "211": "MD", "212": "MD", "214": "MD", "215": "MD",
    "216": "MD", "217": "MD", "218": "MD", "219": "MD",
    # 22xxx-24xxx: Virginia
    "220": "VA", "221": "VA", "222": "VA", "223": "VA", "224": "VA",
    "225": "VA", "226": "VA", "227": "VA", "228": "VA", "229": "VA",
    "230": "VA", "231": "VA", "232": "VA", "233": "VA", "234": "VA",
    "235": "VA", "236": "VA", "237": "VA", "238": "VA", "239": "VA",
    "240": "VA", "241": "VA", "242": "VA", "243": "VA", "244": "VA",
    "245": "VA", "246": "VA",
    # 24xxx-26xxx: West Virginia
    "247": "WV", "248": "WV", "249": "WV", "250": "WV", "251": "WV",
    "252": "WV", "253": "WV", "254": "WV", "255": "WV", "256": "WV",
    "257": "WV", "258": "WV", "259": "WV", "260": "WV", "261": "WV",
    "262": "WV", "263": "WV", "264": "WV", "265": "WV", "266": "WV",
    "267": "WV", "268": "WV",
    # 27xxx-28xxx: North Carolina
    "270": "NC", "271": "NC", "272": "NC", "273": "NC", "274": "NC",
    "275": "NC", "276": "NC", "277": "NC", "278": "NC", "279": "NC",
    "280": "NC", "281": "NC", "282": "NC", "283": "NC", "284": "NC",
    "285": "NC", "286": "NC", "287": "NC", "288": "NC", "289": "NC",
    # 29xxx: South Carolina
    "290": "SC", "291": "SC", "292": "SC", "293": "SC", "294": "SC",
    "295": "SC", "296": "SC", "297": "SC", "298": "SC", "299": "SC",
    # 30xxx-31xxx: Georgia
    "300": "GA", "301": "GA", "302": "GA", "303": "GA", "304": "GA",
    "305": "GA", "306": "GA", "307": "GA", "308": "GA", "309": "GA",
    "310": "GA", "311": "GA", "312": "GA", "313": "GA", "314": "GA",
    "315": "GA", "316": "GA", "317": "GA", "318": "GA", "319": "GA",
    # 32xxx-34xxx: Florida
    "320": "FL", "321": "FL", "322": "FL", "323": "FL", "324": "FL",
    "325": "FL", "326": "FL", "327": "FL", "328": "FL", "329": "FL",
    "330": "FL", "331": "FL", "332": "FL", "333": "FL", "334": "FL",
    "335": "FL", "336": "FL", "337": "FL", "338": "FL", "339": "FL",
    "340": "FL", "341": "FL", "342": "FL", "344": "FL", "346": "FL",
    "347": "FL", "349": "FL",
    # 35xxx-36xxx: Alabama
    "350": "AL", "351": "AL", "352": "AL", "354": "AL", "355": "AL",
    "356": "AL", "357": "AL", "358": "AL", "359": "AL", "360": "AL",
    "361": "AL", "362": "AL", "363": "AL", "364": "AL", "365": "AL",
    "366": "AL", "367": "AL", "368": "AL", "369": "AL",
    # 37xxx: Tennessee
    "370": "TN", "371": "TN", "372": "TN", "373": "TN", "374": "TN",
    "375": "TN", "376": "TN", "377": "TN", "378": "TN", "379": "TN",
    "380": "TN", "381": "TN", "382": "TN", "383": "TN", "384": "TN",
    "385": "TN",
    # 38xxx-39xxx: Mississippi
    "386": "MS", "387": "MS", "388": "MS", "389": "MS", "390": "MS",
    "391": "MS", "392": "MS", "393": "MS", "394": "MS", "395": "MS",
    "396": "MS", "397": "MS",
    # 40xxx-42xxx: Kentucky
    "400": "KY", "401": "KY", "402": "KY", "403": "KY", "404": "KY",
    "405": "KY", "406": "KY", "407": "KY", "408": "KY", "409": "KY",
    "410": "KY", "411": "KY", "412": "KY", "413": "KY", "414": "KY",
    "415": "KY", "416": "KY", "417": "KY", "418": "KY",
    # 43xxx-45xxx: Ohio
    "430": "OH", "431": "OH", "432": "OH", "433": "OH", "434": "OH",
    "435": "OH", "436": "OH", "437": "OH", "438": "OH", "439": "OH",
    "440": "OH", "441": "OH", "442": "OH", "443": "OH", "444": "OH",
    "445": "OH", "446": "OH", "447": "OH", "448": "OH", "449": "OH",
    "450": "OH", "451": "OH", "452": "OH", "453": "OH", "454": "OH",
    "455": "OH", "456": "OH", "457": "OH", "458": "OH",
    # 46xxx-47xxx: Indiana
    "460": "IN", "461": "IN", "462": "IN", "463": "IN", "464": "IN",
    "465": "IN", "466": "IN", "467": "IN", "468": "IN", "469": "IN",
    "470": "IN", "471": "IN", "472": "IN", "473": "IN", "474": "IN",
    "475": "IN", "476": "IN", "477": "IN", "478": "IN", "479": "IN",
    # 48xxx-49xxx: Michigan
    "480": "MI", "481": "MI", "482": "MI", "483": "MI", "484": "MI",
    "485": "MI", "486": "MI", "487": "MI", "488": "MI", "489": "MI",
    "490": "MI", "491": "MI", "492": "MI", "493": "MI", "494": "MI",
    "495": "MI", "496": "MI", "497": "MI", "498": "MI", "499": "MI",
    # 50xxx-52xxx: Iowa
    "500": "IA", "501": "IA", "502": "IA", "503": "IA", "504": "IA",
    "505": "IA", "506": "IA", "507": "IA", "508": "IA", "509": "IA",
    "510": "IA", "511": "IA", "512": "IA", "513": "IA", "514": "IA",
    "515": "IA", "516": "IA", "520": "IA", "521": "IA", "522": "IA",
    "523": "IA", "524": "IA", "525": "IA", "526": "IA", "527": "IA",
    "528": "IA",
    # 53xxx-54xxx: Wisconsin
    "530": "WI", "531": "WI", "532": "WI", "534": "WI", "535": "WI",
    "537": "WI", "538": "WI", "539": "WI", "540": "WI", "541": "WI",
    "542": "WI", "543": "WI", "544": "WI", "545": "WI", "546": "WI",
    "547": "WI", "548": "WI", "549": "WI",
    # 55xxx-56xxx: Minnesota
    "550": "MN", "551": "MN", "553": "MN", "554": "MN", "555": "MN",
    "556": "MN", "557": "MN", "558": "MN", "559": "MN", "560": "MN",
    "561": "MN", "562": "MN", "563": "MN", "564": "MN", "565": "MN",
    "566": "MN", "567": "MN",
    # 57xxx: South Dakota
    "570": "SD", "571": "SD", "572": "SD", "573": "SD", "574": "SD",
    "575": "SD", "576": "SD", "577": "SD",
    # 58xxx: North Dakota
    "580": "ND", "581": "ND", "582": "ND", "583": "ND", "584": "ND",
    "585": "ND", "586": "ND", "587": "ND", "588": "ND",
    # 59xxx: Montana
    "590": "MT", "591": "MT", "592": "MT", "593": "MT", "594": "MT",
    "595": "MT", "596": "MT", "597": "MT", "598": "MT", "599": "MT",
    # 60xxx-62xxx: Illinois
    "600": "IL", "601": "IL", "602": "IL", "603": "IL", "604": "IL",
    "605": "IL", "606": "IL", "607": "IL", "608": "IL", "609": "IL",
    "610": "IL", "611": "IL", "612": "IL", "613": "IL", "614": "IL",
    "615": "IL", "616": "IL", "617": "IL", "618": "IL", "619": "IL",
    "620": "IL", "622": "IL", "623": "IL", "624": "IL", "625": "IL",
    "626": "IL", "627": "IL", "628": "IL", "629": "IL",
    # 63xxx-65xxx: Missouri
    "630": "MO", "631": "MO", "633": "MO", "634": "MO", "635": "MO",
    "636": "MO", "637": "MO", "638": "MO", "639": "MO", "640": "MO",
    "641": "MO", "644": "MO", "645": "MO", "646": "MO", "647": "MO",
    "648": "MO", "649": "MO", "650": "MO", "651": "MO", "652": "MO",
    "653": "MO", "654": "MO", "655": "MO", "656": "MO", "657": "MO",
    "658": "MO",
    # 66xxx-67xxx: Kansas
    "660": "KS", "661": "KS", "662": "KS", "664": "KS", "665": "KS",
    "666": "KS", "667": "KS", "668": "KS", "669": "KS", "670": "KS",
    "671": "KS", "672": "KS", "673": "KS", "674": "KS", "675": "KS",
    "676": "KS", "677": "KS", "678": "KS", "679": "KS",
    # 68xxx-69xxx: Nebraska
    "680": "NE", "681": "NE", "683": "NE", "684": "NE", "685": "NE",
    "686": "NE", "687": "NE", "688": "NE", "689": "NE", "690": "NE",
    "691": "NE", "692": "NE", "693": "NE",
    # 70xxx-71xxx: Louisiana
    "700": "LA", "701": "LA", "703": "LA", "704": "LA", "705": "LA",
    "706": "LA", "707": "LA", "708": "LA", "710": "LA", "711": "LA",
    "712": "LA", "713": "LA", "714": "LA",
    # 71xxx-72xxx: Arkansas
    "716": "AR", "717": "AR", "718": "AR", "719": "AR", "720": "AR",
    "721": "AR", "722": "AR", "723": "AR", "724": "AR", "725": "AR",
    "726": "AR", "727": "AR", "728": "AR", "729": "AR",
    # 73xxx-74xxx: Oklahoma
    "730": "OK", "731": "OK", "734": "OK", "735": "OK", "736": "OK",
    "737": "OK", "738": "OK", "739": "OK", "740": "OK", "741": "OK",
    "743": "OK", "744": "OK", "745": "OK", "746": "OK", "747": "OK",
    "748": "OK", "749": "OK",
    # 75xxx-79xxx: Texas
    "750": "TX", "751": "TX", "752": "TX", "753": "TX", "754": "TX",
    "755": "TX", "756": "TX", "757": "TX", "758": "TX", "759": "TX",
    "760": "TX", "761": "TX", "762": "TX", "763": "TX", "764": "TX",
    "765": "TX", "766": "TX", "767": "TX", "768": "TX", "769": "TX",
    "770": "TX", "771": "TX", "772": "TX", "773": "TX", "774": "TX",
    "775": "TX", "776": "TX", "777": "TX", "778": "TX", "779": "TX",
    "780": "TX", "781": "TX", "782": "TX", "783": "TX", "784": "TX",
    "785": "TX", "786": "TX", "787": "TX", "788": "TX", "789": "TX",
    "790": "TX", "791": "TX", "792": "TX", "793": "TX", "794": "TX",
    "795": "TX", "796": "TX", "797": "TX", "798": "TX", "799": "TX",
    # 80xxx-81xxx: Colorado
    "800": "CO", "801": "CO", "802": "CO", "803": "CO", "804": "CO",
    "805": "CO", "806": "CO", "807": "CO", "808": "CO", "809": "CO",
    "810": "CO", "811": "CO", "812": "CO", "813": "CO", "814": "CO",
    "815": "CO", "816": "CO",
    # 82xxx-83xxx: Wyoming
    "820": "WY", "821": "WY", "822": "WY", "823": "WY", "824": "WY",
    "825": "WY", "826": "WY", "827": "WY", "828": "WY", "829": "WY",
    "830": "WY", "831": "WY",
    # 83xxx: Idaho
    "832": "ID", "833": "ID", "834": "ID", "835": "ID", "836": "ID",
    "837": "ID", "838": "ID",
    # 84xxx: Utah
    "840": "UT", "841": "UT", "842": "UT", "843": "UT", "844": "UT",
    "845": "UT", "846": "UT", "847": "UT",
    # 85xxx-86xxx: Arizona
    "850": "AZ", "851": "AZ", "852": "AZ", "853": "AZ", "855": "AZ",
    "856": "AZ", "857": "AZ", "859": "AZ", "860": "AZ", "863": "AZ",
    "864": "AZ", "865": "AZ",
    # 87xxx: New Mexico
    "870": "NM", "871": "NM", "872": "NM", "873": "NM", "874": "NM",
    "875": "NM", "877": "NM", "878": "NM", "879": "NM", "880": "NM",
    "881": "NM", "882": "NM", "883": "NM", "884": "NM",
    # 88xxx-89xxx: Nevada
    "889": "NV", "890": "NV", "891": "NV", "893": "NV", "894": "NV",
    "895": "NV", "897": "NV", "898": "NV",
    # 90xxx-96xxx: California
    "900": "CA", "901": "CA", "902": "CA", "903": "CA", "904": "CA",
    "905": "CA", "906": "CA", "907": "CA", "908": "CA", "910": "CA",
    "911": "CA", "912": "CA", "913": "CA", "914": "CA", "915": "CA",
    "916": "CA", "917": "CA", "918": "CA", "919": "CA", "920": "CA",
    "921": "CA", "922": "CA", "923": "CA", "924": "CA", "925": "CA",
    "926": "CA", "927": "CA", "928": "CA", "930": "CA", "931": "CA",
    "932": "CA", "933": "CA", "934": "CA", "935": "CA", "936": "CA",
    "937": "CA", "938": "CA", "939": "CA", "940": "CA", "941": "CA",
    "942": "CA", "943": "CA", "944": "CA", "945": "CA", "946": "CA",
    "947": "CA", "948": "CA", "949": "CA", "950": "CA", "951": "CA",
    "952": "CA", "953": "CA", "954": "CA", "955": "CA", "956": "CA",
    "957": "CA", "958": "CA", "959": "CA", "960": "CA", "961": "CA",
    # 96xxx: Hawaii
    "967": "HI", "968": "HI",
    # 97xxx: Oregon
    "970": "OR", "971": "OR", "972": "OR", "973": "OR", "974": "OR",
    "975": "OR", "976": "OR", "977": "OR", "978": "OR", "979": "OR",
    # 98xxx-99xxx: Washington
    "980": "WA", "981": "WA", "982": "WA", "983": "WA", "984": "WA",
    "985": "WA", "986": "WA", "988": "WA", "989": "WA", "990": "WA",
    "991": "WA", "992": "WA", "993": "WA", "994": "WA",
    # 99xxx: Alaska
    "995": "AK", "996": "AK", "997": "AK", "998": "AK", "999": "AK",
}

# State-level labor rates fallback (when MSA not found)
# Based on BLS 2024 state-level data
STATE_LABOR_RATES: Dict[str, Dict[str, float]] = {
    "NY": {
        "electrician": 40.50, "plumber": 42.00, "carpenter": 35.00,
        "hvac_tech": 38.00, "roofer": 32.00, "painter": 28.00,
        "tile_setter": 35.00, "general_labor": 25.00,
    },
    "CA": {
        "electrician": 42.00, "plumber": 40.00, "carpenter": 38.00,
        "hvac_tech": 36.00, "roofer": 30.00, "painter": 30.00,
        "tile_setter": 32.00, "general_labor": 26.00,
    },
    "TX": {
        "electrician": 28.50, "plumber": 29.00, "carpenter": 24.00,
        "hvac_tech": 28.00, "roofer": 22.00, "painter": 22.00,
        "tile_setter": 21.00, "general_labor": 19.00,
    },
    "FL": {
        "electrician": 26.00, "plumber": 27.00, "carpenter": 23.00,
        "hvac_tech": 26.00, "roofer": 21.00, "painter": 20.00,
        "tile_setter": 22.00, "general_labor": 18.00,
    },
    "IL": {
        "electrician": 48.00, "plumber": 48.00, "carpenter": 37.00,
        "hvac_tech": 36.00, "roofer": 34.00, "painter": 30.00,
        "tile_setter": 26.00, "general_labor": 33.00,
    },
    "PA": {
        "electrician": 35.00, "plumber": 36.00, "carpenter": 30.00,
        "hvac_tech": 32.00, "roofer": 27.00, "painter": 25.00,
        "tile_setter": 28.00, "general_labor": 22.00,
    },
    "OH": {
        "electrician": 32.00, "plumber": 33.00, "carpenter": 28.00,
        "hvac_tech": 30.00, "roofer": 25.00, "painter": 24.00,
        "tile_setter": 26.00, "general_labor": 21.00,
    },
    "GA": {
        "electrician": 29.00, "plumber": 28.00, "carpenter": 25.00,
        "hvac_tech": 27.00, "roofer": 24.00, "painter": 23.00,
        "tile_setter": 24.00, "general_labor": 19.00,
    },
    "NC": {
        "electrician": 28.00, "plumber": 28.00, "carpenter": 24.00,
        "hvac_tech": 27.00, "roofer": 24.00, "painter": 22.00,
        "tile_setter": 21.00, "general_labor": 22.00,
    },
    "MI": {
        "electrician": 33.00, "plumber": 34.00, "carpenter": 29.00,
        "hvac_tech": 31.00, "roofer": 26.00, "painter": 25.00,
        "tile_setter": 27.00, "general_labor": 22.00,
    },
    "WA": {
        "electrician": 49.00, "plumber": 42.00, "carpenter": 37.00,
        "hvac_tech": 36.00, "roofer": 30.00, "painter": 28.00,
        "tile_setter": 35.00, "general_labor": 29.00,
    },
    "AZ": {
        "electrician": 29.00, "plumber": 30.00, "carpenter": 26.00,
        "hvac_tech": 27.00, "roofer": 22.00, "painter": 23.00,
        "tile_setter": 23.00, "general_labor": 22.00,
    },
    "CO": {
        "electrician": 32.00, "plumber": 33.00, "carpenter": 29.00,
        "hvac_tech": 31.00, "roofer": 26.00, "painter": 25.00,
        "tile_setter": 27.00, "general_labor": 24.00,
    },
    "MA": {
        "electrician": 38.00, "plumber": 40.00, "carpenter": 34.00,
        "hvac_tech": 36.00, "roofer": 30.00, "painter": 28.00,
        "tile_setter": 32.00, "general_labor": 26.00,
    },
    "NJ": {
        "electrician": 39.00, "plumber": 41.00, "carpenter": 35.00,
        "hvac_tech": 37.00, "roofer": 31.00, "painter": 29.00,
        "tile_setter": 33.00, "general_labor": 27.00,
    },
}


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class BLSLaborRate:
    """
    Labor rate data retrieved from BLS API.

    Attributes:
        trade: Internal trade name (e.g., "electrician")
        soc_code: BLS Standard Occupational Classification code
        hourly_rate: Base hourly wage from BLS
        total_rate: Hourly rate including benefits burden
        benefits_burden: Benefits burden percentage applied
        msa_code: Metropolitan Statistical Area code
        metro_name: Human-readable metro area name
        data_year: Year of the data
        source: Data source indicator ("BLS" or "cached")
    """
    trade: str
    soc_code: str
    hourly_rate: float
    total_rate: float
    benefits_burden: float
    msa_code: str
    metro_name: str
    data_year: str
    source: str = "BLS"


@dataclass
class BLSResponse:
    """
    Complete response from BLS API for a location.

    Attributes:
        zip_code: Original zip code requested
        msa_code: MSA code used for lookup
        metro_name: Metro area name
        rates: Dict mapping trade name to BLSLaborRate
        data_date: Date of the data (YYYY-MM format)
        cached: Whether this came from cache
    """
    zip_code: str
    msa_code: str
    metro_name: str
    rates: Dict[str, BLSLaborRate]
    data_date: str
    cached: bool = False


# =============================================================================
# Fallback/Default Data
# =============================================================================

# Default labor rates by MSA for fallback when API fails (AC 4.5.8)
# Updated with O*NET 2024 median hourly wages (source: BLS OES via O*NET Online)
DEFAULT_RATES_BY_MSA: Dict[str, Dict[str, float]] = {
    "35620": {  # NYC - New York-Newark-Jersey City
        "electrician": 36.76,
        "plumber": 38.18,
        "carpenter": 33.50,
        "hvac_tech": 35.62,
        "roofer": 35.80,
        "painter": 28.10,
        "tile_setter": 35.02,
        "general_labor": 29.74,
    },
    "31080": {  # LA - Los Angeles-Long Beach-Anaheim
        "electrician": 36.60,
        "plumber": 31.30,
        "carpenter": 35.50,
        "hvac_tech": 31.16,
        "roofer": 30.22,
        "painter": 27.91,
        "tile_setter": 26.54,
        "general_labor": 28.62,
    },
    "16980": {  # Chicago - Chicago-Naperville-Elgin
        "electrician": 47.86,
        "plumber": 47.54,
        "carpenter": 36.79,
        "hvac_tech": 35.77,
        "roofer": 33.45,
        "painter": 30.36,
        "tile_setter": 25.69,
        "general_labor": 32.89,
    },
    "26420": {  # Houston - Houston-Pasadena-The Woodlands
        "electrician": 28.45,
        "plumber": 28.96,
        "carpenter": 23.51,
        "hvac_tech": 27.84,
        "roofer": 21.41,
        "painter": 21.63,
        "tile_setter": 20.98,
        "general_labor": 18.51,
    },
    "38060": {  # Phoenix - Arizona state data (Phoenix MSA not available)
        "electrician": 28.60,
        "plumber": 29.78,
        "carpenter": 26.22,
        "hvac_tech": 27.20,
        "roofer": 22.22,
        "painter": 22.74,
        "tile_setter": 23.15,
        "general_labor": 22.21,
    },
    "19740": {  # Denver - Colorado data unavailable, using national averages
        "electrician": 29.98,
        "plumber": 30.27,
        "carpenter": 28.51,
        "hvac_tech": 28.75,
        "roofer": 24.51,
        "painter": 23.40,
        "tile_setter": 25.11,
        "general_labor": 22.47,
    },
    "42660": {  # Seattle - Seattle-Tacoma-Bellevue
        "electrician": 48.85,
        "plumber": 41.90,
        "carpenter": 36.90,
        "hvac_tech": 36.30,
        "roofer": 29.86,
        "painter": 28.49,
        "tile_setter": 35.25,
        "general_labor": 28.70,
    },
    "12060": {  # Atlanta - Atlanta-Sandy Springs-Roswell
        "electrician": 29.04,
        "plumber": 28.22,
        "carpenter": 24.71,
        "hvac_tech": 27.32,
        "roofer": 23.56,
        "painter": 23.39,
        "tile_setter": 23.78,
        "general_labor": 19.02,
    },
    "20500": {  # Durham - Durham-Chapel Hill, NC
        "electrician": 27.74,
        "plumber": 28.36,
        "carpenter": 23.51,
        "hvac_tech": 27.11,
        "roofer": 23.86,
        "painter": 22.38,
        "tile_setter": 21.26,  # NC state data (metro not available)
        "general_labor": 21.57,
    },
    "12420": {  # Austin - Austin-Round Rock-San Marcos, TX
        "electrician": 28.38,
        "plumber": 29.94,
        "carpenter": 23.87,
        "hvac_tech": 28.30,
        "roofer": 23.09,
        "painter": 21.84,
        "tile_setter": 20.93,  # TX state data (metro not available)
        "general_labor": 18.94,
    },
}

# National average rates for fallback when MSA not found
# Updated with O*NET 2024 median hourly wages (source: BLS OES via O*NET Online)
NATIONAL_AVERAGE_RATES: Dict[str, float] = {
    "electrician": 29.98,
    "plumber": 30.27,
    "carpenter": 28.51,
    "hvac_tech": 28.75,
    "roofer": 24.51,
    "painter": 23.40,
    "tile_setter": 25.11,
    "general_labor": 22.47,
}


# =============================================================================
# Helper Functions
# =============================================================================


def get_msa_for_zip(zip_code: str) -> Optional[Dict]:
    """
    Look up MSA information for a zip code.

    Args:
        zip_code: 5-digit US zip code

    Returns:
        Dict with msa_code and metro_name, or None if not found
    """
    # First try exact zip code match
    if zip_code in MSA_CODE_MAP:
        return MSA_CODE_MAP[zip_code]

    # Try zip prefix (first 3 digits)
    zip_prefix = zip_code[:3]
    if zip_prefix in ZIP_PREFIX_TO_MSA:
        return ZIP_PREFIX_TO_MSA[zip_prefix]

    # No match found
    return None


def get_state_for_zip(zip_code: str) -> Optional[str]:
    """
    Look up state abbreviation for a zip code.

    Args:
        zip_code: 5-digit US zip code

    Returns:
        State abbreviation (e.g., "CA", "NY") or None if not found
    """
    if not zip_code or len(zip_code) < 3:
        return None

    zip_prefix = zip_code[:3]
    return ZIP_PREFIX_TO_STATE.get(zip_prefix)


def get_state_labor_rates(state: str) -> Optional[Dict[str, float]]:
    """
    Get state-level labor rates for fallback.

    Args:
        state: State abbreviation (e.g., "CA", "NY")

    Returns:
        Dict mapping trade names to hourly rates, or None if not found
    """
    return STATE_LABOR_RATES.get(state.upper())


def _get_state_fallback_rates(state: str, metro_name: str = "State Average") -> Dict[str, BLSLaborRate]:
    """
    Get state-level fallback rates when BLS API fails.

    Args:
        state: State abbreviation
        metro_name: Display name for location

    Returns:
        Dict mapping trade names to BLSLaborRate objects
    """
    # Try state-specific rates, fall back to national averages
    base_rates = STATE_LABOR_RATES.get(state.upper(), NATIONAL_AVERAGE_RATES)

    rates = {}
    for trade, soc_code in SOC_CODE_MAP.items():
        hourly_rate = base_rates.get(trade, NATIONAL_AVERAGE_RATES.get(trade, 30.0))
        rates[trade] = BLSLaborRate(
            trade=trade,
            soc_code=soc_code,
            hourly_rate=hourly_rate,
            total_rate=calculate_total_rate(hourly_rate),
            benefits_burden=DEFAULT_BENEFITS_BURDEN,
            msa_code="STATE",
            metro_name=f"{state} {metro_name}",
            data_year="2024",
            source="state_fallback",
        )

    return rates


def build_bls_series_id(msa_code: str, soc_code: str) -> str:
    """
    Build a BLS OES series ID for a given MSA and SOC code.

    BLS OES series IDs follow the pattern: OEUM00{MSA}000000{SOC}03
    - OEUM = OES (Occupational Employment Statistics) Metro survey
    - 00 = Prefix padding (required)
    - {MSA} = 5-digit MSA code (e.g., 31080 for LA)
    - 000000 = Industry code (all industries)
    - {SOC} = SOC code without hyphen (e.g., 472111 for 47-2111)
    - 03 = Data type (hourly mean wage)

    Example: OEUM003108000000047211103 for LA electricians

    Args:
        msa_code: 5-digit MSA code
        soc_code: SOC code with hyphen (e.g., "47-2111")

    Returns:
        BLS series ID string (25 characters)
    """
    soc_clean = soc_code.replace("-", "")
    return f"OEUM00{msa_code}000000{soc_clean}03"


def get_bls_api_key() -> Optional[str]:
    """
    Get BLS API key from environment (AC 4.5.9).

    The API key should be stored in the BLS_API_KEY environment variable
    for Cloud Functions or local development.

    Returns:
        API key string or None if not set
    """
    return os.environ.get("BLS_API_KEY")


def calculate_total_rate(base_rate: float, burden_pct: float = DEFAULT_BENEFITS_BURDEN) -> float:
    """
    Calculate total hourly rate including benefits burden.

    Args:
        base_rate: Base hourly wage
        burden_pct: Benefits burden percentage (default 35%)

    Returns:
        Total hourly rate rounded to 2 decimal places
    """
    return round(base_rate * (1 + burden_pct), 2)


# =============================================================================
# BLS API Functions
# =============================================================================


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
)
async def _fetch_bls_data(
    series_ids: List[str],
    start_year: str,
    end_year: str,
    api_key: Optional[str] = None,
) -> Dict:
    """
    Fetch data from BLS API with retry logic.

    Args:
        series_ids: List of BLS series IDs to fetch
        start_year: Start year for data range
        end_year: End year for data range
        api_key: Optional BLS API key (for higher rate limits)

    Returns:
        Raw JSON response from BLS API

    Raises:
        httpx.HTTPError: On HTTP errors after retries
        httpx.TimeoutException: On timeout after retries
    """
    payload = {
        "seriesid": series_ids,
        "startyear": start_year,
        "endyear": end_year,
    }

    if api_key:
        payload["registrationkey"] = api_key

    async with httpx.AsyncClient(timeout=BLS_API_TIMEOUT) as client:
        response = await client.post(BLS_API_URL, json=payload)
        response.raise_for_status()
        return response.json()


def _parse_bls_response(
    response_data: Dict,
    msa_code: str,
    metro_name: str,
) -> Dict[str, BLSLaborRate]:
    """
    Parse BLS API response into BLSLaborRate objects.

    Args:
        response_data: Raw JSON response from BLS API
        msa_code: MSA code used in the request
        metro_name: Metro area name

    Returns:
        Dict mapping trade names to BLSLaborRate objects
    """
    rates = {}

    if response_data.get("status") != "REQUEST_SUCCEEDED":
        logger.warning(
            "bls_api_status_error",
            status=response_data.get("status"),
            message=response_data.get("message", []),
        )
        return rates

    for series in response_data.get("Results", {}).get("series", []):
        series_id = series.get("seriesID", "")

        # Extract SOC code from series ID
        # Series ID format: OEUM00{MSA:5}000000{SOC:6}03
        # Total: 4 + 2 + 5 + 6 + 6 + 2 = 25 characters
        # SOC starts at position 17 (4+2+5+6)
        if len(series_id) >= 25:
            soc_raw = series_id[17:23]  # Extract 6-digit SOC portion
            soc_code = f"{soc_raw[:2]}-{soc_raw[2:]}"  # Format as XX-XXXX

            trade = SOC_TO_TRADE_MAP.get(soc_code)
            if not trade:
                continue

            # Get most recent data point
            data_points = series.get("data", [])
            if data_points:
                latest = data_points[0]  # Most recent is first
                hourly_rate = float(latest.get("value", 0))
                data_year = latest.get("year", "")

                if hourly_rate > 0:
                    rates[trade] = BLSLaborRate(
                        trade=trade,
                        soc_code=soc_code,
                        hourly_rate=hourly_rate,
                        total_rate=calculate_total_rate(hourly_rate),
                        benefits_burden=DEFAULT_BENEFITS_BURDEN,
                        msa_code=msa_code,
                        metro_name=metro_name,
                        data_year=data_year,
                        source="BLS",
                    )

    return rates


def _get_fallback_rates(msa_code: str, metro_name: str) -> Dict[str, BLSLaborRate]:
    """
    Get fallback rates when BLS API fails or returns incomplete data.

    Args:
        msa_code: MSA code for rate lookup
        metro_name: Metro area name

    Returns:
        Dict mapping trade names to BLSLaborRate objects with cached data
    """
    # Try MSA-specific rates first
    base_rates = DEFAULT_RATES_BY_MSA.get(msa_code, NATIONAL_AVERAGE_RATES)

    rates = {}
    for trade, soc_code in SOC_CODE_MAP.items():
        hourly_rate = base_rates.get(trade, NATIONAL_AVERAGE_RATES.get(trade, 50.0))
        rates[trade] = BLSLaborRate(
            trade=trade,
            soc_code=soc_code,
            hourly_rate=hourly_rate,
            total_rate=calculate_total_rate(hourly_rate),
            benefits_burden=DEFAULT_BENEFITS_BURDEN,
            msa_code=msa_code,
            metro_name=metro_name,
            data_year="cached",
            source="cached",
        )

    return rates


# =============================================================================
# Main Service Functions
# =============================================================================


async def get_labor_rates_for_zip(
    zip_code: str,
    trades: Optional[List[str]] = None,
) -> BLSResponse:
    """
    Get BLS labor rates for a zip code.

    Implements AC 4.5.1-4.5.3 and AC 4.5.8:
    - AC 4.5.1: Retrieves hourly wage data for construction occupations
    - AC 4.5.2: Maps to all 8 required trades via SOC codes
    - AC 4.5.3: Fetches by MSA and maps to zip codes
    - AC 4.5.8: Graceful fallback on API failure

    Args:
        zip_code: 5-digit US zip code
        trades: Optional list of trades to fetch (defaults to all 8)

    Returns:
        BLSResponse with labor rates for requested trades
    """
    start_time = time.perf_counter()

    # Get MSA info for zip code
    msa_info = get_msa_for_zip(zip_code)

    if not msa_info:
        # No MSA mapping - try state-level fallback first
        state = get_state_for_zip(zip_code)
        if state and state in STATE_LABOR_RATES:
            logger.info(
                "bls_using_state_fallback",
                zip_code=zip_code,
                state=state,
                message="Using state-level rates",
            )
            rates = _get_state_fallback_rates(state, "State Average")
            return BLSResponse(
                zip_code=zip_code,
                msa_code="STATE",
                metro_name=f"{state} State Average",
                rates=rates,
                data_date="2024",
                cached=True,
            )
        else:
            # Fall back to national averages
            logger.info(
                "bls_no_msa_mapping",
                zip_code=zip_code,
                message="Using national average rates",
            )
            rates = _get_fallback_rates("00000", "National Average")
            return BLSResponse(
                zip_code=zip_code,
                msa_code="00000",
                metro_name="National Average",
                rates=rates,
                data_date="cached",
                cached=True,
            )

    msa_code = msa_info["msa_code"]
    metro_name = msa_info["metro_name"]

    # Determine which trades to fetch
    if trades is None:
        trades = list(SOC_CODE_MAP.keys())

    # Build series IDs for requested trades
    series_ids = []
    for trade in trades:
        if trade in SOC_CODE_MAP:
            soc_code = SOC_CODE_MAP[trade]
            series_ids.append(build_bls_series_id(msa_code, soc_code))

    # Try to fetch from BLS API
    api_key = get_bls_api_key()
    current_year = str(time.localtime().tm_year)

    try:
        response_data = await _fetch_bls_data(
            series_ids=series_ids,
            start_year=str(int(current_year) - 1),  # Previous year (BLS data has lag)
            end_year=current_year,
            api_key=api_key,
        )

        rates = _parse_bls_response(response_data, msa_code, metro_name)

        # Fill in any missing trades with fallback data
        fallback_rates = _get_fallback_rates(msa_code, metro_name)
        for trade in trades:
            if trade not in rates and trade in fallback_rates:
                rates[trade] = fallback_rates[trade]

        latency_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "bls_fetch_success",
            zip_code=zip_code,
            msa_code=msa_code,
            trades_fetched=len(rates),
            latency_ms=round(latency_ms, 2),
        )

        # Determine data date from rates
        data_dates = [r.data_year for r in rates.values() if r.data_year != "cached"]
        data_date = max(data_dates) if data_dates else "cached"

        return BLSResponse(
            zip_code=zip_code,
            msa_code=msa_code,
            metro_name=metro_name,
            rates=rates,
            data_date=data_date,
            cached=False,
        )

    except (httpx.HTTPError, httpx.TimeoutException) as e:
        # API failure - use fallback data (AC 4.5.8)
        latency_ms = (time.perf_counter() - start_time) * 1000
        logger.warning(
            "bls_api_failure",
            zip_code=zip_code,
            msa_code=msa_code,
            error=str(e),
            latency_ms=round(latency_ms, 2),
        )

        rates = _get_fallback_rates(msa_code, metro_name)
        # Filter to requested trades
        filtered_rates = {t: r for t, r in rates.items() if t in trades}

        return BLSResponse(
            zip_code=zip_code,
            msa_code=msa_code,
            metro_name=metro_name,
            rates=filtered_rates,
            data_date="cached",
            cached=True,
        )


async def get_single_trade_rate(
    zip_code: str,
    trade: str,
) -> BLSLaborRate:
    """
    Get BLS labor rate for a single trade at a location.

    Args:
        zip_code: 5-digit US zip code
        trade: Trade name (e.g., "electrician")

    Returns:
        BLSLaborRate for the specified trade

    Raises:
        ValueError: If trade is not recognized or not found in response
    """
    if trade not in SOC_CODE_MAP:
        raise ValueError(f"Unknown trade: {trade}. Valid trades: {list(SOC_CODE_MAP.keys())}")

    response = await get_labor_rates_for_zip(zip_code, trades=[trade])

    if trade not in response.rates:
        available_rates = list(response.rates.keys())
        raise ValueError(
            f"Trade '{trade}' not found in response for zip_code '{zip_code}'. "
            f"Available rates: {available_rates}"
        )

    return response.rates[trade]


def get_all_trades() -> List[str]:
    """Get list of all supported trades."""
    return list(SOC_CODE_MAP.keys())


def get_soc_code(trade: str) -> Optional[str]:
    """Get SOC code for a trade."""
    return SOC_CODE_MAP.get(trade)


def get_trade_from_soc(soc_code: str) -> Optional[str]:
    """Get trade name from SOC code."""
    return SOC_TO_TRADE_MAP.get(soc_code)
