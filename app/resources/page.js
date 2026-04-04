import Link from "next/link";
import { getResources } from "../../lib/data";

export const metadata = {
  title: "Resources"
};

export default function ResourcesPage() {
  const resources = getResources();

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">GitHub Resources</p>
        <h1>Theo doi release va source theo giao dien</h1>
        <p className="hero-copy">
          Trang nay parse truc tiep GitHub API de hien thi release va cay file theo kieu browse repo,
          giup user xem nhanh ma khong can tu tim endpoint.
        </p>
      </section>

      <section className="stack gap-md reveal delay-1">
        <div className="card-grid">
          {resources.map((resource) => (
            <article key={resource.id} className="file-card">
              <div className="file-card-head">
                <h3>{resource.name}</h3>
                <span className="badge">GitHub</span>
              </div>

              <p>{resource.description || "Khong co mo ta"}</p>
              <p>
                <strong>Repo:</strong> {resource.owner}/{resource.repo}
              </p>

              <div className="file-card-actions">
                <Link href={`/resources/${resource.id}`} className="button button-main">
                  Mo GUI
                </Link>
                <a href={resource.repoUrl} target="_blank" rel="noreferrer" className="button button-ghost">
                  Mo tren GitHub
                </a>
              </div>
            </article>
          ))}

          {!resources.length ? (
            <article className="file-card">
              <h3>Chua co resource</h3>
              <p>Bo sung du lieu tai data/resources.json.</p>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
