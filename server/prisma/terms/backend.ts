import { PresetDeck, t } from "./types";

export const backend: PresetDeck = {
  deck: "Backend",
  slug: "backend",
  terms: [
    t(
      "Idempotency",
      "An operation is idempotent if doing it once or many times has the same effect.",
      "Networks retry, users double-click, and queues redeliver, so APIs that change state should be safe to repeat. PUT and DELETE are idempotent by design; POST often needs an idempotency key so the server can recognise a repeat.",
      "Our payment endpoint takes an idempotency key, so if the client retries after a timeout the customer is still only charged once.",
      ["Repeating it has the same effect as doing it once", "Protects against retries and double submits", "Often implemented with idempotency keys"],
      "Safe (HTTP): a method that doesn't change state at all, like GET.",
      "A client retries a payment request after a timeout. How do you make sure the customer isn't charged twice?"
    ),
    t(
      "Latency",
      "How long a single request takes from start to finish.",
      "Latency is measured per request, and averages hide slow outliers, so teams track percentiles like p95 and p99. It's affected by network distance, queueing, database calls and work done per request.",
      "Our median latency was fine, but p99 latency was four seconds because of one unindexed query on large accounts.",
      ["Time for one request", "Tracked as percentiles (p95, p99)", "Driven by network, queueing and work per request"],
      "Throughput: how many requests you handle per second.",
      "Users say the app feels slow even though the dashboard average looks fine. How would you investigate?"
    ),
    t(
      "Throughput",
      "How much work a system completes per unit of time, such as requests per second.",
      "Throughput is about capacity. You can raise it by adding instances, batching or doing work asynchronously, sometimes at the cost of latency for individual requests.",
      "Batching database writes raised our throughput from 2,000 to 15,000 events per second, though each event now waits up to 100 milliseconds.",
      ["Work done per unit of time", "About capacity, not speed of one request", "Raised by scaling out, batching, async work"],
      "Latency: the time one request takes.",
      "Your ingestion service can't keep up with incoming events. What are your options?"
    ),
    t(
      "Database index",
      "A data structure that lets the database find rows without scanning the whole table.",
      "An index (often a B-tree) on columns used in WHERE, JOIN or ORDER BY clauses makes lookups fast, at the cost of extra storage and slower writes. Column order matters in composite indexes.",
      "The query filtered by user_id and sorted by created_at, so we added a composite index on (user_id, created_at) and it went from 2 seconds to 5 milliseconds.",
      ["Avoids full table scans", "Speeds reads, slows writes slightly", "Column order matters in composite indexes"],
      null,
      "A query that used to be fast is now slow as the table has grown. What would you check?"
    ),
    t(
      "N+1 query problem",
      "Running one query to get a list, then one more query for each item in it.",
      "It usually comes from ORMs lazily loading relations in a loop. It looks fine with test data and collapses in production. The fix is to fetch related data in one query with a join or an IN clause, or to batch loads.",
      "The orders page made one query per order to fetch the customer, which was an N+1 problem, so we loaded all customers with a single IN query.",
      ["One query for the list plus one per item", "Common with ORM lazy loading", "Fix with joins, IN queries or batching"],
      null,
      "A page that lists 50 items makes 51 database queries. What's going on and how do you fix it?"
    ),
    t(
      "Caching",
      "Keeping a copy of data somewhere faster so repeated requests don't redo expensive work.",
      "Caches live in the browser, a CDN, in memory or in Redis. The hard part is invalidation: deciding when cached data is stale, using TTLs, explicit invalidation on writes, or versioned keys.",
      "We cache product prices in Redis with a five-minute TTL and invalidate the key whenever a price changes.",
      ["Stores results for faster reuse", "Can sit in browser, CDN, memory or Redis", "Invalidation and TTLs are the hard part"],
      null,
      "Your product page hits the database on every request and is slow under load. What would you do?"
    ),
    t(
      "Cache invalidation",
      "Removing or updating cached data when the underlying data changes, so users don't see stale values.",
      "Strategies include time-based expiry (TTL), deleting keys on write, write-through caches, and versioned keys. Getting it wrong shows users stale data; being too aggressive removes the benefit of caching.",
      "We delete the cache key in the same code path that updates the price, and keep a short TTL as a safety net in case a delete is missed.",
      ["Keeps cached data consistent with the source", "TTL, delete-on-write, write-through, versioned keys", "Trade-off between staleness and hit rate"],
      null,
      "Users sometimes see an old profile picture after updating it. What's likely happening?"
    ),
    t(
      "Horizontal scaling",
      "Handling more load by adding more machines rather than making one machine bigger.",
      "Scaling out needs stateless services (state kept in a database or cache), a load balancer, and care with anything shared like sessions or scheduled jobs. It's more resilient than scaling up but adds coordination.",
      "We moved sessions into Redis so the API was stateless, which let us scale horizontally behind the load balancer.",
      ["Add more instances", "Needs stateless services and a load balancer", "More resilient than scaling up"],
      "Vertical scaling: a bigger machine; simpler but with a ceiling and a single point of failure.",
      "Traffic is expected to grow ten times next quarter. How would you prepare the API?"
    ),
    t(
      "Load balancer",
      "A component that spreads incoming requests across several servers.",
      "It improves capacity and availability: unhealthy instances are removed using health checks. It can balance at layer 4 (TCP) or layer 7 (HTTP), with strategies like round robin or least connections.",
      "The load balancer health-checks each instance every ten seconds, so a crashed instance stops receiving traffic within a few seconds.",
      ["Distributes requests across servers", "Health checks remove failed instances", "Layer 4 or layer 7, various strategies"],
      null,
      "How would you keep your service available if one of its servers crashes?"
    ),
    t(
      "Rate limiting",
      "Capping how many requests a client can make in a period of time.",
      "Rate limits protect services from abuse, runaway clients and cost spikes. Common algorithms are fixed window, sliding window and token bucket; limits are keyed by user, API key or IP, and usually return HTTP 429.",
      "We rate limit the AI endpoints per user, because each call costs money and one script could otherwise burn the whole budget.",
      ["Caps requests per time window", "Keyed by user, key or IP; returns 429", "Fixed window, sliding window, token bucket"],
      "Throttling: often used to mean slowing requests down rather than rejecting them.",
      "How would you stop one customer's script from overwhelming your public API?"
    ),
    t(
      "Message queue",
      "A buffer that holds messages from producers until consumers process them, decoupling the two.",
      "Queues (SQS, RabbitMQ, Kafka topics) let you do work asynchronously, absorb traffic spikes and retry failures. Consumers must handle redelivery, so processing should be idempotent, and failures often go to a dead-letter queue.",
      "Sending the confirmation email goes through a queue, so a slow email provider never makes checkout slow.",
      ["Decouples producers and consumers", "Absorbs spikes, enables async work and retries", "Consumers must handle redelivery"],
      null,
      "Checkout is slow because it waits for emails and invoices to be generated. How would you change it?"
    ),
    t(
      "Eventual consistency",
      "A guarantee that replicas will agree on the latest value, but not necessarily immediately.",
      "Distributed systems often trade immediate consistency for availability and speed. After a write, some reads may briefly return old data. Designs handle it with read-your-writes tricks, version numbers or UI that tolerates delay.",
      "Our search index is eventually consistent, so a new product can take a few seconds to appear, and the UI says it's being indexed.",
      ["Replicas converge over time", "Reads may briefly be stale", "Trade-off for availability and performance"],
      "Strong consistency: every read sees the latest write.",
      "A user creates an item and immediately doesn't see it in the list. Why might that happen?"
    ),
    t(
      "ACID",
      "The four guarantees of a database transaction: atomicity, consistency, isolation and durability.",
      "Atomicity means all or nothing; consistency means constraints hold; isolation means concurrent transactions don't see each other's partial work; durability means committed data survives crashes. Relational databases provide ACID transactions.",
      "Transferring credits between accounts runs in one ACID transaction, so we never debit one account without crediting the other.",
      ["Atomicity: all or nothing", "Consistency and isolation", "Durability: committed data survives crashes"],
      "BASE: a looser model (basically available, eventually consistent) used by many distributed stores.",
      "How do you make sure money is never lost when moving it between two accounts?"
    ),
    t(
      "Race condition",
      "A bug where the result depends on the timing of operations that run at the same time.",
      "Two requests read the same value, both act on it, and one update overwrites the other. Fixes include transactions, row locks, atomic updates, unique constraints and conditional writes.",
      "Two quick clicks both read 'not submitted' and graded the answer twice, a race condition we fixed with a conditional update that only one request can win.",
      ["Outcome depends on timing", "Classic: read, then write based on stale read", "Fix with atomic or conditional writes, locks, constraints"],
      "Deadlock: two operations wait on each other forever.",
      "Customers occasionally get two orders created for one checkout. How would you find and fix it?"
    ),
    t(
      "Connection pooling",
      "Reusing a set of open database connections instead of opening a new one per request.",
      "Opening connections is slow and databases allow only so many. A pool keeps connections open and lends them out. In serverless environments, an external pooler like PgBouncer prevents many instances from exhausting the database.",
      "Our serverless functions kept hitting the Postgres connection limit, so we switched to the pooled connection string.",
      ["Reuses open connections", "Avoids connection setup cost and limits", "Critical in serverless deployments"],
      null,
      "Your database starts refusing connections under load. What could be causing it?"
    ),
    t(
      "Observability",
      "Being able to understand what a system is doing from its logs, metrics and traces.",
      "Logs record events, metrics show trends like error rate and latency, and traces follow one request across services. Good observability lets you answer new questions about production without shipping new code.",
      "With distributed tracing we saw that 80% of the request time was spent waiting on the pricing service.",
      ["Logs, metrics and traces", "Explains behaviour in production", "Lets you debug unknown problems"],
      "Monitoring: watching known metrics and alerting; observability lets you investigate new issues.",
      "Requests are occasionally slow and you don't know which service is responsible. How do you find out?"
    ),
    t(
      "Circuit breaker",
      "A pattern that stops calling a failing dependency for a while so failures don't cascade.",
      "After enough errors, the breaker opens and calls fail fast or use a fallback. After a timeout it lets a test request through and closes again if it succeeds. It protects both your service and the struggling dependency.",
      "When the recommendations service went down, the circuit breaker opened and we showed bestsellers instead of timing out every page.",
      ["Stops calls to a failing dependency", "Fails fast or uses a fallback", "Closed, open and half-open states"],
      "Retry: tries again; a circuit breaker stops trying for a while.",
      "A downstream service is timing out and now your whole site is slow. How would you protect it?"
    ),
    t(
      "Sharding",
      "Splitting one dataset across several databases, each holding part of the data.",
      "Each shard holds a subset of rows chosen by a shard key, like user id. It scales writes and storage beyond one machine, but cross-shard queries, rebalancing and choosing a key that avoids hot spots are hard.",
      "We shard by tenant id, so each customer's data lives on one shard and almost every query stays on a single database.",
      ["Splits data across databases", "Chosen by a shard key", "Scales writes but complicates cross-shard queries"],
      "Replication: copies the same data to several machines; sharding splits different data across them.",
      "Your single Postgres database can't keep up with write volume. What are your options?"
    ),
    t(
      "Webhook",
      "An HTTP callback where one system notifies another by sending a request when an event happens.",
      "Instead of polling, the receiver exposes an endpoint and the sender POSTs events to it. Receivers should verify signatures, respond quickly, process asynchronously and handle duplicates idempotently.",
      "We verify the Stripe webhook signature, put the event on a queue and return 200 immediately, so slow processing never causes retries.",
      ["Push notification over HTTP", "Verify signatures, respond fast", "Expect retries and duplicates"],
      "Polling: the client repeatedly asks for updates instead of being told.",
      "How would you keep your system in sync with payment status changes from a third-party provider?"
    ),
  ],
};
