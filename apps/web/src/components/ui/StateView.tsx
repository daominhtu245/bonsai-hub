import type { ReactNode } from 'react';
import { Button } from './Button';
import { Notice } from './Notice';

export type ViewState<T> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'ready'; data: T };

/** Bắt buộc 4 trạng thái cho mọi màn hình: đang tải (skeleton cùng bố cục), rỗng, lỗi, bình thường. */
export function StateView<T>({
  state,
  skeleton,
  empty,
  children,
}: {
  state: ViewState<T>;
  skeleton: ReactNode;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}) {
  switch (state.status) {
    case 'loading':
      return (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Đang tải…</span>
          {skeleton}
        </div>
      );
    case 'empty':
      return <>{empty}</>;
    case 'error':
      return (
        <Notice
          tone="danger"
          action={state.retry ? <Button variant="secondary" size="touch" block={false} onClick={state.retry}>Thử lại</Button> : undefined}
        >
          {state.message}
        </Notice>
      );
    case 'ready':
      return <>{children(state.data)}</>;
  }
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <h2 className="text-h2">{title}</h2>
      {body ? <p className="m-0 text-ink-muted">{body}</p> : null}
      {action}
    </div>
  );
}
