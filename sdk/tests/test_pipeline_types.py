"""Tests for v3 pipeline types."""

from arc_commerce.types import Pipeline, Stage, StageStatus, PipelineStatus


def test_pipeline_status_values():
    assert PipelineStatus.ACTIVE == 0
    assert PipelineStatus.COMPLETED == 1
    assert PipelineStatus.HALTED == 2
    assert PipelineStatus.CANCELLED == 3


def test_stage_status_values():
    assert StageStatus.PENDING == 0
    assert StageStatus.ACTIVE == 1
    assert StageStatus.COMPLETED == 2
    assert StageStatus.FAILED == 3


def test_pipeline_budget_usdc():
    p = Pipeline(1, 1, "0x0", "0x0", 50_000_000, 0, 0, 2, PipelineStatus.ACTIVE, 0, 0)
    assert p.total_budget_usdc == 50.0


def test_stage_budget_usdc():
    s = Stage(1, "0x0", b"\x00" * 32, 25_000_000, 0, StageStatus.PENDING)
    assert s.budget_usdc == 25.0


def test_pipeline_from_int_status():
    """PipelineStatus should accept raw int values."""
    p = Pipeline(2, 5, "0xabc", "0xdef", 100_000_000, 50_000_000, 1, 3, PipelineStatus(1), 1000, 2000)
    assert p.status == PipelineStatus.COMPLETED
    assert p.total_budget_usdc == 100.0


def test_stage_from_int_status():
    """StageStatus should accept raw int values."""
    s = Stage(10, "0xprovider", b"\xff" * 32, 10_000_000, 42, StageStatus(2))
    assert s.status == StageStatus.COMPLETED
    assert s.budget_usdc == 10.0


def test_pipeline_zero_budget():
    p = Pipeline(0, 0, "0x0", "0x0", 0, 0, 0, 0, PipelineStatus.ACTIVE, 0, 0)
    assert p.total_budget_usdc == 0.0


def test_stage_zero_budget():
    s = Stage(0, "0x0", b"\x00" * 32, 0, 0, StageStatus.PENDING)
    assert s.budget_usdc == 0.0
