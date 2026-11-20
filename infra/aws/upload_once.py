"""Upload one verified file to the AWS-prepared, create-only S3 location."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit


def upload(account, ticket_path, kind, file):
    ticket = json.loads(ticket_path.read_text(encoding="utf-8"))[kind]
    if not re.fullmatch(r"[0-9]{12}", account):
        raise ValueError("Expected AWS account ID")
    bucket = ticket["bucket"]
    if not bucket.startswith("terrabovina-aws-artifacts-staging-"):
        raise ValueError("Unexpected bucket")
    dest = urlsplit(ticket["url"])
    hosts = {f"{bucket}.s3.amazonaws.com", f"{bucket}.s3.us-east-1.amazonaws.com"}
    key = ticket["key"]
    prefix = {"code": "builds/", "snapshot": "migration/"}[kind]
    if (dest.scheme != "https" or dest.netloc not in hosts or dest.path != "/" + key
            or not key.startswith(prefix) or set(parse_qs(dest.query)["X-Amz-SignedHeaders"][0].split(";"))
            != {"host", "if-none-match", "x-amz-expected-bucket-owner"}):
        raise ValueError("Unexpected destination or missing write safeguards")
    with file.open("rb") as data:
        digest = hashlib.file_digest(data, "sha256").hexdigest()
        if kind == "snapshot":
            manifest = json.loads(file.with_name("manifest.json").read_text(encoding="utf-8"))
            if manifest["sha256"] != digest or manifest["compressed_bytes"] != file.stat().st_size:
                raise ValueError("Snapshot validation failed")
    if any(c in ticket["url"] for c in '"\r\n\\'):
        raise ValueError("Invalid URL")
    result = subprocess.run([
        "curl.exe", "--silent", "--http1.1", "--proto", "=https",
        "--header", "If-None-Match: *", "--header", f"x-amz-expected-bucket-owner: {account}",
        "--header", "Expect: 100-continue", "--expect100-timeout", "10", "--max-time", "600",
        "--upload-file", str(file), "--write-out", "\\n%{http_code}", "--config", "-",
    ], input='url = "' + ticket["url"] + '"\n', capture_output=True, text=True)
    payload, _, status = result.stdout.rpartition("\n")
    if result.returncode or status != "200":
        code = re.search(r"<Code>([A-Za-z0-9]+)</Code>", payload)
        raise RuntimeError(f"Carga S3: HTTP {status}, curl {result.returncode}, {code[1] if code else 'sin código XML'}")
    print(f"Uploaded {key} | {file.stat().st_size} bytes | sha256 {digest}")


if __name__ == "__main__":
    upload(sys.argv[1], Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]))
