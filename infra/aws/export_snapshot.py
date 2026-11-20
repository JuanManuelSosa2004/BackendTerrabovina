"""Run on Windows. Export only the TerraBovina schema via OpenSSH; write to the user's temporary folder."""

import gzip
import hashlib
import argparse
import json
import os
import pathlib
import csv
import shlex
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone


# Commands run inside the existing MySQL container. No file is created on the VPS.
INSPECT_AND_DUMP = r"""
set -eu
: "${MYSQL_ROOT_PASSWORD:?missing MySQL credential}"
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
unset MYSQL_ROOT_PASSWORD
schema=$(mysql --protocol=SOCKET --user=root --batch --skip-column-names --execute="
  SELECT TABLE_SCHEMA FROM information_schema.TABLES
  WHERE TABLE_NAME IN ('estancia','potrero','ganado','usuario','SequelizeMeta')
  GROUP BY TABLE_SCHEMA HAVING COUNT(DISTINCT TABLE_NAME)=5;")
case "$schema" in ''|*[!a-zA-Z0-9_]*) echo 'Expected one TerraBovina application schema.' >&2; exit 1;; esac
MYSQL_DATABASE="$schema"
metadata=$(mysql --protocol=SOCKET --user=root --batch --skip-column-names --database="$MYSQL_DATABASE" --execute="
  START TRANSACTION READ ONLY;
  SELECT VERSION(), DATABASE(), COUNT(*),
    SUM(TABLE_NAME IN ('estancia','potrero','ganado','usuario','SequelizeMeta')),
    SUM(TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB'),
    COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0)
  FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();
  COMMIT;")
IFS="$(printf '\t')" read -r version schema tables matches nontransactional approx_bytes <<EOF
$metadata
EOF
if [ "$matches" != 5 ] || [ "$nontransactional" != 0 ]; then
  echo 'Database identity or transactional engine check failed.' >&2
  exit 1
fi
printf 'MySQL %s | database %s | objects %s | data and indexes ~%s bytes\n' "$version" "$schema" "$tables" "$approx_bytes" >&2
exec mysqldump --protocol=SOCKET --user=root --single-transaction --quick --skip-lock-tables \
  --set-gtid-purged=OFF --no-tablespaces --hex-blob --routines --events --triggers \
  --skip-add-locks --no-create-db --default-character-set=utf8mb4 "$MYSQL_DATABASE"
"""


def export(host, user, port, service):
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", host) or not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        raise ValueError("Invalid SSH destination")
    if not re.fullmatch(r"terrabovina-mysql-[a-z0-9]+", service) or not 1 <= port <= 65535:
        raise ValueError("Invalid TerraBovina service or SSH port")
    staging = pathlib.Path(tempfile.mkdtemp(prefix="TerraBovina-AWS-", dir=os.environ["LOCALAPPDATA"] + "/Temp"))
    # A protected DACL on the directory is inherited by newly created files.
    principal = subprocess.check_output(["whoami", "/user", "/fo", "csv", "/nh"], text=True)
    sid = next(csv.reader([principal.strip()]))[1]
    if not sid.startswith("S-1-"):
        raise RuntimeError("No se pudo verificar el usuario de Windows.")
    subprocess.run(["icacls", str(staging), "/inheritance:r", "/grant:r", "*" + sid + ":(OI)(CI)F"], check=True, stdout=subprocess.DEVNULL)

    remote = (
        "set -eu; set -- $(docker ps -q --filter label=com.docker.swarm.service.name=" + service + "); "
        'if [ "$#" -ne 1 ]; then echo "Expected one TerraBovina MySQL container." >&2; exit 1; fi; '
        """case "$(docker inspect --format '{{.Config.Image}}' "$1" | cut -d@ -f1)" in """
        """mysql:9.4.0|docker.io/library/mysql:9.4.0) ;; *) echo "Unexpected MySQL image." >&2; exit 1;; esac; """
        'exec docker exec "$1" sh -c ' + shlex.quote(INSPECT_AND_DUMP)
    )
    command = [
        "ssh.exe", "-T", "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no",
        "-o", "ServerAliveInterval=30", "-p", str(port), user + "@" + host, remote,
    ]
    partial = staging / "snapshot.partial"
    complete = staging / "snapshot.sql.gz"
    with subprocess.Popen(command, stdout=subprocess.PIPE) as ssh:
        try:
            with gzip.open(partial, "xb", compresslevel=3) as compressed:
                shutil.copyfileobj(ssh.stdout, compressed, length=256 * 1024)
            if ssh.wait() != 0:
                raise RuntimeError("Falló la exportación SSH/MySQL.")
            with gzip.open(partial, "rb") as stream:
                table_count = 0
                latest = b""
                for line in stream:
                    if line.startswith(b"CREATE TABLE "):
                        table_count += 1
                    if line.strip():
                        latest = line
                if table_count < 5 or not latest.startswith(b"-- Dump completed on "):
                    raise RuntimeError("La copia está incompleta.")
            with partial.open("rb") as archive:
                digest = hashlib.file_digest(archive, "sha256").hexdigest()
            partial.rename(complete)
            (staging / "manifest.json").write_text(json.dumps({
                "completed_utc": datetime.now(timezone.utc).isoformat(), "tables": table_count,
                "compressed_bytes": complete.stat().st_size, "sha256": digest,
            }, indent=2), encoding="utf-8")
        finally:
            if ssh.poll() is None:
                ssh.terminate()
            partial.unlink(missing_ok=True)
    print(f"Copia verificada: {table_count} tablas. Archivo privado: {complete}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--service", required=True)
    export(**vars(parser.parse_args()))
