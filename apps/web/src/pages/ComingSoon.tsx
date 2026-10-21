import { AppHeader } from '@/components/AppHeader';
import { ButtonLink, EmptyState } from '@/components/ui';

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <AppHeader />
      <main className="px-gutter pt-6">
        <EmptyState title={title} body="Màn hình này đang được làm, bạn quay lại sau nhé." action={<ButtonLink to="/" variant="secondary" block={false}>Về trang chủ</ButtonLink>} />
      </main>
    </div>
  );
}
