import Link from "next/link";

export const CONTACT = "banerjeec713@gmail.com";
export const UPDATED = "6 November 2026";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="app legal">
      <header className="top">
        <div className="brand"><Link className="btn pill" href="/">← Hour by Hour</Link></div>
      </header>
      <article className="card">
        <span className="eyebrow">Last updated {UPDATED}</span>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}
