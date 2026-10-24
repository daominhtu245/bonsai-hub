#!/usr/bin/env sh
# Kiểm tra .env trước khi deploy lên VPS (không in giá trị bí mật). Dùng: sh infra/deploy/check-env.sh
set -u
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "Thiếu file .env (cp .env.example .env)"; exit 1; }

val() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
err=0
bad() { echo "  ✗ $1"; err=1; }
ok() { echo "  ✓ $1"; }

DOMAIN=$(val DOMAIN)
WEB_PORT=$(val WEB_PORT); WEB_PORT=${WEB_PORT:-8080}
echo "Domain, cổng"
[ -n "$DOMAIN" ] && ok "DOMAIN=$DOMAIN" || bad "Chưa đặt DOMAIN"
[ "$(val PUBLIC_BASE_URL)" = "https://$DOMAIN" ] && ok "PUBLIC_BASE_URL" || bad "PUBLIC_BASE_URL phải là https://$DOMAIN"
case ",$(val CORS_ORIGINS)," in *",https://$DOMAIN,"*) ok "CORS_ORIGINS" ;; *) bad "CORS_ORIGINS phải có https://$DOMAIN" ;; esac
if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -Eq "[:.]${WEB_PORT}\$"; then
  if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "^bonsai-web-1 .*:${WEB_PORT}->"; then ok "WEB_PORT=$WEB_PORT (bonsai đang chạy)"
  else bad "WEB_PORT=$WEB_PORT đã có hệ thống khác dùng — chọn cổng khác"; fi
else ok "WEB_PORT=$WEB_PORT còn trống"; fi

echo "Bảo mật"
[ "$(val APP_ENV)" = "prod" ] && ok "APP_ENV=prod" || bad "APP_ENV phải là prod (dev bật đăng nhập không cần mật khẩu)"
[ "$(val VITE_DEV_LOGIN)" = "false" ] && ok "VITE_DEV_LOGIN=false" || bad "VITE_DEV_LOGIN phải là false"
J=$(val JWT_SECRET); [ ${#J} -ge 32 ] && [ "$J" != "change-me-to-a-long-random-string" ] && ok "JWT_SECRET" || bad "JWT_SECRET: openssl rand -hex 32"
P=$(val POSTGRES_PASSWORD); [ -n "$P" ] && [ "$P" != "bonsai" ] && ok "POSTGRES_PASSWORD" || bad "POSTGRES_PASSWORD: đặt mật khẩu riêng (trước lần chạy đầu)"

echo "Đăng nhập, quản trị"
[ -n "$(val VITE_GOOGLE_CLIENT_ID)" ] && [ "$(val VITE_GOOGLE_CLIENT_ID)" = "$(val GOOGLE_CLIENT_ID)" ] && ok "Google Client ID" || bad "GOOGLE_CLIENT_ID và VITE_GOOGLE_CLIENT_ID phải đặt, giống nhau"
[ -n "$(val ADMIN_EMAILS)" ] && ok "ADMIN_EMAILS" || bad "Chưa đặt ADMIN_EMAILS"

echo "Lưu trữ ảnh"
case ",$(val COMPOSE_PROFILES)," in
  *,local-s3,*)
    [ "$(val R2_ENDPOINT)" = "http://s3-local:8333" ] && ok "R2_ENDPOINT (kho trên VPS)" || bad "R2_ENDPOINT=http://s3-local:8333"
    [ "$(val R2_PUBLIC_ENDPOINT)" = "https://$DOMAIN" ] && ok "R2_PUBLIC_ENDPOINT" || bad "R2_PUBLIC_ENDPOINT=https://$DOMAIN"
    S=$(val R2_SECRET_ACCESS_KEY); [ ${#S} -ge 20 ] && ok "R2_SECRET_ACCESS_KEY" || bad "R2_SECRET_ACCESS_KEY: openssl rand -hex 20" ;;
  *)
    [ -n "$(val R2_ENDPOINT)" ] && [ -n "$(val R2_ACCESS_KEY_ID)" ] && ok "Cloudflare R2" || bad "Thiếu R2_ENDPOINT / R2_ACCESS_KEY_ID"
    [ -z "$(val R2_PUBLIC_ENDPOINT)" ] && ok "R2_PUBLIC_ENDPOINT trống" || bad "Dùng R2 thì để trống R2_PUBLIC_ENDPOINT" ;;
esac

echo "AI (chỉ worker)"
case "$(val LLM_PROVIDER)" in
  openai) K=OPENAI_API_KEY ;; gemini) K=GEMINI_API_KEY ;; *) K=ANTHROPIC_API_KEY ;;
esac
[ -n "$(val $K)" ] && ok "$K cho LLM_PROVIDER=$(val LLM_PROVIDER)" || bad "Thiếu $K"
case "$(val IMAGE_PROVIDER)" in openai) K=OPENAI_API_KEY ;; *) K=GEMINI_API_KEY ;; esac
[ -n "$(val $K)" ] && ok "$K cho IMAGE_PROVIDER=$(val IMAGE_PROVIDER)" || bad "Thiếu $K"

[ $err = 0 ] && echo "OK — có thể chạy: make up" || { echo "Sửa các mục ✗ trong .env rồi chạy lại."; exit 1; }
