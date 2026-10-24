"""34 tỉnh, thành (sau sắp xếp 7/2025): vùng khí hậu cho lịch Mai kịp Tết + tọa độ trung tâm cho dự báo thời tiết."""

# mã → (tên, vùng, vĩ độ, kinh độ)
PROVINCES: dict[str, tuple[str, str, float, float]] = {
    "ha_noi": ("Hà Nội", "north", 21.03, 105.85), "hai_phong": ("Hải Phòng", "north", 20.86, 106.68),
    "quang_ninh": ("Quảng Ninh", "north", 20.95, 107.08), "bac_ninh": ("Bắc Ninh", "north", 21.19, 106.07),
    "hung_yen": ("Hưng Yên", "north", 20.65, 106.05), "ninh_binh": ("Ninh Bình", "north", 20.25, 105.97),
    "phu_tho": ("Phú Thọ", "north", 21.32, 105.40), "thai_nguyen": ("Thái Nguyên", "north", 21.59, 105.85),
    "tuyen_quang": ("Tuyên Quang", "north", 21.82, 105.21), "lao_cai": ("Lào Cai", "north", 22.48, 103.97),
    "lang_son": ("Lạng Sơn", "north", 21.85, 106.76), "cao_bang": ("Cao Bằng", "north", 22.67, 106.26),
    "son_la": ("Sơn La", "north", 21.33, 103.91), "dien_bien": ("Điện Biên", "north", 21.39, 103.02),
    "lai_chau": ("Lai Châu", "north", 22.40, 103.47), "thanh_hoa": ("Thanh Hóa", "north", 19.81, 105.78),
    "nghe_an": ("Nghệ An", "central", 18.68, 105.69), "ha_tinh": ("Hà Tĩnh", "central", 18.34, 105.91),
    "quang_tri": ("Quảng Trị", "central", 16.82, 107.10), "hue": ("Huế", "central", 16.46, 107.59),
    "da_nang": ("Đà Nẵng", "central", 16.05, 108.21), "quang_ngai": ("Quảng Ngãi", "central", 15.12, 108.80),
    "gia_lai": ("Gia Lai", "central", 13.98, 108.00), "khanh_hoa": ("Khánh Hòa", "central", 12.24, 109.19),
    "dak_lak": ("Đắk Lắk", "central", 12.67, 108.04), "lam_dong": ("Lâm Đồng", "central", 11.94, 108.44),
    "ho_chi_minh": ("TP. Hồ Chí Minh", "south", 10.78, 106.70), "dong_nai": ("Đồng Nai", "south", 10.95, 106.82),
    "tay_ninh": ("Tây Ninh", "south", 11.31, 106.10), "can_tho": ("Cần Thơ", "south", 10.03, 105.78),
    "vinh_long": ("Vĩnh Long", "south", 10.25, 105.97), "dong_thap": ("Đồng Tháp", "south", 10.46, 105.64),
    "an_giang": ("An Giang", "south", 10.38, 105.44), "ca_mau": ("Cà Mau", "south", 9.18, 105.15),
}


def region_of(code: str | None) -> str:
    return PROVINCES.get(code or "", ("", "south", 0, 0))[1]
