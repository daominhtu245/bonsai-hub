import type { StageGuide, StageTab } from '@/components/ui';

// Dữ liệu mẫu từ mockup Result.dc.html — chỉ dùng cho trang hệ thống thiết kế.
export const sampleTabs: StageTab[] = [
  { code: 'S0', short: 'Hiện tại' },
  { code: 'S1', short: 'Tạo khung' },
  { code: 'S2', short: 'Nuôi cành' },
  { code: 'S3', short: 'Định tầng' },
  { code: 'S4', short: 'Hoàn thiện' },
];

export const sampleGuides: StageGuide[] = [
  {
    code: 'S0', name: 'Hiện trạng', time: 'Hôm nay',
    see: 'Phôi si cao 45 cm, 6 cành, thân uốn nhẹ hình chữ S, rễ nổi đều về bên trái.',
    actions: ['Đặt cây nơi có nắng sáng, tránh nắng gắt buổi trưa', 'Tưới đẫm khi mặt đất khô khoảng 1 đốt ngón tay'],
    season: 'Chờ cuối đông để bắt đầu cắt tạo khung', ready: ['Cây khỏe, lá xanh đều', 'Đã qua mùa lạnh'],
    mistake: 'Cắt tỉa ngay khi vừa mua về, lúc cây chưa quen chỗ mới.',
  },
  {
    code: 'S1', name: 'Tạo khung', time: 'Tháng 0',
    see: 'Cắt 2 cành phía trên, hạ ngọn, uốn dây 3 cành giữ lại. Tán còn thưa.',
    actions: ['Cắt 2 cành phía trên sát thân, bôi keo liền sẹo', 'Uốn dây nhôm 2,5 mm cành trái xuống khoảng 20°', 'Hạ ngọn khoảng 8 cm, giữ một chồi khỏe làm ngọn mới'],
    season: 'Cuối đông – đầu xuân (tháng 1–3)', ready: ['Vết cắt đã liền mép', 'Cành giữ lại ra chồi mới đều'],
    mistake: 'Tháo dây muộn làm hằn vỏ. Kiểm tra dây mỗi 3–4 tuần.',
  },
  {
    code: 'S2', name: 'Phục hồi và nuôi cành', time: '6–12 tháng',
    see: 'Cành mọc dài tự do để lấy sức; cây trông rậm và chưa gọn. Đây là giai đoạn bình thường.',
    actions: ['Để cành mọc tự do, chưa cắt ngọn', 'Bón phân hữu cơ tan chậm mỗi tháng', 'Tháo dây cũ, uốn lại nếu cành bật về'],
    season: 'Mùa mưa (tháng 5–9)', ready: ['Cành dài trên 15 cm', 'Gốc to thêm rõ rệt'],
    mistake: 'Cắt tỉa quá sớm khi cành chưa đủ sức làm cây yếu đi.',
  },
  {
    code: 'S3', name: 'Định tầng tán', time: '2–3 năm',
    see: 'Cành dài đã được cắt ngắn, tán bắt đầu thành tầng, cây sang chậu gốm.',
    actions: ['Cắt chừa 2 lá trên mỗi chồi để cành phân nhánh', 'Thay sang chậu gốm nâu, tỉa bớt rễ cái', 'Tỉa thưa lá để lộ dáng cành'],
    season: 'Đầu xuân thay chậu; tỉa chồi quanh năm', ready: ['Mỗi tầng tán dày và tách rời nhau', 'Rễ đã bám chậu mới'],
    mistake: 'Thay chậu và cắt tỉa nặng cùng một lúc.',
  },
  {
    code: 'S4', name: 'Hoàn thiện', time: '4–6 năm',
    see: 'Bốn tầng tán rõ, ngọn tròn, thân to và thuôn đều, đặt lệch trái trong chậu gốm nâu.',
    actions: ['Duy trì dáng: tỉa chồi 2–3 lần mỗi năm', 'Thay chậu mỗi 2–3 năm', 'Phủ rêu mặt chậu khi trưng bày'],
    season: 'Quanh năm', ready: [],
    mistake: 'Để tán quá dày làm cành bên trong thiếu sáng và chết dần.',
  },
];
