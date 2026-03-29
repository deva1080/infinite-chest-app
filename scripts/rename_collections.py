"""
Rename collection images: remove the configId prefix and underscore.
  0_1.webp  -> 1.webp
  4_132.webp -> 132.webp

Usage:
    python scripts/rename_collections.py
"""

from pathlib import Path

COLLECTIONS_DIR = Path(__file__).resolve().parent / "collections"


def main() -> None:
    files = sorted(COLLECTIONS_DIR.iterdir())
    renamed = 0

    for f in files:
        if not f.is_file() or "_" not in f.stem:
            continue

        nft_id = f.stem.split("_", 1)[1]
        new_name = f"{nft_id}{f.suffix}"
        new_path = f.parent / new_name

        if new_path.exists():
            print(f"  SKIP (already exists): {f.name} -> {new_name}")
            continue

        f.rename(new_path)
        renamed += 1
        print(f"  {f.name} -> {new_name}")

    print(f"\nDone: {renamed} files renamed in {COLLECTIONS_DIR}")


if __name__ == "__main__":
    main()
