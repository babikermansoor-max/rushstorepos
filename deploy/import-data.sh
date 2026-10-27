#!/usr/bin/env bash
# Imports CSV files exported from Lovable (one file per table, named <table>.csv)
# into the self-hosted database, then compares row counts.
# Usage: DATABASE_URL=... ./deploy/import-data.sh /path/to/csv-folder
set -euo pipefail
DIR="$1"
# Parents before children so references resolve.
TABLES="branches app_settings categories products stock profiles user_roles sales sale_items returns expenses repairs phones phone_sales audit_log"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "SET session_replication_role = replica;" >/dev/null
for t in $TABLES; do
  f="$DIR/$t.csv"
  [ -f "$f" ] || { echo "skip $t (no file)"; continue; }
  cols=$(head -1 "$f")
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "SET session_replication_role = replica; \\copy public.$t($cols) FROM '$f' WITH CSV HEADER"
  file_rows=$(($(python3 -c "import csv,sys;print(sum(1 for _ in csv.reader(open(sys.argv[1]))))" "$f") - 1))
  db_rows=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM public.$t")
  echo "$t: file=$file_rows db=$db_rows"
done
# Continue invoice numbering from the last number.
psql "$DATABASE_URL" -q -c "DO \$\$ DECLARE s text; BEGIN
  FOR s IN SELECT pg_get_serial_sequence('public.'||c.table_name, c.column_name)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.column_default LIKE 'nextval%'
  LOOP EXECUTE format('SELECT setval(%L, GREATEST((SELECT last_value FROM %s),1))', s, s); END LOOP; END \$\$;"
echo "Import finished."
