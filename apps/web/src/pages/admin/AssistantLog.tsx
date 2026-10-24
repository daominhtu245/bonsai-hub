import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminCommunityApi } from '@/lib/adminCommunity';
import { Badge, DataTable, PageHeader, Panel, StatCard, TableView, Tabs, dt, num, useLoad } from './kit';

type Kind = 'questions' | 'health';

/** Nhật ký trợ lý chăm cây 30 ngày: câu tra bảng chưa trả lời được / đoán bệnh không ra → bổ sung Bộ luật (loài, sâu bệnh). */
export default function AssistantLogPage() {
  const [kind, setKind] = useState<Kind>('questions');
  const [gaps, setGaps] = useState(false);
  const [state] = useLoad(() => adminCommunityApi.assistant(kind, gaps), [kind, gaps]);
  return (
    <>
      <PageHeader title="Trợ lý chăm cây" sub={<>Câu hỏi và đoán bệnh 30 ngày qua · bổ sung bảng ở <Link to="/admin/bo-luat">Bộ luật</Link></>} />
      <Tabs<Kind> value={kind} onChange={setKind} tabs={[['questions', 'Hỏi cách chăm'], ['health', 'Lá có bệnh?']]} />
      <TableView state={state}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Lượt 30 ngày" value={d.summary.total_30d} format={num} />
              <StatCard label="Chưa trả lời được" value={d.summary.gaps} format={num} goodWhen="down" hint="Cần bổ sung bảng" />
              <StatCard label="AI lỗi (đã tra bảng)" value={d.summary.ai_failed} format={num} goodWhen="down" />
            </div>
            <label className="flex min-h-touch items-center gap-2 text-caption">
              <input type="checkbox" role="switch" className="switch" checked={gaps} onChange={(e) => setGaps(e.target.checked)} />Chỉ những lượt chưa trả lời được
            </label>
            <Panel pad={false}>
              {kind === 'questions' ? (
                <DataTable rows={d.items} rowKey={(i) => i.id} empty="Chưa có câu hỏi."
                  columns={[
                    { key: 'q', header: 'Câu hỏi', render: (i) => <span className="font-medium">{i.question}</span> },
                    { key: 'a', header: 'Trả lời', render: (i) => <span className="line-clamp-2 max-w-[420px] text-ink-muted">{i.answer}</span> },
                    { key: 'm', header: 'Cách', render: (i) => <Badge tone={i.gap ? 'warn' : i.method === 'ai' ? 'info' : 'neutral'}>{i.gap ? 'Chưa hiểu' : i.method === 'ai' ? 'AI' : 'Tra bảng'}</Badge> },
                    { key: 'd', header: 'Lúc', render: (i) => dt(i.created_at) },
                  ]} />
              ) : (
                <DataTable rows={d.items} rowKey={(i) => i.id} empty="Chưa có lượt đoán bệnh."
                  columns={[
                    { key: 'p', header: '', render: (i) => (i.photo_url ? <a href={i.photo_url} target="_blank" rel="noreferrer"><img src={i.photo_url} alt="" className="h-10 w-10 rounded-img object-cover" /></a> : null) },
                    { key: 's', header: 'Dấu hiệu', render: (i) => <span className="text-ink-muted">{(i.symptoms ?? []).length} dấu hiệu</span> },
                    { key: 'f', header: 'Kết quả', render: (i) => (i.findings?.length ? i.findings.join(', ') : <Badge tone="warn">Không ra</Badge>) },
                    { key: 'm', header: 'Cách', render: (i) => <Badge tone={i.method === 'ai' ? 'info' : 'neutral'}>{i.method === 'ai' ? 'AI' : 'Tra bảng'}{i.ai_failed ? ' · AI lỗi' : ''}</Badge> },
                    { key: 'd', header: 'Lúc', render: (i) => dt(i.created_at) },
                  ]} />
              )}
            </Panel>
          </div>
        )}
      </TableView>
    </>
  );
}
