from __future__ import annotations

import json
import sys
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq


def write_jsonl(table, output_path: Path, fields: list[str]) -> int:
    count = 0
    with output_path.open("w", encoding="utf-8") as f:
        for row_index in range(table.num_rows):
            record = {}
            for field in fields:
                value = table[field][row_index].as_py()
                if value is None:
                    raise ValueError(
                        f"Unexpected null for field '{field}' in {output_path.name} row {row_index}"
                    )
                record[field] = value
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    return count


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: python scripts/split_parquet.py <input.parquet> <output_dir>",
            file=sys.stderr,
        )
        return 1

    input_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    table = pq.read_table(input_path)
    source_column = table["source_table"]

    headlines = table.filter(pc.equal(source_column, "headlines"))
    headline_definitions = table.filter(
        pc.equal(source_column, "headlineDefinitions")
    )

    headlines_count = write_jsonl(
        headlines,
        output_dir / "headlines.jsonl",
        [
            "_creationTime",
            "hashedId",
            "fontSize",
            "height",
            "score",
            "scrapedAt",
            "width",
            "x",
            "y",
        ],
    )
    headline_definitions_count = write_jsonl(
        headline_definitions,
        output_dir / "headlineDefinitions.jsonl",
        ["_creationTime", "hashedId", "headlineText", "href", "siteName"],
    )

    manifest = {
        "source": str(input_path),
        "headlines": headlines_count,
        "headlineDefinitions": headline_definitions_count,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
