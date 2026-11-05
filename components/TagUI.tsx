"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf, pathNames, type Tag, type TagIndex } from "@/lib/tags";

export function TagChip({ idx, id, onRemove }: { idx: TagIndex; id: string; onRemove?: () => void }) {
  const names = pathNames(idx, id);
  if (!names.length) return null;
  return (
    <span className="tchip" style={{ ["--c" as string]: colorOf(idx, id) }} title={names.join(" › ")}>
      {names.length > 1 && <span className="tpath">{names.slice(0, -1).join(" › ")} ›</span>}
      <b>{names[names.length - 1]}</b>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${names.join(" ")}`}>×</button>}
    </span>
  );
}

export function TagPicker({ idx, tags, exclude, onPick, onCreate, onClose }: {
  idx: TagIndex; tags: Tag[]; exclude: string[]; onPick: (id: string) => void; onCreate: (path: string[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const all = useMemo(() => tags.map((t) => ({ id: t.id, path: pathNames(idx, t.id) })).filter((x) => !exclude.includes(x.id)), [tags, idx, exclude]);
  const query = q.trim().toLowerCase();
  const hits = all.filter((x) => !query || x.path.join(" › ").toLowerCase().includes(query.replace(/\s*[>/]\s*/g, " › "))).sort((a, b) => a.path.length - b.path.length || a.path.join().localeCompare(b.path.join())).slice(0, 6);
  const typedPath = q.split(/[>›/]/).map((s) => s.trim()).filter(Boolean);
  const exact = all.some((x) => x.path.join(" › ").toLowerCase() === typedPath.join(" › ").toLowerCase());
  return (
    <div className="picker" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag, or type Work > Reviews to make one"
        aria-label="Find or create a tag" maxLength={80}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (hits[0] && (exact || !typedPath.length || hits[0].path.join(" › ").toLowerCase() === typedPath.join(" › ").toLowerCase())) onPick(hits[0].id);
          else if (typedPath.length) onCreate(typedPath);
          else if (hits[0]) onPick(hits[0].id);
        }}
      />
      <div className="plist">
        {hits.map((h) => (
          <button type="button" key={h.id} onClick={() => onPick(h.id)}>
            <i style={{ background: colorOf(idx, h.id) }} />{h.path.join(" › ")}
          </button>
        ))}
        {typedPath.length > 0 && !exact && (
          <button type="button" className="create" onClick={() => onCreate(typedPath)}>+ Create “{typedPath.join(" › ")}”</button>
        )}
        {!hits.length && !typedPath.length && <span className="mute">No tags yet. They appear as you log.</span>}
      </div>
    </div>
  );
}
