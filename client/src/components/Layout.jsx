import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth, timeAgo } from '../lib/store';
import { Avatar, PlanBadge, Wordmark } from './UI';

const NAV = [
  { to: '/explore', label: 'Publications' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/pricing', label: 'Plans' },
];

function NotificationsMenu({ onClose }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/notifications').then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  const markAllRead = async () => {
    await api.post('/notifications/read', {});
    setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    window.dispatchEvent(new CustomEvent('pv:notifications-read'));
  };

  return (
    <div className="menu" style={{ width: 340 }}>
      <div className="row-between" style={{ padding: '0.5rem 0.7rem' }}>
        <strong style={{ fontFamily: 'var(--display)' }}>Notifications</strong>
        <button className="btn btn-quiet btn-sm" onClick={markAllRead}>Mark all read</button>
      </div>
      <hr />
      {items === null && <div className="small muted" style={{ padding: '1rem 0.7rem' }}>Loading…</div>}
      {items?.length === 0 && (
        <div className="small muted" style={{ padding: '1.5rem 0.7rem', textAlign: 'center' }}>
          Nothing yet. Activity on your publications and requests shows up here.
        </div>
      )}
      {items?.slice(0, 12).map((n) => (
        <Link
          key={n.id}
          to={n.link_url || '/dashboard'}
          onClick={onClose}
          style={{
            display: 'block', padding: '0.6rem 0.7rem', borderRadius: 'var(--radius-sm)',
            background: n.is_read ? 'transparent' : 'var(--violet-50)',
          }}
        >
          <div className="row" style={{ gap: '0.4rem', alignItems: 'baseline' }}>
            {n.priority === 'priority' && <span className="badge badge-violet">Priority</span>}
            <strong style={{ color: 'var(--ink)', fontSize: 'var(--step-0)' }}>{n.title}</strong>
          </div>
          {n.body && <div className="small muted truncate-2">{n.body}</div>}
          <div className="small mono muted">{timeAgo(n.created_at)}</div>
        </Link>
      ))}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(null);
  const [unread, setUnread] = useState(0);
  const shellRef = useRef(null);

  useEffect(() => {
    if (!user) { setUnread(0); return undefined; }
    const load = () => api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    window.addEventListener('pv:notifications-read', load);
    return () => { clearInterval(id); window.removeEventListener('pv:notifications-read', load); };
  }, [user]);

  useEffect(() => {
    const onClick = (e) => { if (!shellRef.current?.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleSignOut = () => {
    signOut();
    setOpenMenu(null);
    navigate('/');
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wrap topbar-inner" ref={shellRef}>
          <Wordmark />

          <nav className="nav grow" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user ? (
            <div className="row" style={{ gap: '0.4rem' }}>
              <Link className="btn btn-quiet" to="/cart" aria-label="Cart">Cart</Link>

              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-quiet bell"
                  onClick={() => setOpenMenu(openMenu === 'notif' ? null : 'notif')}
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                  aria-expanded={openMenu === 'notif'}
                >
                  Alerts
                  {unread > 0 && <span className="bell-dot mono">{unread > 9 ? '9+' : unread}</span>}
                </button>
                {openMenu === 'notif' && <NotificationsMenu onClose={() => setOpenMenu(null)} />}
              </div>

              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-quiet row"
                  onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
                  aria-expanded={openMenu === 'user'}
                  style={{ gap: '0.5rem' }}
                >
                  <Avatar name={user.full_name} url={user.avatar_url} />
                </button>
                {openMenu === 'user' && (
                  <div className="menu">
                    <div style={{ padding: '0.6rem 0.7rem' }}>
                      <strong style={{ display: 'block', fontFamily: 'var(--display)' }}>{user.full_name}</strong>
                      <div className="small muted">{user.role_name}</div>
                      <div style={{ marginTop: '0.4rem' }}><PlanBadge plan={user.plan_code} /></div>
                    </div>
                    <hr />
                    <Link to="/dashboard" onClick={() => setOpenMenu(null)}>Dashboard</Link>
                    <Link to="/requests" onClick={() => setOpenMenu(null)}>Requests</Link>
                    {['student', 'researcher'].includes(user.role_code) && (
                      <Link to="/publications/new" onClick={() => setOpenMenu(null)}>New publication</Link>
                    )}
                    {user.role_code !== 'admin' && (
                      <Link to="/sell" onClick={() => setOpenMenu(null)}>Sell in the marketplace</Link>
                    )}
                    <Link to="/orders" onClick={() => setOpenMenu(null)}>Orders</Link>
                    {user.role_code === 'university' && (
                      <Link to="/university" onClick={() => setOpenMenu(null)}>University console</Link>
                    )}
                    {user.role_code === 'admin' && (
                      <Link to="/admin" onClick={() => setOpenMenu(null)}>Administration</Link>
                    )}
                    <hr />
                    <Link to="/settings" onClick={() => setOpenMenu(null)}>Settings</Link>
                    <button onClick={handleSignOut}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: '0.4rem' }}>
              <Link className="btn btn-ghost btn-sm" to="/signin">Sign in</Link>
              <Link className="btn btn-primary btn-sm" to="/register">Create account</Link>
            </div>
          )}
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="footer">
        <div className="wrap">
          <div className="grid grid-4" style={{ gap: '2rem' }}>
            <div>
              <Wordmark inverted />
              <p style={{ marginTop: '0.8rem', maxWidth: '30ch' }}>
                University research, published where industry can actually find it.
              </p>
            </div>
            <div>
              <h5>Explore</h5>
              <Link to="/explore">Publications</Link>
              <Link to="/marketplace">Marketplace</Link>
              <Link to="/pricing">Plans and pricing</Link>
            </div>
            <div>
              <h5>Publish</h5>
              <Link to="/publications/new">Add a publication</Link>
              <Link to="/sell">Sell a research output</Link>
              <Link to="/register">Create an account</Link>
            </div>
            <div>
              <h5>Institution</h5>
              <Link to="/university">University console</Link>
              <Link to="/settings">Account settings</Link>
            </div>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--graphite-800)', margin: '2rem 0 1rem' }} />
          <div className="row-between small">
            <span>© {new Date().getFullYear()} ProjectVerse — Sri Lanka Technology Campus</span>
            <span className="mono">CCS3361 Technology Challenge Competition</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
