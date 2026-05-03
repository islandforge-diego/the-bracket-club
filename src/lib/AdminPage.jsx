/**
 * AdminPage.jsx — Private admin dashboard at /admin.
 *
 * Routing-level access:
 *   - Not signed in  → "Sign in required" prompt
 *   - Signed in, not admin → "Not authorized" message
 *   - Signed in admin → renders the dashboard
 *
 * Database-level safety:
 *   The admin_user_summary and admin_platform_stats views filter on the
 *   is_admin() function — non-admin queries return zero rows even if this
 *   client-side guard is bypassed.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { loadAdminUserSummary, loadAdminPlatformStats, getNewReleases, upsertVerifiedItem, removeVerifiedItem } from "./db.js";

const card = {
  background: "#fff",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  border: "1px solid #f1f5f9",
};

function Stat({ label, value, sub }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const [stats, setStats]     = useState(null);
  const [users, setUsers]     = useState([]);
  const [busy, setBusy]       = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([loadAdminPlatformStats(), loadAdminUserSummary()]).then(([s, u]) => {
      setStats(s);
      setUsers(u);
      setBusy(false);
    });
  }, [isAdmin]);

  if (loading) return null;

  if (!user) return (
    <Empty title="Sign in required" body="The admin dashboard requires an authenticated admin account." />
  );

  if (!isAdmin) return (
    <Empty title="Not authorized" body="Your account is not an admin. Ask the project owner if you should have access." />
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "60px 24px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link to="/books" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none" }}>← back to app</Link>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "16px 0 4px" }}>Admin</h1>
        <div style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
          Signed in as <strong>{user.email}</strong>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <Stat label="Total users"     value={stats?.total_users}        sub={`${stats?.new_signups_7d ?? 0} new in last 7 days`} />
          <Stat label="Marketing opt-ins" value={stats?.marketing_opt_ins}
                sub={stats?.total_users ? `${Math.round(100 * stats.marketing_opt_ins / stats.total_users)}% of users` : null} />
          <Stat label="Active (30d)"    value={stats?.active_30d} />
          <Stat label="Shelf items"     value={stats?.total_shelf_items} />
          <Stat label="Bracket picks"   value={stats?.total_bracket_picks} />
        </div>

        {/* User table */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 14 }}>
            Users {users.length > 0 && <span style={{ color: "#94a3b8", fontWeight: 400 }}>({users.length})</span>}
          </div>
          {busy ? (
            <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No users yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Joined</Th>
                    <Th>Last seen</Th>
                    <Th align="center">Marketing</Th>
                    <Th align="right">Shelf</Th>
                    <Th align="right">Picks</Th>
                    <Th align="right">Champs</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Td>
                        {u.email}
                        {u.is_admin && <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", background: "#6366f1", color: "#fff", borderRadius: 4, fontWeight: 600 }}>ADMIN</span>}
                      </Td>
                      <Td>{u.display_name || "—"}</Td>
                      <Td title={u.signed_up_at}>{fmtDate(u.signed_up_at)}</Td>
                      <Td title={u.last_sign_in_at}>{fmtRelative(u.last_sign_in_at)}</Td>
                      <Td align="center">{u.marketing_consent ? "✓" : "—"}</Td>
                      <Td align="right">{u.shelf_count}</Td>
                      <Td align="right">{u.pick_count}</Td>
                      <Td align="right">{u.season_champ_count}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* New Releases catalog management */}
        <AdminBookSearch />
      </div>
    </div>
  );
}

// ─── Admin Book Search ────────────────────────────────────────────────────────
function AdminBookSearch() {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [searchErr,  setSearchErr]  = useState("");
  const [catalog,    setCatalog]    = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [addingId,   setAddingId]   = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [message,    setMessage]    = useState("");

  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const loadCatalog = () => {
    setCatLoading(true);
    getNewReleases().then(data => { setCatalog(data); setCatLoading(false); });
  };
  useEffect(() => { loadCatalog(); }, []);

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setSearchErr(""); setResults([]);
    try {
      const res  = await fetch(`/api/google-books?q=${encodeURIComponent(query)}&maxResults=10`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.items || []);
    } catch (err) {
      setSearchErr(err.message);
    } finally {
      setSearching(false);
    }
  };

  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(""), 3500); };

  const addBook = async (book) => {
    setAddingId(book.googleBooksId);
    try {
      await upsertVerifiedItem(book, "books");
      flash(`✓ "${book.title}" added to catalog`);
      loadCatalog();
    } catch (err) {
      flash(`✗ Failed: ${err.message}`);
    } finally {
      setAddingId(null);
    }
  };

  const removeBook = async (item) => {
    if (!confirm(`Remove "${item.title}" from the catalog?`)) return;
    setRemovingId(item.id);
    try {
      await removeVerifiedItem(item.id);
      flash(`✓ "${item.title}" removed`);
      loadCatalog();
    } catch (err) {
      flash(`✗ Failed: ${err.message}`);
    } finally {
      setRemovingId(null);
    }
  };

  const ok = message.startsWith("✓");

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>📖 New Releases Catalog</h2>

      {/* Search bar */}
      <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='Search Google Books (e.g. "Intermezzo Sally Rooney")'
          style={{ flex: 1, padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none" }}
        />
        <button type="submit" disabled={searching}
          style={{ padding: "10px 20px", background: "#14532d", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: searching ? "default" : "pointer" }}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {searchErr && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{searchErr}</div>}
      {message && (
        <div style={{ padding: "8px 14px", background: ok ? "#f0fdf4" : "#fef2f2", color: ok ? "#166534" : "#dc2626", borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>
          {message}
        </div>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Results</div>
          {results.map(book => (
            <div key={book.googleBooksId} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #f1f5f9" }}>
              {book.coverUrl
                ? <img src={book.coverUrl} alt={book.title} style={{ width: 44, height: 62, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                : <div style={{ width: 44, height: 62, background: "#f5f5f4", borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📚</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{book.title}</div>
                {book.authors.length > 0 && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{book.authors.join(", ")}</div>}
                {book.publishedDate && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{book.publishedDate}</div>}
                {book.genres.length > 0 && <div style={{ fontSize: 11, color: "#6366f1", marginTop: 3 }}>{book.genres.slice(0, 2).join(" · ")}</div>}
              </div>
              <button
                onClick={() => addBook(book)}
                disabled={addingId === book.googleBooksId}
                style={{ padding: "6px 14px", background: "#14532d", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: addingId === book.googleBooksId ? "default" : "pointer", flexShrink: 0 }}>
                {addingId === book.googleBooksId ? "Adding…" : "+ Add"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Catalog table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, fontSize: 14 }}>
          Catalog <span style={{ color: "#94a3b8", fontWeight: 400 }}>({catalog.length} books)</span>
        </div>
        {catLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Loading…</div>
        ) : catalog.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No books yet — search above to add some.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                  <Th></Th>
                  <Th>Title</Th>
                  <Th>Author(s)</Th>
                  <Th>Release</Th>
                  <Th>Genres</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {catalog.map(item => {
                  const creators   = Array.isArray(item.creators) ? item.creators : [];
                  const genres     = Array.isArray(item.genres)   ? item.genres   : [];
                  const cover      = item.cover_url ?? item.metadata?.coverUrl ?? "";
                  const release    = item.published_month != null
                    ? `${MONTH_ABBR[item.published_month - 1]} ${item.published_year}`
                    : item.published_year ?? "—";
                  return (
                    <tr key={item.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Td>
                        {cover
                          ? <img src={cover} alt="" style={{ width: 30, height: 43, objectFit: "cover", borderRadius: 3 }} />
                          : "—"}
                      </Td>
                      <Td><span style={{ fontWeight: 600 }}>{item.title}</span></Td>
                      <Td>{creators.join(", ") || "—"}</Td>
                      <Td>{release}</Td>
                      <Td>{genres.slice(0, 2).join(", ") || "—"}</Td>
                      <Td>
                        <button onClick={() => removeBook(item)} disabled={removingId === item.id}
                          style={{ padding: "4px 10px", background: "#fff", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 6, fontSize: 12, cursor: removingId === item.id ? "default" : "pointer", fontWeight: 600 }}>
                          {removingId === item.id ? "…" : "Remove"}
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, align = "left" }) {
  return <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: align, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</th>;
}
function Td({ children, align = "left", title }) {
  return <td title={title} style={{ padding: "10px 14px", textAlign: align, color: "#0f172a" }}>{children}</td>;
}

function Empty({ title, body }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...card, maxWidth: 420, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{title}</div>
        <div style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>{body}</div>
        <Link to="/books" style={{ color: "#6366f1", fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← back to app</Link>
      </div>
    </div>
  );
}
