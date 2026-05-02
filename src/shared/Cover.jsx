import { useState } from "react";
import { COLORS } from "./constants.js";

const COVER_SIZES = { xs:[28,40], sm:[40,56], md:[56,80], lg:[96,128], xl:[128,176] };

export default function Cover({ book, size = "md" }) {
  const [w, h] = COVER_SIZES[size];
  const [err, setErr] = useState(false);
  const color = COLORS[(book?.title?.charCodeAt(0) || 0) % COLORS.length];
  const base = { width:w, height:h, borderRadius:6, flexShrink:0, boxShadow:"0 1px 4px #0002" };

  if (book?.cover && !err) {
    return (
      <img
        src={book.cover}
        alt={book.title}
        style={{ ...base, objectFit:"cover" }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div style={{
      ...base,
      background: `linear-gradient(160deg, ${color}bb, ${color})`,
      display:"flex", alignItems:"flex-end", justifyContent:"center",
      paddingBottom:4, paddingLeft:3, paddingRight:3,
    }}>
      <span style={{
        color:"#fff", textAlign:"center", fontWeight:700,
        lineHeight:1.2, fontSize: h > 80 ? 9 : 7, wordBreak:"break-word",
      }}>
        {book?.title?.slice(0, 22) || "?"}
      </span>
    </div>
  );
}
