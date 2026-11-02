import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAsync, useToast, money, num, dateTime, timeAgo, titleCase } from '../lib/store';
import { Empty, Field, Loading, Modal, PageHead, Stat, StatusBadge } from '../components/UI';

/* ------------------------------------------------------------ moderation */
function ReviewModal({ item, kind, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    if (decision === 'rejected' && note.trim().length < 5) {
      toast.error('Tell the owner what needs to change');
      return;
    }
    setBusy(true);
    try {
      const path = kind === 'publication'
        ? `/admin/publications/${item.id}/review`
        : `/admin/products/${item.id}/review`;
      await api.post(path, { decision, note: note || undefined });
      toast.ok(`${kind === 'publication' ? 'Publication' : 'Listing'} ${decision}`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Review submission"
      width="640px"
      footer={
        <>
          <button className="btn btn-danger" onClick={() => decide('rejected')} disabled={busy}>Reject</button>
          <button className="btn btn-primary" onClick={() => decide('approved')} disabled={busy}>Approve and publish</button>
        </>
      }
    >
      {item && (
        <>
          <h3 style={{ fontSize: 'var(--step-2)' }}>{item.title}</h3>
          <div className="wrap-row" style={{ margin: '0.5rem 0 1rem' }}>
            {kind === 'publication' ? (
              <>
                <span className="badge badge-violet">{titleCase(item.publication_type)}</span>
                {item.category_name && <span className="tag">{item.category_name}</span>}
                {item.university_name && <span className="badge">{item.university_name}</span>}
              </>
            ) : (
              <>
                <span className="badge badge-violet">{titleCase(item.product_type)}</span>
                <span className="tag">{item.category_name}</span>
                <span className="badge">{money(item.price, item.currency)}</span>
              </>
            )}
          </div>

          <p className="small muted">
            From {item.owner_name || item.seller_name} ({titleCase(item.owner_role || item.seller_role)}) ·
            submitted {timeAgo(item.submitted_at || item.created_at)}
          </p>

          <p style={{ whiteSpace: 'pre-wrap' }}>{item.abstract || item.short_description}</p>

          {item.technologies && (
            <p className="small muted"><strong>Technology:</strong> {item.technologies}</p>
          )}
          {item.keywords && <p className="small muted"><strong>Keywords:</strong> {item.keywords}</p>}
          {item.document_count > 0 && (
            <p className="small muted"><strong>Documents attached:</strong> {item.document_count}</p>
          )}

          <Field label="Note to the owner" hint="Required when rejecting. Say what to fix.">
            <textarea className="textarea" style={{ minHeight: 90 }} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}

function Moderation() {
  const { data, loading, reload } = useAsync(() => api.get('/admin/moderation'), []);
  const [review, setReview] = useState(null);

  if (loading) return <Loading rows={3} />;
  const pubs = data?.data?.publications || [];
  const products = data?.data?.products || [];

  if (!pubs.length && !products.length) {
    return <Empty title="The queue is clear">Nothing is waiting for a decision. New submissions appear here immediately.</Empty>;
  }

  return (
    <>
      {pubs.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h3>Publications ({pubs.length})</h3>
          <div className="stack">
            {pubs.map((p) => (
              <div key={p.id} className="card row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="wrap-row" style={{ marginBottom: '0.35rem' }}>
                    <span className="badge badge-warn">Waiting {timeAgo(p.submitted_at)}</span>
                    <span className="badge badge-violet">{titleCase(p.publication_type)}</span>
                    {p.category_name && <span className="tag">{p.category_name}</span>}
                  </div>
                  <strong style={{ fontSize: 'var(--step-1)' }}>{p.title}</strong>
                  <div className="small muted">
                    {p.owner_name} · {titleCase(p.owner_role)}{p.university_name ? ` · ${p.university_name}` : ''}
                  </div>
                  <p className="small truncate-2" style={{ margin: '0.5rem 0 0', maxWidth: '70ch' }}>{p.abstract}</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setReview({ item: p, kind: 'publication' })}>
                  Review
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section>
          <h3>Marketplace listings ({products.length})</h3>
          <div className="stack">
            {products.map((p) => (
              <div key={p.id} className="card row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="wrap-row" style={{ marginBottom: '0.35rem' }}>
                    <span className="badge badge-warn">Waiting {timeAgo(p.created_at)}</span>
                    <span className="badge badge-violet">{titleCase(p.product_type)}</span>
                    <span className="badge">{money(p.price, p.currency)}</span>
                  </div>
                  <strong style={{ fontSize: 'var(--step-1)' }}>{p.title}</strong>
                  <div className="small muted">{p.seller_name} · {titleCase(p.seller_role)}</div>
                  <p className="small truncate-2" style={{ margin: '0.5rem 0 0', maxWidth: '70ch' }}>{p.short_description}</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setReview({ item: p, kind: 'product' })}>
                  Review
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <ReviewModal
        item={review?.item}
        kind={review?.kind}
        onClose={() => setReview(null)}
        onDone={reload}
      />
    </>
  );
}

/* ----------------------------------------------------------------- users */
function Users() {
  const toast = useToast();
  const [filters, setFilters] = useState({ role: '', status: '', q: '' });
  const { data, loading, reload } = useAsync(
    () => api.get('/admin/users', filters),
    [filters.role, filters.status, filters.q]
  );

  const setStatus = async (id, accountStatus) => {
    const reason = accountStatus === 'suspended' ? window.prompt('Reason for suspending this account?') : undefined;
    if (accountStatus === 'suspended' && !reason) return;
    try {
      await api.patch(`/admin/users/${id}/status`, { accountStatus, reason });
      toast.ok(`Account ${accountStatus}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="wrap-row" style={{ marginBottom: '1rem' }}>
        <input
          className="input" style={{ maxWidth: 260 }} placeholder="Search name or email"
          value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select className="select" style={{ width: 'auto' }} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All roles</option>
          {['student', 'researcher', 'university', 'business', 'investor', 'admin'].map((r) => (
            <option key={r} value={r}>{titleCase(r)}</option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {loading ? <Loading rows={3} /> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Plan</th><th>Publications</th><th>Listings</th><th>Status</th><th>Joined</th><th /></tr>
            </thead>
            <tbody>
              {data?.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.full_name}</strong>
                    <div className="small muted mono">{u.email}</div>
                    {u.university_name && <div className="small muted">{u.university_name}</div>}
                  </td>
                  <td className="small">{u.role_name}</td>
                  <td><StatusBadge status={u.plan_code} label={titleCase(u.plan_code)} /></td>
                  <td className="mono">{num(u.publication_count)}</td>
                  <td className="mono">{num(u.listing_count)}</td>
                  <td><StatusBadge status={u.account_status} /></td>
                  <td className="small muted">{timeAgo(u.created_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.role_code !== 'admin' && (
                      u.account_status === 'active'
                        ? <button className="btn btn-danger btn-sm" onClick={() => setStatus(u.id, 'suspended')}>Suspend</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setStatus(u.id, 'active')}>Restore</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- overview */
function Overview() {
  const { data, loading } = useAsync(() => api.get('/admin/stats'), []);
  if (loading) return <Loading rows={3} />;
  const s = data?.data;
  if (!s) return null;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <Stat value={num(s.users.total)} label="Accounts" accent />
        <Stat value={num(s.publications.approved)} label="Live publications" />
        <Stat value={num(s.publications.pending)} label="Waiting for review" />
        <Stat value={money(s.orders.gmv)} label="Marketplace volume" />
      </div>
      <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
        <Stat value={num(s.subscriptions.premium || 0)} label="Premium accounts" accent />
        <Stat value={money(s.revenue.subscription_revenue)} label="Subscription revenue" />
        <Stat value={money(s.orders.fees)} label="Platform fees" />
        <Stat value={num(s.users.new_30d)} label="New in 30 days" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h4>Accounts by role</h4>
          <table className="table" style={{ marginTop: '0.6rem' }}>
            <tbody>
              {s.byRole.map((r) => (
                <tr key={r.code}>
                  <td>{r.name}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h4>Publications approved per month</h4>
          {s.trend.length ? (
            <div className="stack" style={{ '--gap': '0.6rem', marginTop: '0.8rem' }}>
              {s.trend.map((t) => {
                const max = Math.max(...s.trend.map((x) => x.n));
                return (
                  <div key={t.month}>
                    <div className="row-between small"><span className="mono">{t.month}</span><span className="mono">{t.n}</span></div>
                    <div className="meter-bar"><div className="meter-fill" style={{ width: `${(t.n / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small">Nothing approved in the last six months.</p>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- logs */
function Logs() {
  const { data, loading } = useAsync(() => api.get('/admin/logs'), []);
  if (loading) return <Loading rows={3} />;
  const mod = data?.data?.moderation || [];
  const act = data?.data?.activity || [];

  return (
    <div className="grid grid-2">
      <div>
        <h3>Moderation decisions</h3>
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Action</th><th>Entity</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {mod.map((m) => (
                <tr key={m.id}>
                  <td className="small">{m.action}{m.note ? <div className="small muted truncate-2">{m.note}</div> : null}</td>
                  <td className="small mono">{m.entity_type} #{m.entity_id}</td>
                  <td className="small">{m.actor_name || 'system'}</td>
                  <td className="small muted">{timeAgo(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3>Account activity</h3>
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Action</th><th>User</th><th>When</th></tr></thead>
            <tbody>
              {act.map((a) => (
                <tr key={a.id}>
                  <td className="small mono">{a.action}</td>
                  <td className="small">{a.full_name || '—'}</td>
                  <td className="small muted">{timeAgo(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function ContentManagement() {
  const { data, loading, reload } = useAsync(() => api.get('/admin/content'), []);
  const toast = useToast();
  const remove = async (kind, item) => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone from the interface.`)) return;
    try {
      await api.del(kind === 'publication' ? `/publications/${item.id}` : `/marketplace/products/${item.id}`);
      toast.ok(`${kind === 'publication' ? 'Publication' : 'Marketplace item'} deleted`);
      reload();
    } catch (err) { toast.error(err.message); }
  };
  if (loading) return <Loading rows={4} />;
  const pubs = data?.data?.publications || [];
  const products = data?.data?.products || [];
  return <div className="stack">
    <section className="card"><h3>All publications ({pubs.length})</h3>
      {!pubs.length ? <p className="muted">No publications.</p> : pubs.map((p) => <div key={p.id} className="row-between" style={{ padding: '.8rem 0', borderBottom: '1px solid var(--line)' }}>
        <div><strong>{p.title}</strong><div className="small muted">Status: {p.status}{p.deleted_at ? ' · deleted' : ''}</div></div>
        <div className="wrap-row"><Link className="btn btn-quiet btn-sm" to={`/publications/${p.id}/edit`}>Edit</Link><button className="btn btn-danger btn-sm" onClick={() => remove('publication', p)}>Delete</button></div>
      </div>)}
    </section>
    <section className="card"><h3>All marketplace items ({products.length})</h3>
      {!products.length ? <p className="muted">No marketplace items.</p> : products.map((p) => <ProductAdminRow key={p.id} item={p} onDelete={() => remove('product', p)} onSaved={reload} />)}
    </section>
  </div>;
}

function ProductAdminRow({ item, onDelete, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(String(item.price ?? ''));
  const toast = useToast();
  const save = async () => {
    try { await api.put(`/marketplace/products/${item.id}`, { title, price: Number(price) }); toast.ok('Marketplace item updated'); setEditing(false); onSaved(); }
    catch (err) { toast.error(err.message); }
  };
  return <div style={{ padding: '.8rem 0', borderBottom: '1px solid var(--line)' }}>
    {editing ? <div className="grid grid-2"><Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="Price"><input className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field><button className="btn btn-primary btn-sm" onClick={save}>Save</button><button className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>Cancel</button></div> : <div className="row-between"><div><strong>{item.title}</strong><div className="small muted">Status: {item.status} · Price: {item.price}</div></div><div className="wrap-row"><button className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}>Edit</button><button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button></div></div>}
  </div>;
}

const TABS = [
  ['moderation', 'Moderation queue'],
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['content', 'Manage content'],
  ['logs', 'Audit log'],
];

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'moderation';

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Administration"
        title="Platform control"
        description="Nothing reaches the public catalogue without passing through this queue."
        actions={<Link className="btn btn-ghost" to="/dashboard">Dashboard</Link>}
      />
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} className="tab" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'moderation' && <Moderation />}
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users />}
      {tab === 'content' && <ContentManagement />}
      {tab === 'logs' && <Logs />}
    </div>
  );
}
