import Link from "next/link";
import { notFound } from "next/navigation";
import { getResources } from "../../../lib/data";
import {
  getRepoContents,
  getRepoInfo,
  getRepoReleases,
  normalizeResourcePath,
  splitPath
} from "../../../lib/github";

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function buildResourcePathHref(resourceId, pathValue) {
  const path = normalizeResourcePath(pathValue);
  if (!path) {
    return `/resources/${resourceId}`;
  }
  return `/resources/${resourceId}?path=${encodeURIComponent(path)}`;
}

export function generateStaticParams() {
  return getResources().map((resource) => ({ id: resource.id }));
}

export function generateMetadata({ params }) {
  const resource = getResources().find((item) => item.id === params.id);

  if (!resource) {
    return {
      title: "Resource khong ton tai"
    };
  }

  return {
    title: `Resource - ${resource.name}`
  };
}

export default async function ResourceDetailPage({ params, searchParams }) {
  const resource = getResources().find((item) => item.id === params.id);
  if (!resource) {
    notFound();
  }

  const activePath = normalizeResourcePath(
    typeof searchParams?.path === "string" ? searchParams.path : ""
  );

  const [repoInfoRes, releasesRes, contentsRes] = await Promise.all([
    getRepoInfo(resource),
    getRepoReleases(resource, 12),
    getRepoContents(resource, activePath)
  ]);

  const repoInfo = repoInfoRes.ok ? repoInfoRes.data : null;
  const releases = releasesRes.ok && Array.isArray(releasesRes.data) ? releasesRes.data : [];
  const contentData = contentsRes.ok ? contentsRes.data : null;
  const contentEntries = contentData?.entries || [];

  const segments = splitPath(activePath);
  const breadcrumbs = [{ label: `${resource.owner}/${resource.repo}`, path: "" }];
  let walkingPath = "";
  for (const segment of segments) {
    walkingPath = walkingPath ? `${walkingPath}/${segment}` : segment;
    breadcrumbs.push({ label: segment, path: walkingPath });
  }

  const parentPath = segments.length > 1 ? segments.slice(0, -1).join("/") : "";

  return (
    <div className="stack gap-lg">
      <section className="reveal">
        <p className="eyebrow">Resource Browser</p>
        <h1>{resource.name}</h1>
        <p className="hero-copy">{resource.description || "Khong co mo ta"}</p>

        <div className="hero-actions">
          <a href={resource.repoUrl} target="_blank" rel="noreferrer" className="button button-main">
            Mo tren GitHub
          </a>
          <a href={resource.api.releases} target="_blank" rel="noreferrer" className="button button-ghost">
            API Releases
          </a>
          <a href={resource.api.contents} target="_blank" rel="noreferrer" className="button button-ghost">
            API Contents
          </a>
          <Link href="/resources" className="button button-ghost">
            Tat ca resource
          </Link>
        </div>
      </section>

      <section className="stack gap-md reveal delay-1">
        <div className="section-head">
          <h2>Thong tin repo</h2>
        </div>

        {repoInfo ? (
          <div className="repo-grid">
            <article className="repo-stat">
              <span>Branch mac dinh</span>
              <strong>{repoInfo.default_branch || "-"}</strong>
            </article>
            <article className="repo-stat">
              <span>Stars</span>
              <strong>{formatNumber(repoInfo.stargazers_count)}</strong>
            </article>
            <article className="repo-stat">
              <span>Forks</span>
              <strong>{formatNumber(repoInfo.forks_count)}</strong>
            </article>
            <article className="repo-stat">
              <span>Open issues</span>
              <strong>{formatNumber(repoInfo.open_issues_count)}</strong>
            </article>
            <article className="repo-stat">
              <span>Last push</span>
              <strong>{formatDate(repoInfo.pushed_at)}</strong>
            </article>
            <article className="repo-stat">
              <span>Watchers</span>
              <strong>{formatNumber(repoInfo.watchers_count)}</strong>
            </article>
          </div>
        ) : (
          <div className="api-state api-error">Khong lay duoc thong tin repo: {repoInfoRes.error}</div>
        )}
      </section>

      <section className="stack gap-md reveal delay-1">
        <div className="section-head">
          <h2>Releases</h2>
        </div>

        {releasesRes.ok ? (
          <div className="release-grid">
            {releases.map((release) => (
              <article key={release.id} className="release-card">
                <div className="release-head">
                  <h3>{release.name || release.tag_name}</h3>
                  <span className="badge">{release.tag_name}</span>
                </div>
                <p>
                  <strong>Published:</strong> {formatDate(release.published_at)}
                </p>
                <p>
                  <strong>Assets:</strong> {formatNumber(release.assets?.length || 0)}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {release.draft ? "Draft" : release.prerelease ? "Pre-release" : "Stable"}
                </p>
                <div className="file-card-actions">
                  <a href={release.html_url} target="_blank" rel="noreferrer">
                    Mo release
                  </a>
                </div>
              </article>
            ))}

            {!releases.length ? (
              <article className="release-card">
                <h3>Chua co release</h3>
                <p>Repo nay hien tai chua dang release.</p>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="api-state api-error">Khong lay duoc releases: {releasesRes.error}</div>
        )}
      </section>

      <section className="stack gap-md reveal delay-2">
        <div className="section-head">
          <h2>Source browser</h2>
        </div>

        <div className="browser-card">
          <div className="breadcrumb-row">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path || "root"}>
                {index > 0 ? <span className="breadcrumb-sep"> / </span> : null}
                <Link href={buildResourcePathHref(resource.id, crumb.path)}>{crumb.label}</Link>
              </span>
            ))}
          </div>

          {contentsRes.ok ? (
            <div className="table-shell">
              <table className="matrix-table repo-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {activePath ? (
                    <tr>
                      <td data-label="Name">
                        <Link href={buildResourcePathHref(resource.id, parentPath)}>..</Link>
                      </td>
                      <td data-label="Type">dir</td>
                      <td data-label="Size">-</td>
                      <td data-label="Open">Up one level</td>
                    </tr>
                  ) : null}

                  {contentEntries.map((entry) => (
                    <tr key={entry.path}>
                      <td data-label="Name">
                        {entry.type === "dir" ? (
                          <Link href={buildResourcePathHref(resource.id, entry.path)}>{entry.name}</Link>
                        ) : (
                          <a href={entry.htmlUrl} target="_blank" rel="noreferrer">
                            {entry.name}
                          </a>
                        )}
                      </td>
                      <td data-label="Type">{entry.type}</td>
                      <td data-label="Size">{formatBytes(entry.size)}</td>
                      <td data-label="Open">
                        {entry.type === "dir" ? (
                          <Link href={buildResourcePathHref(resource.id, entry.path)}>Browse</Link>
                        ) : (
                          <>
                            <a href={entry.htmlUrl} target="_blank" rel="noreferrer">
                              Source
                            </a>
                            {entry.downloadUrl ? (
                              <>
                                {" | "}
                                <a href={entry.downloadUrl} target="_blank" rel="noreferrer">
                                  Download
                                </a>
                              </>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="api-state api-error">Khong lay duoc file tree: {contentsRes.error}</div>
          )}
        </div>
      </section>
    </div>
  );
}
