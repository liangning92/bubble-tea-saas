#!/bin/bash
set -euo pipefail
umask 077
project_dir=$(cd "$(dirname "$0")/.." && pwd)
backup_dir=${BTPS_BACKUP_DIR:-"$project_dir/backups/postgres"}
db_container=${BTPS_DB_CONTAINER:-bubble-tea-db}
api_container=${BTPS_API_CONTAINER:-bubble-tea-api}
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/bubble-tea-$backup_stamp.dump"
trap 'rm -f "$backup_file.partial"' EXIT
# Credentials remain inside the container; custom-format pg_dump takes a consistent snapshot.
docker exec "$db_container" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file.partial"
test -s "$backup_file.partial"
docker exec -i "$db_container" pg_restore --list < "$backup_file.partial" >/dev/null
mv "$backup_file.partial" "$backup_file"
shasum -a 256 "$backup_file" > "$backup_file.sha256"
# Uploaded media is a separate archive; retain it with the matching DB snapshot.
media_file="$backup_dir/bubble-tea-$backup_stamp.uploads.tar.gz"
docker exec "$api_container" tar -C /app/uploads -czf - . > "$media_file.partial"
tar -tzf "$media_file.partial" >/dev/null
mv "$media_file.partial" "$media_file"
shasum -a 256 "$media_file" > "$media_file.sha256"
printf '%s PostgreSQL backup verified: %s\n' "$backup_stamp" "$backup_file" >> "$backup_dir/backup.log"
# Only verified task-owned dumps beyond the most recent thirty are removed.
python3 - "$backup_dir" <<'PY'
import pathlib,sys
files=sorted(pathlib.Path(sys.argv[1]).glob('bubble-tea-*.dump'),reverse=True)
for f in files[30:]:
 if f.with_suffix('.dump.sha256').exists():
  f.unlink();f.with_suffix('.dump.sha256').unlink()
  for suffix in ['.uploads.tar.gz','.uploads.tar.gz.sha256']:
   media=f.with_name(f.stem+suffix)
   if media.exists():media.unlink()
PY
printf 'Verified PostgreSQL backup: %s\n' "$backup_file"
