import posixpath
import re

SCRIPT_IMPORT = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']""",
    re.MULTILINE,
)
PYTHON_IMPORT = re.compile(r"^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))", re.MULTILINE)
SCRIPT_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.js"]


def resolve_import(path: str, target: str, files: dict[str, str]) -> str | None:
    """Map a relative script import or a dotted Python module to a file in the attempt."""
    directory = posixpath.dirname(path)
    if path.endswith(".py"):
        dots = len(target) - len(target.lstrip("."))
        module = target.lstrip(".").replace(".", "/")
        base = directory
        for _ in range(max(dots - 1, 0)):
            base = posixpath.dirname(base)

        roots = [base] if dots else ["", directory]
        candidates = [
            posixpath.join(root, module) + suffix
            for root in roots
            for suffix in [".py", "/__init__.py"]
        ]
    elif target.startswith("."):
        joined = posixpath.normpath(posixpath.join(directory, target))
        stem = re.sub(r"\.(js|mjs|cjs)$", "", joined)
        candidates = [joined] + [stem + suffix for suffix in SCRIPT_SUFFIXES]
    else:
        return None

    return next((candidate for candidate in candidates if candidate in files), None)


def workspace_map(files: dict[str, str]) -> list[dict]:
    """Deterministic structure: sizes plus local and external imports for every file."""
    entries = []

    for path, content in files.items():
        if path.endswith("/"):
            continue

        if path.endswith(".py"):
            targets = [first or second for first, second in PYTHON_IMPORT.findall(content)]
        else:
            targets = SCRIPT_IMPORT.findall(content)

        local = []
        external = []
        for target in targets[:30]:
            resolved = resolve_import(path, target, files)
            if resolved:
                local.append(resolved)
            else:
                external.append(target[:80])

        entries.append(
            {
                "path": path,
                "lines": content.count("\n") + 1,
                "imports": sorted(set(local)),
                "externalImports": sorted(set(external)),
            }
        )

    return entries
