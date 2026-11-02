import { PresetDeck, t } from "./types";

export const fullstack: PresetDeck = {
  deck: "Full-stack",
  slug: "fullstack",
  terms: [
    t(
      "Authentication vs authorization",
      "Authentication checks who you are; authorization checks what you're allowed to do.",
      "Authentication happens at login, with passwords, OAuth or passkeys. Authorization runs on every request and checks the user's permissions for the resource. Many security bugs are authorization bugs, like missing ownership checks.",
      "The user was authenticated, but we had an authorization bug: any logged-in user could read another user's session by changing the id in the URL.",
      ["Authentication: identity", "Authorization: permissions", "Authorization checks belong on every request"],
      null,
      "A user can see another user's data by changing an id in the URL. What went wrong?"
    ),
    t(
      "JWT (JSON Web Token)",
      "A signed token carrying claims, such as a user id, that a server can verify without a database lookup.",
      "A JWT has a header, payload and signature. Servers verify the signature to trust the claims. The catch is revocation: a valid token works until it expires unless you add a version or denylist check.",
      "Our JWTs carry a token version, so 'log out everywhere' bumps the version and every old token stops working.",
      ["Signed, self-contained claims", "Verified without a session lookup", "Hard to revoke without extra checks"],
      "Session cookie: an opaque id looked up on the server; a JWT can travel inside a cookie too.",
      "How would you implement 'log out of all devices' with token-based auth?"
    ),
    t(
      "OAuth",
      "A standard for letting an app access a user's account on another service without seeing their password.",
      "The user approves access on the provider's site, and the app gets a token with limited scopes. OpenID Connect builds on OAuth to also tell the app who the user is, which is what 'Sign in with Google' uses.",
      "We use Google sign-in, which is OpenID Connect on top of OAuth, and verify the ID token on the server before creating a session.",
      ["Delegated access without sharing passwords", "Tokens with limited scopes", "OpenID Connect adds identity on top"],
      null,
      "How does 'Sign in with Google' work, end to end?"
    ),
    t(
      "CSRF (cross-site request forgery)",
      "An attack that tricks a logged-in user's browser into sending an unwanted request to a site that trusts their cookies.",
      "Because browsers send cookies automatically, another site can trigger requests on the user's behalf. Defences are SameSite cookies, CSRF tokens and checking the Origin header.",
      "Our auth cookie is SameSite=Lax and state-changing requests require JSON, which blocks the usual CSRF form-post attack.",
      ["Abuses automatically sent cookies", "Triggers actions the user didn't intend", "Prevented with SameSite, tokens, origin checks"],
      "CORS: a browser read policy, not a CSRF defence on its own.",
      "Your app uses cookie-based auth. What attacks do you need to think about?"
    ),
    t(
      "XSS (cross-site scripting)",
      "An attack where malicious script gets injected into a page and runs in other users' browsers.",
      "It happens when user-controlled content is rendered as HTML or script without escaping. React escapes text by default, so risks come from dangerouslySetInnerHTML, URLs and third-party content. CSP limits the damage.",
      "We render AI-generated lesson text as plain React text, never as HTML, so a malicious script in it can't run.",
      ["Injected script runs in victims' browsers", "Caused by rendering untrusted input as HTML", "Escape output; use CSP"],
      null,
      "Users can write comments that include links and formatting. How do you keep that safe?"
    ),
    t(
      "REST",
      "An API style that models resources as URLs and uses HTTP methods like GET, POST and DELETE on them.",
      "REST APIs are stateless, use standard status codes and are easy to cache. Good REST design means clear resource names, consistent errors and sensible pagination.",
      "Our REST API returns 404 for another user's resource rather than 403, so it doesn't reveal that the resource exists.",
      ["Resources as URLs", "HTTP methods and status codes", "Stateless and cacheable"],
      "GraphQL: one endpoint where clients ask for exactly the fields they need.",
      "How would you design the API for a simple notes app?"
    ),
    t(
      "GraphQL",
      "A query language for APIs where clients request exactly the fields they need from a single endpoint.",
      "GraphQL avoids over-fetching and multiple round trips, and has a typed schema. The costs are caching complexity, N+1 resolver queries and the risk of expensive queries, which need depth or cost limits.",
      "The mobile app needed a different shape of data per screen, so GraphQL let each screen fetch exactly its fields in one request.",
      ["Clients choose fields", "Single endpoint with a typed schema", "Watch for N+1 resolvers and query cost"],
      "REST: fixed resources per URL.",
      "When would you choose GraphQL over a REST API?"
    ),
    t(
      "Pagination",
      "Returning large result sets in pages instead of all at once.",
      "Offset pagination (page 3, 20 per page) is simple but slow and inconsistent on large, changing tables. Cursor pagination returns a pointer to the last item and stays fast and stable.",
      "We switched the activity feed to cursor pagination because offset pagination skipped items when new ones arrived.",
      ["Returns data in pages", "Offset: simple but slow and unstable at scale", "Cursor: fast and stable"],
      null,
      "How would you design an endpoint that returns a user's full activity history?"
    ),
    t(
      "CI/CD",
      "Automatically testing every change (continuous integration) and automatically shipping it (continuous delivery or deployment).",
      "CI runs builds and tests on each push so problems surface early. CD packages and deploys passing changes, often with preview environments, staged rollouts and quick rollback.",
      "Every pull request runs type checks and tests in CI, and merges to main deploy automatically with a preview first.",
      ["CI: build and test every change", "CD: automate release and deploy", "Fast feedback, safe, frequent releases"],
      null,
      "How would you set up a team so they can ship to production several times a day safely?"
    ),
    t(
      "Feature flag",
      "A switch in code that turns a feature on or off without deploying, often for a subset of users.",
      "Flags allow gradual rollouts, A/B tests, and quick kill switches. They add complexity, so old flags should be removed once a feature is fully rolled out.",
      "We rolled the new checkout out behind a feature flag to 5% of users first, and could turn it off instantly if errors rose.",
      ["Toggle behaviour without a deploy", "Gradual rollouts and kill switches", "Remove flags after full rollout"],
      null,
      "How would you release a risky change to a critical flow?"
    ),
    t(
      "Monolith vs microservices",
      "A monolith is one deployable application; microservices split it into independently deployed services.",
      "Monoliths are simpler to build, test and deploy. Microservices let teams scale and deploy independently but add network calls, distributed failures and operational overhead. Many teams start with a well-structured monolith.",
      "We kept a modular monolith because one team owns it; splitting into microservices would add network failures without a real benefit yet.",
      ["Monolith: one deployable unit", "Microservices: independent services", "Trade simplicity for independent scaling and deploys"],
      null,
      "Would you split your application into microservices? How would you decide?"
    ),
    t(
      "Serverless",
      "Running code as functions managed by a cloud provider, which scales them automatically and bills per use.",
      "You don't manage servers; instances start on demand. Trade-offs include cold starts, execution time limits, no shared memory between instances, and care with database connections.",
      "On serverless, in-memory rate limiting didn't work because each instance had its own memory, so we stored the counters in the database.",
      ["Provider runs and scales your functions", "Pay per use, no servers to manage", "Cold starts, time limits, no shared memory"],
      null,
      "What changes when you move an Express API to a serverless platform?"
    ),
    t(
      "Optimistic UI",
      "Updating the interface immediately as if an action succeeded, then reconciling when the server responds.",
      "It makes apps feel instant. If the request fails, you roll back the change and tell the user. It suits actions that almost always succeed, like likes or reordering.",
      "Liking a post updates the count instantly with an optimistic UI, and we roll it back with a message if the request fails.",
      ["Show success before the server confirms", "Roll back on failure", "Best for actions that rarely fail"],
      null,
      "How would you make a slow 'like' button feel instant?"
    ),
    t(
      "Schema migration",
      "A versioned, repeatable change to a database's structure, applied in order across environments.",
      "Migrations live in source control and run in development, staging and production the same way. Safe migrations are backward compatible: add a column first, deploy code that uses it, then remove old columns later.",
      "We split the rename into two migrations, adding the new column and backfilling it first, so old and new code could run during the deploy.",
      ["Versioned changes to the schema", "Same steps in every environment", "Backward-compatible steps avoid downtime"],
      null,
      "How would you rename a column in a busy production table without downtime?"
    ),
    t(
      "Environment variables",
      "Configuration values, like API keys and database URLs, supplied to the app from outside the code.",
      "They keep secrets out of source control and let the same build run in different environments. Secrets should never be committed or shipped in client bundles; only intentionally public values belong in the frontend.",
      "The database URL and API keys are environment variables set in the hosting platform, and the local .env file is ignored by git and by the deploy.",
      ["Config supplied outside the code", "Keeps secrets out of the repo", "Never expose secrets to the client bundle"],
      null,
      "Where should your app's API keys live, and how do they reach production?"
    ),
    t(
      "WebSocket",
      "A persistent, two-way connection between browser and server for real-time messages.",
      "After an HTTP upgrade, either side can send messages at any time. It suits chat, live dashboards and collaboration. Alternatives are server-sent events (server to client only) and polling.",
      "Live cursors in the editor use WebSockets, while the notifications badge just uses server-sent events because it only flows one way.",
      ["Persistent, bidirectional connection", "Real-time messages either way", "Alternatives: SSE, polling"],
      "Server-sent events: one-way, server to client, over plain HTTP.",
      "How would you show live updates to all users viewing the same dashboard?"
    ),
    t(
      "CDN (content delivery network)",
      "A network of servers around the world that caches and serves content close to users.",
      "CDNs reduce latency and load on your origin by serving static assets, and sometimes whole pages or API responses, from edge locations. Cache headers control what's cached and for how long.",
      "Our JavaScript bundles have content-hashed names, so the CDN can cache them for a year and a new deploy just uses new file names.",
      ["Edge servers near users", "Caches static assets and more", "Controlled by cache headers"],
      null,
      "Users far from your data centre complain the site is slow. What would you do?"
    ),
  ],
};
