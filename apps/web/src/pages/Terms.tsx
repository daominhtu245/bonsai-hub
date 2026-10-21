import { BackHeader } from '@/components/BackHeader';

/** Điều khoản sử dụng và quyền riêng tư (bản nháp — cần luật sư duyệt trước khi mở rộng). */
export default function Terms() {
  const h = 'text-h2 mt-6';
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Điều khoản và quyền riêng tư" />
      <main className="px-gutter pb-10 text-body [&_li]:mt-1 [&_p]:my-2">
        <p className="text-caption text-ink-muted">Cập nhật: 21/10/2026 · Bản dùng thử (beta)</p>

        <h2 className={h}>1. Bonsai AI làm gì</h2>
        <p>Bonsai AI phân tích ảnh phôi bạn chụp, đề xuất thế cây kèm bản vẽ, và (khi bạn dùng lượt) tạo ảnh minh họa cây sau vài năm cùng hướng dẫn chăm theo giai đoạn.</p>
        <p><strong>Ảnh tương lai là minh họa định hướng do AI tạo</strong>, không phải lời hứa kết quả. Kết quả thật phụ thuộc chăm sóc, khí hậu và sức khỏe cây.</p>

        <h2 className={h}>2. Ảnh và dữ liệu của bạn</h2>
        <ul className="pl-5">
          <li>Ảnh tải lên được xóa thông tin vị trí (GPS) và EXIF, lưu ở kho riêng tư; chỉ bạn xem được qua đường dẫn có thời hạn 1 giờ.</li>
          <li>Ảnh và mô tả cây được gửi tới nhà cung cấp AI (Anthropic, Google, OpenAI) để phân tích và tạo ảnh. Chúng tôi không bán dữ liệu của bạn.</li>
          <li>Trang chia sẻ chỉ công khai khi bạn bấm chia sẻ, và không hiện email hay thông tin tài khoản (trừ tên vườn, số điện thoại bạn chọn in lên ảnh).</li>
          <li>Bạn xóa được từng cây (kèm toàn bộ ảnh) trong màn kết quả.</li>
        </ul>

        <h2 className={h}>3. Dùng ảnh để cải thiện AI (không bắt buộc)</h2>
        <p>Nếu bạn bật “Cho phép dùng ảnh để cải thiện AI”, ảnh mặt tiền phôi của bạn có thể được dùng để huấn luyện mô hình nhận diện thân cây của Bonsai AI. Ảnh không được công bố hay bán. Bạn tắt được bất cứ lúc nào trong Tài khoản; ảnh tải lên sau khi tắt sẽ không được dùng.</p>

        <h2 className={h}>4. Lượt và thanh toán</h2>
        <ul className="pl-5">
          <li>Phân tích và bản vẽ luôn miễn phí. Mỗi lượt dùng để tạo ảnh tương lai, ảnh các giai đoạn và hướng dẫn.</li>
          <li>Nếu tạo ảnh lỗi sau khi đã trừ lượt, lượt được hoàn tự động.</li>
          <li>Lượt mua qua chuyển khoản được cộng khi ngân hàng báo tiền về; lịch sử nằm trong Tài khoản.</li>
        </ul>

        <h2 className={h}>5. Thông báo</h2>
        <p>Bạn có thể bật thông báo trên trình duyệt hoặc qua Zalo (cần số điện thoại) để biết khi phân tích, tạo ảnh xong. Tắt trong Tài khoản.</p>

        <h2 className={h}>6. Xóa tài khoản</h2>
        <p>Khi bạn xóa tài khoản, tài khoản ngừng hoạt động ngay: không đăng nhập được, trang chia sẻ bị ẩn, không nhận thông báo. Dữ liệu (cây, ảnh, lịch sử lượt và thanh toán) được <strong>giữ lại</strong> để đối soát và có thể khôi phục khi bạn liên hệ hỗ trợ.</p>

        <h2 className={h}>7. Liên hệ</h2>
        <p>Mọi câu hỏi về dữ liệu, khôi phục tài khoản: liên hệ đội ngũ Bonsai AI qua kênh hỗ trợ trong app.</p>
      </main>
    </div>
  );
}
