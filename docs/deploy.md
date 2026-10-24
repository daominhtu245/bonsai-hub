# Deploy lên VPS Ubuntu có sẵn Nginx

Hướng dẫn cho một máy chủ **đang chạy hệ thống khác**. Bonsai chỉ chạy trong Docker, mọi container nghe trên
`127.0.0.1`. Nginx của máy chủ nhận domain, cấp HTTPS và proxy vào cổng nội bộ. **Domain và cổng đặt trong `.env`**.

```
Internet ──443──► Nginx máy chủ (server_name = DOMAIN)
                    ├─ /bonsai-private/ ─► 127.0.0.1:S3_PORT   (chỉ khi lưu ảnh trên VPS)
                    └─ /               ─► 127.0.0.1:WEB_PORT  ─► container web (nginx)
                                                                ├─ /api, /s, /tk ─► api ─► postgres, redis
                                                                └─ app PWA            worker ─► OpenAI
```

Thời gian: khoảng 30–45 phút cho lần đầu.

---

## 0. Chuẩn bị

| Cần có | Ghi chú |
|---|---|
| VPS Ubuntu 22.04/24.04, **≥ 2 vCPU / 4 GB RAM**, trống ≥ 15 GB | Build lần đầu tốn RAM (npm + pip). Máy 2 GB thì thêm swap (bước 1). Tách nền trước khi phân tích dùng thêm ~0,8 GB RAM trong vài giây mỗi lần phân tích |
| Docker Engine + Docker Compose v2 | `docker compose version` phải chạy được |
| Nginx + certbot | Nginx đã có; certbot cài ở bước 1 |
| 1 domain/subdomain trỏ A record về IP VPS | Ví dụ `bonsai.tenban.vn`. Nếu dùng Cloudflare: để **DNS only** (mây xám) khi chạy certbot |
| 2 cổng nội bộ còn trống | `WEB_PORT` (vd. 8090), `S3_PORT` (vd. 9010). Kiểm tra: `sudo ss -ltnp \| grep -E ':8090\|:9010'` không ra gì |
| OpenAI API key | Chỉ đặt trong `.env`, chỉ worker đọc |
| Google OAuth Client ID | Bước 3. Người dùng thử đăng nhập bằng Google |

---

## 1. Cài đặt trên VPS (một lần)

```bash
sudo apt update && sudo apt install -y make certbot python3-certbot-nginx
# Docker (bỏ qua nếu đã có):
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # đăng xuất / đăng nhập lại để có hiệu lực

sudo mkdir -p /srv/bonsai && sudo chown $USER: /srv/bonsai
```

VPS ít RAM (≤ 4 GB) nên thêm swap để build không bị kill:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 2. Đưa mã nguồn lên VPS

Từ máy Mac, trong thư mục dự án. Lệnh này chỉ gửi các file đã commit, **không gửi `.env`**:

```bash
git archive --format=tar.gz HEAD | ssh <user>@<ip-vps> 'tar xzf - -C /srv/bonsai'
```

(Hoặc đẩy lên GitHub private rồi `git clone` vào `/srv/bonsai`. Khi đó dùng được workflow `.github/workflows/deploy.yml`.)

---

## 3. Đăng nhập Google (5 phút)

1. Vào https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID** → loại **Web application**.
2. **Authorized JavaScript origins**: `https://<DOMAIN>`. Không cần redirect URI.
3. Nếu OAuth consent screen đang ở chế độ *Testing*: thêm email của 1–2 người dùng thử vào **Test users**,
   hoặc bấm **Publish app** (chỉ xin email/tên, không cần Google duyệt).
4. Copy Client ID → đặt cho **cả hai** biến `GOOGLE_CLIENT_ID` và `VITE_GOOGLE_CLIENT_ID` trong `.env`.

> Không bật `APP_ENV=dev` / `VITE_DEV_LOGIN=true` trên VPS. Chế độ đó cho phép đăng nhập bằng bất kỳ email nào,
> kể cả email quản trị, mà không cần mật khẩu.

---

## 4. Tạo `.env` trên VPS

```bash
cd /srv/bonsai && cp .env.example .env && nano .env
```

Sinh các chuỗi bí mật:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 16   # POSTGRES_PASSWORD
openssl rand -hex 20   # R2_SECRET_ACCESS_KEY (khi lưu ảnh trên VPS)
```

Sửa các dòng sau (các dòng khác giữ mặc định):

```ini
# ---- domain & cổng (đổi ở đây, không sửa file khác) ----
APP_ENV=prod
DOMAIN=bonsai.tenban.vn
WEB_PORT=8090
WEB_BIND=127.0.0.1
S3_PORT=9010
PUBLIC_BASE_URL=https://bonsai.tenban.vn
CORS_ORIGINS=https://bonsai.tenban.vn

# ---- bí mật ----
JWT_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<openssl rand -hex 16>   # docker compose tự ghép DATABASE_URL từ biến này

# ---- đăng nhập, quản trị ----
GOOGLE_CLIENT_ID=<client id>
VITE_GOOGLE_CLIENT_ID=<client id>
VITE_DEV_LOGIN=false
ADMIN_EMAILS=<email Google của bạn>
TRIAL_CREDITS=1

# ---- lưu ảnh ngay trên VPS (phương án A, mục 4a) ----
COMPOSE_PROFILES=local-s3
R2_ENDPOINT=http://s3-local:8333
R2_PUBLIC_ENDPOINT=https://bonsai.tenban.vn
R2_ACCESS_KEY_ID=bonsai
R2_SECRET_ACCESS_KEY=<openssl rand -hex 20>
R2_BUCKET=bonsai-private

# ---- AI: chỉ worker đọc ----
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.5
LLM_ECONOMY_MODEL=gpt-5-mini
LLM_FALLBACK_PROVIDER=
LLM_FALLBACK_MODEL=
IMAGE_PROVIDER=openai
IMAGE_MODEL=gpt-image-2
IMAGE_FALLBACK_PROVIDER=
IMAGE_FALLBACK_MODEL=
DAILY_COST_ALERT_USD=5

# ---- tách nền trên máy trước khi phân tích (admin → Chế độ AI bật/tắt) ----
WORKER_WITH_CUTOUT=true
CUTOUT_THREADS=2        # máy chủ dùng chung: giới hạn số luồng CPU
```

> Muốn tách nền đẹp hơn và máy còn **≥ 6 GB RAM trống**: tải BiRefNet-lite vào `models/` rồi đặt
> `CUTOUT_MODEL=/models/birefnet-general-lite.onnx` (xem `docs/decisions.md` #47). Mặc định ISNet nhẹ (~0,8 GB).

> `POSTGRES_PASSWORD` chỉ có tác dụng ở **lần chạy đầu**, khi volume database được tạo. Đổi về sau phải đổi cả
> trong Postgres.

### 4a. Lưu ảnh: chọn một trong hai

**A. Ngay trên VPS (khuyên dùng cho đợt thử).** Không cần tài khoản ngoài. Dùng như khối `.env` ở trên.
Ảnh đi qua `https://<DOMAIN>/bonsai-private/...` bằng URL ký sẵn 1 giờ. Đã thử: upload và tải ảnh qua proxy đều
hoạt động với chữ ký S3. Dữ liệu nằm trong volume `bonsai_s3-data`, sao lưu ở bước 9.

**B. Cloudflare R2** (về sau, khi có nhiều người dùng):

```ini
COMPOSE_PROFILES=
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_ENDPOINT=
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Tạo bucket `bonsai-private`, áp `infra/r2-cors.json` (sửa `AllowedOrigins` thành `https://<DOMAIN>`) và
`infra/r2-lifecycle.json`.

### 4b. Kiểm tra `.env`

```bash
sh infra/deploy/check-env.sh
```

Script không in giá trị bí mật. Nó kiểm tra domain, cổng có bị hệ thống khác chiếm không, chế độ prod, đăng nhập,
nơi lưu ảnh và khóa AI. Sửa đến khi in ra `OK`.

---

## 5. Build và chạy

```bash
cd /srv/bonsai && make up
```

Lần đầu mất khoảng 10–20 phút. Các lần sau dùng cache nên nhanh hơn.

- `make up` build tuần tự `api`, `worker` rồi `web` và chạy cả stack.
- Container `api` tự chạy migration và seed (loài, thế, prompt) mỗi lần khởi động.
- Chỉ dọn image có nhãn `bonsai.project=bonsai`, không đụng image của hệ thống khác.

Kiểm tra:

```bash
docker compose -f infra/docker-compose.yml --env-file .env ps     # tất cả "Up", api "healthy"
curl -s http://127.0.0.1:8090/healthz                             # thay 8090 = WEB_PORT → {"ok":true...}
```

---

## 6. Nginx máy chủ + HTTPS

Cấu hình sinh ra từ `.env` (DOMAIN, WEB_PORT, S3_PORT, R2_BUCKET, COMPOSE_PROFILES):

```bash
cd /srv/bonsai
sh infra/deploy/render-nginx.sh | sudo tee /etc/nginx/sites-available/bonsai.conf
sudo ln -sf /etc/nginx/sites-available/bonsai.conf /etc/nginx/sites-enabled/bonsai.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bonsai.tenban.vn --redirect
```

- File chỉ có một `server { server_name <DOMAIN>; }`, nên không ảnh hưởng site khác.
- Certbot tự thêm khối 443 và tự gia hạn chứng chỉ (`systemctl list-timers | grep certbot`).
- Header `X-Forwarded-For` được ghi đè bằng IP thật, để giới hạn tần suất theo IP không bị giả mạo.

**Đổi domain hoặc cổng về sau:** sửa `.env`, rồi chạy `make up`, lệnh `render-nginx.sh` ở trên và
`sudo certbot --nginx -d <domain mới> --redirect`.

> Docker mở cổng bằng iptables, đi vòng qua `ufw`. Các cổng của Bonsai đã khóa vào `127.0.0.1` (`WEB_BIND`,
> `S3_PORT`, Uptime Kuma), nên không lộ ra Internet. Đừng đổi `WEB_BIND=0.0.0.0`.

---

## 7. Sau khi chạy: cấu hình trong trang quản trị

1. Mở `https://<DOMAIN>`, đăng nhập Google bằng email trong `ADMIN_EMAILS` → vào `https://<DOMAIN>/admin`.
2. **Chế độ AI**: chọn *Tiêu chuẩn* hoặc *Tiết kiệm*. Chi phí thật mỗi lượt xem ở **Chi phí AI**.
3. **Cấu hình vận hành**:
   - Lượt tặng khi đăng ký: `TRIAL_CREDITS` là mặc định.
   - Giới hạn phân tích mỗi ngày.
   - Thông báo chung trên trang chủ, nếu cần.
4. **Mã quà tặng**: tạo 1 mã, ví dụ `THU2026`, 5 lượt, giới hạn 5 người. Gửi mã cho người dùng thử; họ nhập ở
   Tài khoản → Nhập mã quà tặng.
5. Thử một vòng: chụp phôi → chọn thế / Tự thiết kế → tạo ảnh. Theo dõi ở Phiên thiết kế và Chi phí AI.

**Tài khoản nghệ nhân:** nghệ nhân đăng nhập Google một lần → `/admin` → Người dùng → mở tài khoản đó → Vai trò
**Nghệ nhân**. Họ vào Tài khoản → **Khu nghệ nhân** để chấm ảnh và chỉnh bộ luật (không thấy người dùng, thanh toán).

Thanh toán VietQR, Web Push, Zalo, Sentry, Telegram là **tùy chọn**: chưa đặt khóa thì tính năng tự tắt. Bật dần
theo `docs/beta-checklist.md`.

---

## 8. Cập nhật phiên bản mới

Từ máy Mac, sau khi commit:

```bash
git archive --format=tar.gz HEAD | ssh <user>@<ip-vps> 'tar xzf - -C /srv/bonsai && cd /srv/bonsai && make up'
```

- `.env`, database và ảnh được giữ nguyên.
- Migration tự chạy.
- Đổi `VITE_*` (Google Client ID…) cần build lại `web`. `make up` đã làm việc này.

**Quay lại bản trước:** chạy lệnh trên với commit cũ thay cho `HEAD`, ví dụ `git archive ... 3d74191`.
Lưu ý: không lùi được migration đã chạy, nên chỉ quay lại khi bản mới không có migration.

---

## 9. Sao lưu

Phương án A (ảnh trên VPS): thêm cron backup database lúc 3:15 hằng ngày, giữ 14 bản:

```bash
sudo mkdir -p /srv/bonsai-backups && sudo chown $USER: /srv/bonsai-backups
crontab -e
```

```cron
15 3 * * * cd /srv/bonsai && docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres pg_dump -U bonsai -d bonsai --no-owner | gzip > /srv/bonsai-backups/db-$(date +\%F).sql.gz && ls -1t /srv/bonsai-backups/db-*.sql.gz | tail -n +15 | xargs -r rm
```

Sao lưu ảnh (chạy tay hằng tuần, hoặc thêm cron):

```bash
docker run --rm -v bonsai_s3-data:/data -v /srv/bonsai-backups:/out alpine tar czf /out/s3-$(date +%F).tar.gz -C /data .
```

Phương án B (R2): dùng `infra/backup/pg_backup.sh` (cần aws CLI, xem đầu file).

**Khôi phục database** (xóa dữ liệu hiện tại, thay bằng bản sao lưu):

```bash
C="docker compose -f infra/docker-compose.yml --env-file .env"
$C stop api worker beat
$C exec -T postgres psql -U bonsai -d postgres -c 'DROP DATABASE bonsai WITH (FORCE)' -c 'CREATE DATABASE bonsai'
gunzip -c /srv/bonsai-backups/db-YYYY-MM-DD.sql.gz | $C exec -T postgres psql -U bonsai -d bonsai
$C start api worker beat
```

---

## 10. Vận hành hằng ngày

| Việc | Lệnh (trong `/srv/bonsai`) |
|---|---|
| Xem log | `docker compose -f infra/docker-compose.yml --env-file .env logs -f --tail 100 api worker` |
| Khởi động lại | `docker compose -f infra/docker-compose.yml --env-file .env restart api worker` |
| Dừng Bonsai (giữ dữ liệu) | `make down` |
| Dung lượng | `docker system df`; `du -sh /srv/bonsai-backups` |
| Chi phí AI, phiên lỗi, hàng đợi | `/admin` → Bảng điều khiển, Sức khỏe hệ thống |

**Không chạy** `docker system prune -a --volumes` hay `docker volume prune` trên máy chủ dùng chung. Các lệnh này
xóa dữ liệu của hệ thống khác và của Bonsai (`bonsai_pg-data`, `bonsai_s3-data`, `bonsai_redis-data`).

---

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân, cách xử lý |
|---|---|
| `502 Bad Gateway` | Container web chưa chạy hoặc sai `WEB_PORT`. Chạy `docker compose ... ps` và `curl 127.0.0.1:<WEB_PORT>/healthz` |
| Nút Google không hiện / lỗi `origin_mismatch` | `VITE_GOOGLE_CLIENT_ID` trống (sửa xong cần `make up` để build lại web), hoặc chưa thêm `https://<DOMAIN>` vào Authorized JavaScript origins |
| Đăng nhập được nhưng không vào `/admin` | Email không có trong `ADMIN_EMAILS`. Sửa xong chạy `make up` |
| Tải ảnh lên báo lỗi / ảnh không hiện | Phương án A: `R2_PUBLIC_ENDPOINT` phải đúng `https://<DOMAIN>` và Nginx phải có `location /bonsai-private/` (chạy lại `render-nginx.sh`). Phương án B: CORS của bucket R2 |
| Tiến độ phân tích đứng yên, F5 mới thấy | Nginx máy chủ đệm SSE. Cấu hình phải có khối `.../events` với `proxy_buffering off` (đã có trong file sinh ra) |
| Phân tích / tạo ảnh lỗi | `docker compose ... logs worker`. Thường do sai `OPENAI_API_KEY` hoặc hết hạn mức OpenAI. Lượt đã trừ được tự hoàn |
| Build bị `Killed` | Thiếu RAM. Thêm swap (bước 1) rồi chạy lại `make up` |
