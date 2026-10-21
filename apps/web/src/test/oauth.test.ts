import { takeZaloPkce } from '@/lib/oauth';

describe('takeZaloPkce', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns verifier only when state matches, and only once', () => {
    sessionStorage.setItem('bonsai.zalo-pkce', JSON.stringify({ verifier: 'v', state: 's1', next: '/chup' }));
    expect(takeZaloPkce('s1')).toEqual({ verifier: 'v', next: '/chup' });
    expect(takeZaloPkce('s1')).toBeNull();
  });

  it('rejects mismatched state', () => {
    sessionStorage.setItem('bonsai.zalo-pkce', JSON.stringify({ verifier: 'v', state: 's1', next: '/' }));
    expect(takeZaloPkce('evil')).toBeNull();
  });
});
