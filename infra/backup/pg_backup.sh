#!/usr/bin/env sh
# Backup Postgres hằng ngày lên R2, giữ 14 bản mới nhất. Chạy bằng cron trên VPS:
#   15 3 * * * cd /srv/bonsai && sh infra/backup/pg_backup.sh >> /var/log/bonsai-backup.log 2>&1
# Cần: docker, aws CLI v2; biến R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET trong .env.
set -eu
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a

KEEP=${BACKUP_KEEP:-14}
BUCKET=${R2_BACKUP_BUCKET:-bonsai-backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/bonsai-${STAMP}.sql.gz"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto

docker compose -f infra/docker-compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-bonsai}" -d "${POSTGRES_DB:-bonsai}" --no-owner | gzip -9 > "$FILE"
aws s3 cp "$FILE" "s3://${BUCKET}/postgres/$(basename "$FILE")" --endpoint-url "$R2_ENDPOINT"
rm -f "$FILE"

aws s3 ls "s3://${BUCKET}/postgres/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | sort -r | tail -n +$((KEEP + 1)) |
  while read -r old; do
    aws s3 rm "s3://${BUCKET}/postgres/${old}" --endpoint-url "$R2_ENDPOINT"
  done
echo "backup ok: ${STAMP}"
