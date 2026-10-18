"""
Regression guard: desklib_detector_service must not import torch/transformers
at module level. Those imports spin up native thread pools that previously
caused a startup hang ("47 leaked threads, no error") when triggered
unconditionally on every app boot — see ai_detection_service.py's comment
on why the import was made lazy. This test runs even in environments
without torch installed (like this one), which is itself proof the import
chain stays lazy.
"""

import importlib
import sys


def test_importing_desklib_module_does_not_require_torch():
    assert "torch" not in sys.modules or sys.modules.get("torch") is not None
    sys.modules.pop("app.services.desklib_detector_service", None)
    torch_was_loaded_before = "torch" in sys.modules

    module = importlib.import_module("app.services.desklib_detector_service")

    if not torch_was_loaded_before:
        assert "torch" not in sys.modules, (
            "Importing desklib_detector_service pulled in torch — the heavy "
            "import must stay inside _ensure_loaded()/_build_model_class(), "
            "not at module level."
        )
    assert module._model is None
    assert module._tokenizer is None


def test_importing_ai_detection_service_does_not_require_torch():
    sys.modules.pop("app.services.ai_detection_service", None)
    sys.modules.pop("app.services.desklib_detector_service", None)
    torch_was_loaded_before = "torch" in sys.modules

    importlib.import_module("app.services.ai_detection_service")

    if not torch_was_loaded_before:
        assert "torch" not in sys.modules, (
            "ai_detection_service must import desklib_detector_service "
            "lazily (inside _estimate_with_desklib), not at module level."
        )
