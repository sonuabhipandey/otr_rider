"""Combine both batch CSVs into a single raw CSV, in the exact original
column layout - no extra/helper columns added, matching what the dashboard's
upload endpoint expects (see parseOrdersCsv in the dashboard project)."""

import csv
from pathlib import Path


def combine_batches(batch_paths: list[Path], out_path: Path) -> Path:
    """Concatenate every row from every batch file under one shared header.
    Assumes all batches have an identical column set - true here, since both
    come from the same control-tower export, just filtered to different stores."""
    out_path.parent.mkdir(parents=True, exist_ok=True)

    header: list[str] | None = None
    rows: list[list[str]] = []

    for path in batch_paths:
        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            file_header = next(reader, None)
            if file_header is None:
                continue  # empty file - e.g. a batch with zero orders that day
            if header is None:
                header = file_header
            elif file_header != header:
                raise ValueError(
                    f"{path.name} has a different column layout than the first batch - "
                    "control-tower's export format may have changed."
                )
            rows.extend(reader)

    if header is None:
        raise ValueError("All batch files were empty - nothing to combine.")

    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)

    return out_path
