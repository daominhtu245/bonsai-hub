#!/usr/bin/env sh
# Sinh cấu hình Nginx của máy chủ (Ubuntu) cho Bonsai từ .env: DOMAIN, WEB_PORT, S3_PORT, R2_BUCKET, COMPOSE_PROFILES.
# Dùng (xem docs/deploy.md):
#   sh infra/deploy/render-nginx.sh | sudo tee /etc/nginx/sites-available/bonsai.conf
# Đổi domain/cổng: sửa .env → chạy lại lệnh trên → sudo certbot --nginx -d <domain> (cài lại chứng chỉ có sẵn).
set -eu
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "Thiếu file .env" >&2; exit 1; }

val() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DOMAIN=$(val DOMAIN)
WEB_PORT=$(val WEB_PORT); WEB_PORT=${WEB_PORT:-8080}
S3_PORT=$(val S3_PORT); S3_PORT=${S3_PORT:-9000}
BUCKET=$(val R2_BUCKET); BUCKET=${BUCKET:-bonsai-private}
[ -n "$DOMAIN" ] || { echo "Chưa đặt DOMAIN trong .env" >&2; exit 1; }

cat <<EOF
# Bonsai AI — sinh bởi infra/deploy/render-nginx.sh từ .env. Đừng sửa tay: sửa .env rồi sinh lại.
# web (container) nghe 127.0.0.1:${WEB_PORT}; container tự chia /api, /s, /tk về api.
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 2m;

    # SSE tiến độ phiên / thanh toán: không đệm, giữ kết nối lâu.
    location ~ ^/api/v1/(jobs/[^/]+/events|payments/[^/]+/events)\$ {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
EOF

case ",$(val COMPOSE_PROFILES)," in
  *,local-s3,*) cat <<EOF

    # Kho ảnh ngay trên VPS (SeaweedFS, profile local-s3). URL ký sẵn trỏ https://${DOMAIN}/${BUCKET}/...
    # (R2_PUBLIC_ENDPOINT=https://${DOMAIN}); giữ nguyên Host và đường dẫn để chữ ký hợp lệ.
    location /${BUCKET}/ {
        proxy_pass http://127.0.0.1:${S3_PORT};
        proxy_set_header Host \$host;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        client_max_body_size 30m;
        proxy_read_timeout 120s;
    }
EOF
  ;;
esac

cat <<EOF

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
