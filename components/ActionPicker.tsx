"use client";
import { useEffect, useRef, useState } from "react";
import type { Reminder } from "@/lib/reminders";

/** Pick an open action to link a pointer to, or create one on the spot. */
export default function ActionPicker({ actions, exclude, onPick, onCreate, onClose }: {
  actions: Reminder[]; exclude: string[]; onPick: (id: string) => void; onCreate: (title: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const open = actions.filter((a) => !a.done && !exclude.includes(a.id));
  const query = q.trim().toLowerCase();
  const hits = open.filter((a) => !query || a.title.toLowerCase().includes(query)).slice(0, 6);
  const exact = open.some((a) => a.title.toLowerCase() === query);
  return (
    <div className="picker" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which action was this for? Or type a new one" maxLength={200} aria-label="Find or create an action"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (hits[0] && (exact || !query || hits[0].title.toLowerCase() === query)) onPick(hits[0].id);
          else if (query) onCreate(q.trim());
          else if (hits[0]) onPick(hits[0].id);
        }}
      />
      <div className="plist">
        {hits.map((a) => <button type="button" key={a.id} onClick={() => onPick(a.id)}><i style={{ background: "var(--ink)" }} />{a.title}</button>)}
        {query && !exact && <button type="button" className="create" onClick={() => onCreate(q.trim())}>+ New action “{q.trim()}”</button>}
        {!hits.length && !query && <span className="mute">No open actions. Type one to create it.</span>}
      </div>
    </div>
  );
}
