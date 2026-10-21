// Sentry cho web: chỉ tải SDK khi có VITE_SENTRY_DSN (không làm nặng bundle chính).
export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    // Không gửi URL ký sẵn (chứa chữ ký truy cập ảnh) lên Sentry.
    beforeBreadcrumb: (b) => (typeof b.data?.url === 'string' && b.data.url.includes('X-Amz-') ? null : b),
  });
}
