import { useEffect, useRef, useState } from "react";

/**
 * Sources:
 *  - "url"     : paste any image URL
 *  - "upload"  : drag/drop or pick a local file (becomes a data URL)
 *  - "icons"   : search Simple Icons (https://simpleicons.org) by brand slug
 *  - "company" : search Clearbit's autocomplete API for company logos by name/domain
 */
const TABS = [
  { id: "url",     label: "URL"      },
  { id: "upload",  label: "Upload"   },
  { id: "icons",   label: "Icons"    },
  { id: "company", label: "Company"  },
];

const ICONS_DATA_URL =
  "https://cdn.jsdelivr.net/npm/simple-icons@latest/_data/simple-icons.json";

let iconsCache = null;
async function loadIcons() {
  if (iconsCache) return iconsCache;
  const res = await fetch(ICONS_DATA_URL);
  const json = await res.json();
  // Newer simple-icons publish format omits an explicit slug for many entries
  // and derives it from `title`. Replicate that fallback so search works.
  iconsCache = (json.icons || []).map(i => ({
    title: i.title,
    slug: i.slug || titleToSlug(i.title),
  }));
  return iconsCache;
}

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/\./g, "dot")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export default function AddLogoPanel({ onAddImage }) {
  const [tab, setTab] = useState("url");
  return (
    <div style={{
      width: 280, background: "#0f172a", color: "#e2e8f0",
      borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "10px 4px", fontSize: 12, fontWeight: 600,
              background: tab === t.id ? "#1e293b" : "transparent",
              color: tab === t.id ? "#fff" : "#94a3b8",
              border: "none", cursor: "pointer",
            }}
          >{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {tab === "url"     && <UrlTab     onAdd={onAddImage} />}
        {tab === "upload"  && <UploadTab  onAdd={onAddImage} />}
        {tab === "icons"   && <IconsTab   onAdd={onAddImage} />}
        {tab === "company" && <CompanyTab onAdd={onAddImage} />}
      </div>
    </div>
  );
}

function UrlTab({ onAdd }) {
  const [url, setUrl] = useState("");
  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUrl("");
  };
  return (
    <div>
      <Label>Image URL (PNG, SVG, JPG…)</Label>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="https://example.com/logo.png"
        style={inputStyle}
      />
      <button onClick={submit} style={primaryBtn}>Add to board</button>
    </div>
  );
}

function UploadTab({ onAdd }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (files) => {
    Array.from(files || []).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => onAdd(reader.result);
      reader.readAsDataURL(file);
    });
  };

  return (
    <div>
      <Label>Upload from computer</Label>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? "#6366f1" : "#334155"}`,
          borderRadius: 8, padding: 24, textAlign: "center",
          cursor: "pointer", color: "#94a3b8", fontSize: 13,
          background: drag ? "rgba(99,102,241,0.08)" : "transparent",
        }}
      >
        Drop images here<br />or click to browse
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}

function IconsTab({ onAdd }) {
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadIcons()
      .then(list => { setIcons(list); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const matches = query.trim().length < 2
    ? []
    : icons
        .filter(i => i.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 60);

  return (
    <div>
      <Label>Search Simple Icons (~3000 brand SVGs)</Label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. github, react, spotify"
        style={inputStyle}
        disabled={loading}
      />
      {loading && <Hint>Loading icon catalog…</Hint>}
      {error && <Hint style={{ color: "#f87171" }}>Failed: {error}</Hint>}
      {!loading && query.trim().length >= 2 && matches.length === 0 && (
        <Hint>No matches for "{query}".</Hint>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 6, marginTop: 8,
      }}>
        {matches.map(icon => (
          <button
            key={icon.slug}
            title={icon.title}
            onClick={() => onAdd(`https://cdn.simpleicons.org/${icon.slug}`)}
            style={{
              aspectRatio: "1 / 1", background: "#1e293b",
              border: "1px solid #334155", borderRadius: 6,
              padding: 6, cursor: "pointer",
            }}
          >
            <img
              src={`https://cdn.simpleicons.org/${icon.slug}/white`}
              alt={icon.title}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CompanyTab({ onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  // Debounced fetch against Clearbit's free autocomplete endpoint.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`
        );
        const json = await res.json();
        setResults(Array.isArray(json) ? json : []);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div>
      <Label>Search company logos (Clearbit)</Label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="e.g. apple, stripe, vercel"
        style={inputStyle}
      />
      {busy && <Hint>Searching…</Hint>}
      {!busy && query.trim().length >= 2 && results.length === 0 && (
        <Hint>No matches.</Hint>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {results.map(r => (
          <button
            key={r.domain}
            onClick={() => onAdd(r.logo)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: 6, background: "#1e293b", border: "1px solid #334155",
              borderRadius: 6, cursor: "pointer", color: "#e2e8f0", textAlign: "left",
            }}
          >
            <img
              src={r.logo}
              alt=""
              style={{ width: 28, height: 28, objectFit: "contain", background: "#fff", borderRadius: 4 }}
            />
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {r.name}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.domain}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", marginBottom: 8, boxSizing: "border-box",
  background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
  color: "#e2e8f0", fontSize: 13, outline: "none",
};

const primaryBtn = {
  width: "100%", padding: "8px 10px",
  background: "#6366f1", color: "#fff", border: "none", borderRadius: 6,
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function Label({ children }) {
  return <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{children}</div>;
}
function Hint({ children, style }) {
  return <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, ...style }}>{children}</div>;
}
