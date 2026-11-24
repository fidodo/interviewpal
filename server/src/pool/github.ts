// Read-only GitHub access for the question pool's update. No key is needed (60 requests an hour); GITHUB_TOKEN, if
// set, raises that to 5,000. Every call has a timeout, so a slow GitHub never holds up an update step.
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const TIMEOUT_MS = 10_000;

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    "User-Agent": "interview-practice-question-pool",
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url.replace(API, "")}`);
  return (await res.json()) as T;
}

// The newest commit that touched this folder.
export async function latestCommit(repo: string, folder: string): Promise<string> {
  const commits = await getJson<{ sha: string }[]>(`${API}/repos/${repo}/commits?path=${encodeURIComponent(folder)}&per_page=1`);
  if (!commits[0]?.sha) throw new Error(`No commits found for ${repo}/${folder}`);
  return commits[0].sha;
}

// The repo's licence at that commit, as an SPDX id ("MIT"), or null if GitHub can't tell.
export async function licenceAt(repo: string, ref: string): Promise<string | null> {
  const body = await getJson<{ license?: { spdx_id?: string } }>(`${API}/repos/${repo}/license?ref=${ref}`);
  const spdx = body.license?.spdx_id;
  return spdx && spdx !== "NOASSERTION" ? spdx : null;
}

export async function markdownFilesIn(repo: string, ref: string, folder: string): Promise<string[]> {
  const tree = await getJson<{ tree: { path: string; type: string }[] }>(`${API}/repos/${repo}/git/trees/${ref}?recursive=1`);
  return tree.tree.filter((t) => t.type === "blob" && t.path.startsWith(folder) && /\.mdx?$/.test(t.path)).map((t) => t.path);
}

export async function rawFile(repo: string, ref: string, path: string): Promise<string> {
  const res = await fetch(`${RAW}/${repo}/${ref}/${path}`, { headers: { "User-Agent": headers()["User-Agent"] }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.text();
}

export function fileUrl(repo: string, ref: string, path: string) {
  return `https://github.com/${repo}/blob/${ref}/${path}`;
}
