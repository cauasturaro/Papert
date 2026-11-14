"""Hexagonal boundaries: inner layers stay free of adapters, SDKs and parsing libraries."""

import ast
import sys
from pathlib import Path

SOURCE_ROOT = Path(__file__).parent
INNER_LAYERS = {"domain", "application"}


def production_modules():
    for path in SOURCE_ROOT.rglob("*.py"):
        layer = path.relative_to(SOURCE_ROOT).parts[0:1]
        is_test = path.name.startswith("test_") or path.name == "conftest.py"

        if layer and layer[0] in INNER_LAYERS and not is_test:
            yield path, layer[0]


def imported_modules(path):
    tree = ast.parse(path.read_text())

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)

        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            yield node.module


def violations(is_violation):
    return [
        f"{path.relative_to(SOURCE_ROOT)} -> {module}"
        for path, layer in production_modules()
        for module in imported_modules(path)
        if is_violation(layer, module)
    ]


def test_inner_layers_import_only_accepted_packages():
    def is_outward_package(layer, module):
        package = module.split(".")[0]
        is_local = package == "src"
        is_standard = package in sys.stdlib_module_names

        return not is_local and not is_standard

    assert violations(is_outward_package) == []


def test_inner_layers_never_import_adapters():
    def is_adapter(_layer, module):
        return module.startswith("src.") and "infrastructure" in module.split(".")

    assert violations(is_adapter) == []


def test_domain_is_independent_from_use_cases():
    def is_use_case(layer, module):
        return (
            layer == "domain" and module.startswith("src.") and "application" in module.split(".")
        )

    assert violations(is_use_case) == []
