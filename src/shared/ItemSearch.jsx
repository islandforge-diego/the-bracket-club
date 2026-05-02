import { useState, useEffect, useRef, useCallback } from "react";
import Cover from "./Cover.jsx";

export default function ItemSearch({ onSelect, onManual, placeholder = "Search...", searchFn }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const items = await searchFn(q);
      setResults(items);
      setOpen(true);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [searchFn]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.trim()) {
      timerRef.current = setTimeout(() => doSearch(q), 420);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  const pick = (item) => {
    onSelect(item);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const showDropdown = open && (results.length > 0 || (query.trim() && !loading));

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        border:"1.5px solid #e7e5e4", borderRadius:12,
        padding:"9px 12px", background:"#fff",
      }}>
        <span style={{ fontSize:16, flexShrink:0 }}>{loading ? "⏳" : "🔍"}</span>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          style={{ border:"none", outline:"none", flex:1, fontSize:13, background:"transparent", color:"#1c1917" }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            style={{ background:"none", border:"none", color:"#a8a29e", fontSize:14, cursor:"pointer", padding:0, flexShrink:0 }}
          >✕</button>
        )}
      </div>

      {showDropdown && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
          background:"#fff", borderRadius:14, boxShadow:"0 8px 30px #0003",
          zIndex:100, overflow:"hidden", border:"1px solid #e7e5e4",
        }}>
          {results.length > 0 ? (
            results.map((item, i) => (
              <button
                key={i}
                onClick={() => pick(item)}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:10,
                  padding:"10px 12px", border:"none",
                  borderBottom: i < results.length - 1 ? "1px solid #f5f5f4" : "none",
                  background:"none", cursor:"pointer", textAlign:"left",
                }}
              >
                <Cover book={item} size="xs" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize:11, color:"#78716c", marginTop:1 }}>
                    {item.author || "Unknown"}
                  </div>
                </div>
                <span style={{ color:"#d6d3d1", fontSize:16, flexShrink:0 }}>+</span>
              </button>
            ))
          ) : (
            <div style={{ padding:"14px 12px", fontSize:13, color:"#a8a29e", textAlign:"center" }}>
              No results found
            </div>
          )}
          <button
            onClick={() => { setOpen(false); onManual(); }}
            style={{
              width:"100%", padding:"10px 12px", border:"none",
              borderTop:"1px solid #f5f5f4", background:"#fafaf9",
              color:"#78716c", fontSize:12, cursor:"pointer", textAlign:"left",
            }}
          >
            ✏️ Add manually instead
          </button>
        </div>
      )}
    </div>
  );
}
