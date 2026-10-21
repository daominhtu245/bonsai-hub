import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { RawTreeIllustration, StyledTreeIllustration } from '@/components/illustrations/Bonsai';
import { BeforeAfterSlider, ButtonLink, Chip, StyleName } from '@/components/ui';

const steps = [
  { title: 'Chụp 4 mặt phôi', body: 'Khung ngắm giúp bạn chụp đúng góc, thấy rõ gốc.' },
  { title: 'Chọn thế cây', body: '2–3 phương án hợp với thân phôi, kèm bản vẽ cắt tỉa.' },
  { title: 'Nhận ảnh và lộ trình', body: 'Cây qua từng giai đoạn, việc cần làm theo mùa.' },
];

const styles: Array<[string, string | null]> = [
  ['Trực', 'Chokkan'],
  ['Trực uốn', 'Moyogi'],
  ['Xiêu', 'Shakan'],
  ['Huyền', 'Kengai'],
  ['Văn nhân', 'Bunjingi'],
  ['Trực quân tử', null],
  ['Thế long', null],
];

/** Màn hình 01 — Trang chủ (design/mockups/Main.dc.html). */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <AppHeader />

      <section className="flex flex-col gap-3 px-gutter pt-4">
        <h1 className="text-display">
          Phôi hôm nay,
          <br />
          dáng cây mai sau.
        </h1>
        <p className="m-0 text-ink-muted">
          Chụp ảnh phôi, nhận bản vẽ thiết kế theo luật bonsai và lộ trình chăm từng giai đoạn cho chính cây của bạn.
        </p>
      </section>

      <section className="px-gutter pt-5">
        <BeforeAfterSlider
          before={<RawTreeIllustration />}
          after={<StyledTreeIllustration />}
          beforeLabel="Phôi si · hôm nay"
          afterLabel="Minh họa sau ~5 năm"
        />
      </section>

      <section className="flex flex-col gap-2 px-gutter pt-5">
        <ButtonLink to="/chup">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Chụp phôi của bạn
        </ButtonLink>
        <p className="m-0 text-center text-caption text-ink-muted">Phân tích và bản vẽ miễn phí. Chỉ trả lượt khi tạo ảnh tương lai.</p>
      </section>

      <section className="flex flex-col gap-3 px-gutter pt-7">
        <h2 className="text-h2">Ba bước, vài phút</h2>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 rounded-card border border-line bg-surface p-3.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink">{i + 1}</span>
              <div>
                <div className="font-semibold">{s.title}</div>
                <div className="text-caption text-ink-muted">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3 px-gutter pt-7">
        <h2 className="text-h2">Thế cây hỗ trợ</h2>
        <div className="flex flex-wrap gap-2">
          {styles.map(([vi, jp]) => (
            <Chip key={vi}>
              <StyleName vi={vi} jp={jp} />
            </Chip>
          ))}
        </div>
      </section>

      <div className="h-8" />
      <footer className="mt-auto border-t border-line px-gutter py-6 text-label text-ink-muted">
        Ảnh tương lai là minh họa định hướng; kết quả thực tế phụ thuộc chăm sóc và điều kiện trồng.{' '}
        <Link to="/dieu-khoan">Điều khoản và quyền riêng tư</Link>
      </footer>
    </div>
  );
}
