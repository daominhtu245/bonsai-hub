import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BeforeAfterSlider, GuideCard, StageTimeline, StateView } from '@/components/ui';
import { sampleGuides, sampleTabs } from '@/pages/sampleStages';
import Home from '@/pages/Home';
import { AuthProvider } from '@/lib/auth';

describe('BeforeAfterSlider', () => {
  it('moves with keyboard and clamps', async () => {
    render(<BeforeAfterSlider before={<span />} after={<span />} beforeLabel="Trước" afterLabel="Sau" />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '52');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('StageTimeline', () => {
  it('marks current stage and reports selection', async () => {
    const onSelect = vi.fn();
    render(<StageTimeline stages={sampleTabs} current={2} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'S2 Nuôi cành' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'S4 Hoàn thiện' }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});

describe('GuideCard', () => {
  it('renders sections and toggles tasks', async () => {
    const onToggle = vi.fn();
    render(<GuideCard guide={sampleGuides[1]} done={new Set([0])} onToggle={onToggle} />);
    expect(screen.getByRole('heading', { name: 'Tạo khung' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0]).toBeChecked();
    await userEvent.click(boxes[1]);
    expect(onToggle).toHaveBeenCalledWith(1);
    expect(screen.getByText('Lỗi hay gặp')).toBeInTheDocument();
  });

  it('hides ready section on final stage', () => {
    render(<GuideCard guide={sampleGuides[4]} done={new Set()} onToggle={() => {}} />);
    expect(screen.queryByText('Sẵn sàng sang giai đoạn sau khi')).not.toBeInTheDocument();
  });
});

describe('StateView', () => {
  it('renders all four states', async () => {
    const retry = vi.fn();
    const { rerender } = render(<StateView state={{ status: 'loading' }} skeleton={<i>sk</i>} empty={<i>rỗng</i>}>{(d: string) => d}</StateView>);
    expect(screen.getByText('sk')).toBeInTheDocument();
    rerender(<StateView state={{ status: 'empty' }} skeleton={null} empty={<i>rỗng</i>}>{(d: string) => d}</StateView>);
    expect(screen.getByText('rỗng')).toBeInTheDocument();
    rerender(<StateView state={{ status: 'error', message: 'Lỗi mạng', retry }} skeleton={null} empty={null}>{(d: string) => d}</StateView>);
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi mạng');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalled();
    rerender(<StateView state={{ status: 'ready', data: 'xong' }} skeleton={null} empty={null}>{(d: string) => d}</StateView>);
    expect(screen.getByText('xong')).toBeInTheDocument();
  });
});

describe('Home', () => {
  it('shows hero, CTA and trial chip for guests', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Phôi hôm nay');
    expect(screen.getByRole('link', { name: /Chụp phôi của bạn/ })).toHaveAttribute('href', '/chup');
    expect(screen.getByText('1 lượt miễn phí')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });
});
