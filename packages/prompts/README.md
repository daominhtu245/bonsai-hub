# Prompt templates

Mỗi file `<step_code>.v<N>.yaml` là một phiên bản prompt; `python -m bonsai_api.scripts.seed` nạp vào bảng
`prompt_versions` (idempotent theo `step_code` + `version`). Code pipeline đọc prompt từ DB, không đọc file này.

- Biến: `{{ten_bien}}` (render bằng `bonsai_pipeline.prompts.render`, thiếu biến → lỗi).
- Ngoặc nhọn đơn `{...}` là chữ thường gửi cho model (ví dụ JSON, khuôn tiêu đề).
- `active: true` → phiên bản dùng mặc định cho bước đó (mỗi bước chỉ 1 bản active).
- Nguồn: `docs/prompt_system.md` v0.2.
