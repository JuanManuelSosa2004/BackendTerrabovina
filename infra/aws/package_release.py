"""Package runtime files from the three isolated checkouts and the built SPA."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import sys


def package(destination):
    root = Path(__file__).resolve().parents[3]
    inputs = {
        "backend": ["Dockerfile", ".dockerignore", "package.json", "package-lock.json",
                    "src", "docs/openapi.yaml", "infra/aws"],
        "modelos": ["Dockerfile", ".dockerignore", "requirements.txt", "app.py", "validation.py",
                    "intrapaddock.py", "intrapaddock_water.py", "intrapaddock_climate.py",
                    "stock", "rotation", "modelo_final DMP/src", "modelo_final DMP/models",
                    "modelo_final DMI/src", "modelo_final DMI/models"],
        "frontend": ["dist"],
    }
    with ZipFile(destination, "x", compression=ZIP_DEFLATED, compresslevel=5) as archive:
        for component, names in inputs.items():
            for name in names:
                source = root / component / name
                if not source.exists():
                    raise FileNotFoundError(source)
                for file in sorted(source.rglob("*")) if source.is_dir() else [source]:
                    if not file.is_file() or "__pycache__" in file.parts or file.suffix == ".pyc":
                        continue
                    if file.is_symlink() or file.name.startswith(".env") or file.suffix.lower() in {".sql", ".gz", ".key", ".pfx"}:
                        raise ValueError(f"Unexpected runtime file: {file.name}")
                    archive.write(file, file.relative_to(root).as_posix())


if __name__ == "__main__":
    package(Path(sys.argv[1]))
