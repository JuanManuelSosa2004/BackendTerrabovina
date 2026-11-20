#!/bin/bash
set -euo pipefail
case "${DB_HOST:?}" in
  terrabovina-aws-db.*.us-east-1.rds.amazonaws.com) ;;
  *) echo "Unexpected restore target" >&2; exit 1 ;;
esac
test "$DB_NAME" = terrabovina_aws
[[ "$APP_PASSWORD" =~ ^[A-Za-z0-9]{40}$ ]]
db=(mysql --protocol=TCP --host="$DB_HOST" --user=tb_admin --database="$DB_NAME" --ssl-mode=VERIFY_IDENTITY --ssl-ca=/transfer/rds.pem --batch --skip-column-names --max-allowed-packet=512M)
n=$("${db[@]}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
if [[ "$n" == 0 ]]; then
  sha256sum --check /transfer/snapshot.sha256
  gzip -dc /transfer/snapshot.sql.gz | "${db[@]}"
fi
# If an import was interrupted after writing some tables, stop on discrepancies.
differences=$("${db[@]}" </transfer/verification.sql)
if [[ -n "$differences" ]]; then
  printf 'Restore verification failed (table, actual, expected):\n%s\n' "$differences" >&2
  exit 1
fi
printf "CREATE USER IF NOT EXISTS 'tb_app'@'%%' IDENTIFIED BY '%s'; GRANT ALL PRIVILEGES ON \`terrabovina_aws\`.* TO 'tb_app'@'%%';\n" "$APP_PASSWORD" | "${db[@]}"
MYSQL_PWD="$APP_PASSWORD" mysql --protocol=TCP --host="$DB_HOST" --user=tb_app --database="$DB_NAME" --ssl-mode=VERIFY_IDENTITY --ssl-ca=/transfer/rds.pem --batch --skip-column-names -e "SELECT DATABASE(),VERSION(),COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"
echo 'RESTORE_VERIFIED'
