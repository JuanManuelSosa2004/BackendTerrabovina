"""Generate destination row-count checks from the exported snapshot, without querying the VPS again."""

import gzip
from pathlib import Path
import re
import sys


def verification_sql(snapshot):
    counts = {}
    create = re.compile(rb"CREATE TABLE `(\w+)`")
    insert = re.compile(rb"INSERT INTO `(\w+)`(?: \(`\w+`(?:, *`\w+`)*\))? VALUES ")
    # Consume quoted strings as complete tokens so JSON and free text cannot introduce tuple delimiters.
    token = re.compile(rb"'(?:[^'\\]++|\\.|'')*+'|[()]")
    with gzip.open(snapshot, "rb") as stream:
        for line in stream:
            if line.startswith(b"CREATE TABLE "):
                counts[create.match(line)[1].decode("ascii")] = 0
            elif line.startswith(b"INSERT INTO "):
                match = insert.match(line)
                if not match:
                    raise ValueError("Unexpected INSERT syntax")
                table = match[1].decode("ascii")
                depth = 0
                for item in token.finditer(line, match.end()):
                    lead = line[item.start()]
                    if lead == 40:
                        if depth == 0:
                            counts[table] += 1
                        depth += 1
                    elif lead == 41:
                        depth -= 1
                    if depth < 0:
                        raise ValueError("Invalid value list")
                if depth or not line.rstrip().endswith(b";"):
                    raise ValueError("Truncated INSERT")
            elif re.search(rb"^(USE |CREATE DATABASE|ALTER DATABASE|DROP DATABASE)|DEFINER\s*=", line, re.I):
                raise ValueError("Review database-qualified DDL before restore")
    if len(counts) < 5:
        raise ValueError("Missing tables")
    tests = [f"SELECT '{table}' AS tabla, COUNT(*) AS actual, {rows} AS esperado FROM `{table}`"
             for table, rows in sorted(counts.items())]
    tests.append("SELECT 'information_schema.tables', COUNT(*), " + str(len(counts)) +
                 " FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'")
    return "SELECT tabla,actual,esperado FROM (\n" + "\nUNION ALL\n".join(tests) + "\n) AS audit WHERE actual <> esperado;\n", counts


if __name__ == "__main__":
    sql, counts = verification_sql(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(sql, encoding="ascii")
    print(f"{len(counts)} tables, {sum(counts.values())} rows in the verified snapshot")
