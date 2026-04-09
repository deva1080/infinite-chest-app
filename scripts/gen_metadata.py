"""
Generate a JSON metadata file for each .webp in scripts/nftsv2/collections/.
Each file: { "name": "<id>", "image": "https://radiant-tanuki-62e7ba.netlify.app/collections/<id>.webp" }

Output: scripts/nftsv2/metadata/<hex-id>.json

Usage:
    python scripts/gen_metadata.py
"""

import json
from pathlib import Path

NFTS_DIR = Path(__file__).resolve().parent / "nftsv2"
COLLECTIONS_DIR = NFTS_DIR / "collections"
OUTPUT_DIR = NFTS_DIR / "metadata"
BASE_URL = "https://radiant-tanuki-62e7ba.netlify.app/collections"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        (f for f in COLLECTIONS_DIR.iterdir() if f.is_file() and f.suffix == ".webp"),
        key=lambda f: int(f.stem),
    )

    if not files:
        print("No .webp files found in", COLLECTIONS_DIR)
        return

    for f in files:
        nft_id = f.stem
        hex_name = hex(int(nft_id))[2:].zfill(64)
        metadata = {
            "name": nft_id,
            "image": f"{BASE_URL}/{nft_id}.webp",
        }
        out_path = OUTPUT_DIR / f"{hex_name}.json"
        out_path.write_text(json.dumps(metadata, indent=2))
        print(f"  {hex_name}.json")

    print(f"\nDone: {len(files)} metadata files -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
