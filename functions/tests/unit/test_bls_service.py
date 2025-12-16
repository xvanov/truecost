"""
Unit Tests for BLS Service.

Tests for Story 4.5: Real Data Integration (AC 4.5.1-4.5.3, 4.5.8-4.5.9)

Test Coverage:
- AC 4.5.1: BLS API retrieves hourly wage data for construction occupations
- AC 4.5.2: Labor rates map to all 8 required trades via SOC codes
- AC 4.5.3: BLS data fetched by MSA codes and mapped to zip codes
- AC 4.5.8: API failures gracefully fall back to cached/default data
- AC 4.5.9: BLS API key stored securely (config validation)
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import os

import sys
sys.path.insert(0, str(__file__).replace("/tests/unit/test_bls_service.py", ""))

from services.bls_service import (
    SOC_CODE_MAP,
    MSA_CODE_MAP,
    ZIP_PREFIX_TO_MSA,
    DEFAULT_RATES_BY_MSA,
    NATIONAL_AVERAGE_RATES,
    BLSLaborRate,
    BLSResponse,
    get_msa_for_zip,
    build_bls_series_id,
    get_bls_api_key,
    calculate_total_rate,
    get_labor_rates_for_zip,
    get_single_trade_rate,
    get_all_trades,
    get_soc_code,
    get_trade_from_soc,
    _get_fallback_rates,
    _parse_bls_response,
)


# =============================================================================
# Test SOC Code Mapping (AC 4.5.2)
# =============================================================================


class TestSOCCodeMapping:
    """Tests for SOC code to trade mapping (AC 4.5.2)."""

    def test_all_eight_trades_have_soc_codes(self):
        """Verify all 8 required trades are mapped to SOC codes."""
        required_trades = [
            "electrician",
            "plumber",
            "carpenter",
            "hvac_tech",
            "roofer",
            "painter",
            "tile_setter",
            "general_labor",
        ]

        for trade in required_trades:
            assert trade in SOC_CODE_MAP, f"Missing SOC code for {trade}"
            assert SOC_CODE_MAP[trade].startswith("47-") or SOC_CODE_MAP[trade].startswith("49-"), \
                f"SOC code for {trade} should be in construction range (47-xxxx or 49-xxxx)"

    def test_soc_codes_are_valid_format(self):
        """Verify SOC codes follow XX-XXXX format."""
        import re
        pattern = r"^\d{2}-\d{4}$"

        for trade, soc_code in SOC_CODE_MAP.items():
            assert re.match(pattern, soc_code), f"Invalid SOC code format for {trade}: {soc_code}"

    def test_electrician_soc_code(self):
        """Verify electrician maps to SOC 47-2111."""
        assert SOC_CODE_MAP["electrician"] == "47-2111"

    def test_plumber_soc_code(self):
        """Verify plumber maps to SOC 47-2152."""
        assert SOC_CODE_MAP["plumber"] == "47-2152"

    def test_hvac_tech_soc_code(self):
        """Verify hvac_tech maps to SOC 49-9021 (different major group)."""
        assert SOC_CODE_MAP["hvac_tech"] == "49-9021"

    def test_get_soc_code_function(self):
        """Test get_soc_code helper function."""
        assert get_soc_code("electrician") == "47-2111"
        assert get_soc_code("invalid_trade") is None

    def test_get_trade_from_soc_function(self):
        """Test reverse lookup from SOC to trade."""
        assert get_trade_from_soc("47-2111") == "electrician"
        assert get_trade_from_soc("99-9999") is None


# =============================================================================
# Test MSA Mapping (AC 4.5.3)
# =============================================================================


class TestMSAMapping:
    """Tests for MSA (metro area) to zip code mapping (AC 4.5.3)."""

    def test_nyc_zip_to_msa(self):
        """Test NYC zip 10001 maps to NYC MSA 35620."""
        msa_info = get_msa_for_zip("10001")
        assert msa_info is not None
        assert msa_info["msa_code"] == "35620"
        assert "New York" in msa_info["metro_name"]

    def test_la_zip_to_msa(self):
        """Test LA zip 90001 maps to LA MSA 31080."""
        msa_info = get_msa_for_zip("90001")
        assert msa_info is not None
        assert msa_info["msa_code"] == "31080"
        assert "Los Angeles" in msa_info["metro_name"]

    def test_chicago_zip_to_msa(self):
        """Test Chicago zip 60601 maps to Chicago MSA 16980."""
        msa_info = get_msa_for_zip("60601")
        assert msa_info is not None
        assert msa_info["msa_code"] == "16980"
        assert "Chicago" in msa_info["metro_name"]

    def test_zip_prefix_fallback(self):
        """Test that unknown exact zip falls back to prefix lookup."""
        # 10099 not in exact map but 100 prefix should map to NYC
        msa_info = get_msa_for_zip("10099")
        assert msa_info is not None
        assert msa_info["msa_code"] == "35620"

    def test_unknown_zip_returns_none(self):
        """Test that completely unknown zip returns None."""
        msa_info = get_msa_for_zip("00000")
        assert msa_info is None

    def test_major_metros_covered(self):
        """Verify all 8 major metros from story requirements are covered."""
        major_metros = {
            "10001": "35620",  # NYC
            "90001": "31080",  # LA
            "60601": "16980",  # Chicago
            "77001": "26420",  # Houston
            "85001": "38060",  # Phoenix
            "80202": "19740",  # Denver
            "98101": "42660",  # Seattle
            "30301": "12060",  # Atlanta
        }

        for zip_code, expected_msa in major_metros.items():
            msa_info = get_msa_for_zip(zip_code)
            assert msa_info is not None, f"Missing MSA mapping for {zip_code}"
            assert msa_info["msa_code"] == expected_msa, \
                f"Wrong MSA for {zip_code}: expected {expected_msa}, got {msa_info['msa_code']}"


# =============================================================================
# Test BLS Series ID Building
# =============================================================================


class TestBLSSeriesID:
    """Tests for BLS series ID construction."""

    def test_build_series_id_format(self):
        """Test that series ID follows BLS OES format."""
        series_id = build_bls_series_id("35620", "47-2111")
        # Format: OEUM00{MSA}000000{SOC}03 (25 chars) where SOC has hyphen removed
        assert series_id == "OEUM003562000000047211103"
        assert len(series_id) == 25

    def test_build_series_id_removes_hyphen(self):
        """Test that SOC code hyphen is removed."""
        series_id = build_bls_series_id("31080", "47-2152")
        assert "47-2152" not in series_id
        assert "472152" in series_id


# =============================================================================
# Test Benefits Burden Calculation
# =============================================================================


class TestBenefitsBurden:
    """Tests for benefits burden calculation (Task 1.6)."""

    def test_calculate_total_rate_default_burden(self):
        """Test total rate with default 35% burden."""
        base_rate = 50.0
        total = calculate_total_rate(base_rate)
        expected = 50.0 * 1.35  # 67.50
        assert total == expected

    def test_calculate_total_rate_custom_burden(self):
        """Test total rate with custom burden percentage."""
        base_rate = 60.0
        total = calculate_total_rate(base_rate, burden_pct=0.40)
        expected = 60.0 * 1.40  # 84.00
        assert total == expected

    def test_calculate_total_rate_rounding(self):
        """Test that total rate is rounded to 2 decimal places."""
        base_rate = 55.55
        total = calculate_total_rate(base_rate, burden_pct=0.333)
        assert total == round(55.55 * 1.333, 2)


# =============================================================================
# Test API Key Security (AC 4.5.9)
# =============================================================================


class TestAPIKeySecurity:
    """Tests for BLS API key security (AC 4.5.9)."""

    def test_api_key_from_environment(self):
        """Test API key is read from environment variable."""
        with patch.dict(os.environ, {"BLS_API_KEY": "test_key_12345"}):
            key = get_bls_api_key()
            assert key == "test_key_12345"

    def test_api_key_returns_none_when_not_set(self):
        """Test API key returns None when not configured."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove BLS_API_KEY if it exists
            os.environ.pop("BLS_API_KEY", None)
            key = get_bls_api_key()
            assert key is None


# =============================================================================
# Test Fallback Data (AC 4.5.8)
# =============================================================================


class TestFallbackData:
    """Tests for graceful fallback on API failure (AC 4.5.8)."""

    def test_fallback_rates_for_known_msa(self):
        """Test fallback returns data for known MSA."""
        rates = _get_fallback_rates("35620", "NYC")

        # Should have all 8 trades
        assert len(rates) == 8
        assert "electrician" in rates
        assert "plumber" in rates

        # All rates should be BLSLaborRate objects
        for trade, rate in rates.items():
            assert isinstance(rate, BLSLaborRate)
            assert rate.source == "cached"

    def test_fallback_rates_for_unknown_msa(self):
        """Test fallback uses national averages for unknown MSA."""
        rates = _get_fallback_rates("00000", "Unknown")

        assert len(rates) == 8
        # Should use national averages
        electrician_rate = rates["electrician"]
        assert electrician_rate.hourly_rate == NATIONAL_AVERAGE_RATES["electrician"]

    def test_default_rates_by_msa_coverage(self):
        """Verify default rates cover all major MSAs."""
        expected_msas = ["35620", "31080", "16980", "26420", "38060", "19740", "42660", "12060"]

        for msa in expected_msas:
            assert msa in DEFAULT_RATES_BY_MSA, f"Missing default rates for MSA {msa}"
            assert len(DEFAULT_RATES_BY_MSA[msa]) == 8, f"MSA {msa} missing trades"


# =============================================================================
# Test BLS Response Parsing
# =============================================================================


class TestBLSResponseParsing:
    """Tests for parsing BLS API responses."""

    def test_parse_successful_response(self):
        """Test parsing a successful BLS response."""
        # Build correct series ID format: OEUM00{MSA}000000{SOC}03 (25 chars)
        mock_response = {
            "status": "REQUEST_SUCCEEDED",
            "Results": {
                "series": [
                    {
                        "seriesID": "OEUM003562000000047211103",  # electrician (47-2111)
                        "data": [
                            {"year": "2024", "value": "87.50"}
                        ]
                    }
                ]
            }
        }

        rates = _parse_bls_response(mock_response, "35620", "NYC")

        assert "electrician" in rates
        assert rates["electrician"].hourly_rate == 87.50
        assert rates["electrician"].data_year == "2024"

    def test_parse_failed_response(self):
        """Test parsing a failed BLS response returns empty dict."""
        mock_response = {
            "status": "REQUEST_FAILED",
            "message": ["Error occurred"]
        }

        rates = _parse_bls_response(mock_response, "35620", "NYC")
        assert rates == {}

    def test_parse_response_with_zero_value(self):
        """Test that zero values are skipped."""
        mock_response = {
            "status": "REQUEST_SUCCEEDED",
            "Results": {
                "series": [
                    {
                        "seriesID": "OEUM003562000000047211103",  # valid format (25 chars)
                        "data": [
                            {"year": "2024", "value": "0"}
                        ]
                    }
                ]
            }
        }

        rates = _parse_bls_response(mock_response, "35620", "NYC")
        assert "electrician" not in rates


# =============================================================================
# Test Main Service Function
# =============================================================================


class TestGetLaborRatesForZip:
    """Tests for main get_labor_rates_for_zip function."""

    @pytest.mark.asyncio
    async def test_returns_bls_response(self):
        """Test that function returns BLSResponse object."""
        # This will use fallback data since no real API call
        response = await get_labor_rates_for_zip("10001")

        assert isinstance(response, BLSResponse)
        assert response.zip_code == "10001"
        assert response.msa_code == "35620"
        assert len(response.rates) == 8

    @pytest.mark.asyncio
    async def test_filters_by_trades(self):
        """Test filtering to specific trades."""
        response = await get_labor_rates_for_zip(
            "10001",
            trades=["electrician", "plumber"]
        )

        # Should only have requested trades
        assert len(response.rates) == 2
        assert "electrician" in response.rates
        assert "plumber" in response.rates
        assert "carpenter" not in response.rates

    @pytest.mark.asyncio
    async def test_unknown_zip_uses_national_average(self):
        """Test that unknown zip uses national averages."""
        response = await get_labor_rates_for_zip("00000")

        assert response.msa_code == "00000"
        assert response.metro_name == "National Average"
        assert response.cached is True


class TestGetAllTrades:
    """Tests for get_all_trades helper."""

    def test_returns_all_eight_trades(self):
        """Test that all 8 trades are returned."""
        trades = get_all_trades()
        assert len(trades) == 8
        assert "electrician" in trades
        assert "general_labor" in trades
