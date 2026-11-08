# Message Throttling Gateway

A gateway that absorbs large bursts of messages from one platform and delivers them to a rate-limited provider at a steady 100 messages per second, with persistence, retries and idempotent intake. Built with TypeScript, Express, BullMQ, Redis and PostgreSQL, and runnable end to end with Docker Compose, including mock services for both sides.

## The problem

An upstream platform can emit tens of thousands of messages at once, while the provider that actually delivers them only accepts 100 requests per second and rejects the rest. Forwarding the burst directly would mean rejected sends, lost messages and duplicates when the sender retries. The gateway sits in between: it accepts every message immediately, stores it, and releases it to the provider at the rate the provider can take, retrying when the provider pushes back.

## My role and process

Technical challenge, built solo: design, implementation, tests and the local environment.

The system has three services:

- **Service B (the gateway).** `POST /messages` validates the payload, ignores any `id` it has already received, saves the message in PostgreSQL as `PENDING` and adds a job to a BullMQ queue, answering `202 Accepted` without waiting for delivery. A BullMQ worker, capped at 100 jobs per second, marks the message as in progress, forwards it to the provider and marks it `SENT`. A `429` or any other failed send is retried up to 5 attempts with exponential backoff starting at one second; a message that exhausts its attempts ends as `FAILED`. `GET /messages` returns the count per status and `GET /messages/:id` the state of one message.
- **Mock A (the upstream platform).** `POST /simulate?count=N` generates N messages (100,000 by default) with random UUIDs and posts them to the gateway with up to 100 requests in flight.
- **Mock C (the provider).** Accepts `POST /send-message` and enforces 100 requests per second, answering `429` beyond that.

Key decisions:

- **Store first, then queue.** Every accepted message is written to PostgreSQL before it is enqueued, so its state can always be queried, and Redis runs with append-only persistence so queued jobs survive a restart.
- **Throttle at the worker.** BullMQ's built-in limiter spaces the sends to match the provider's limit instead of firing the burst and relying on retries.
- **Idempotent intake.** The message `id` is the primary key; a repeated `id` is acknowledged and not enqueued again, so a sender's retry does not produce a second delivery.

## Technologies and tools

| Function | Technology |
|---|---|
| Language and runtime | TypeScript on Node.js |
| HTTP API | Express 5, with request validation via express-validator |
| Message persistence | PostgreSQL, accessed through Prisma ORM with versioned migrations |
| Queue, throttling and retries | BullMQ on Redis (rate limiter, attempts, exponential backoff) |
| Configuration | Typed environment variables via env-var |
| Provider rate limit (mock) | express-rate-limit |
| Test data (mock) | Faker for message IDs |
| Testing | Jest with ts-jest and node-mocks-http; the database, queue and provider are mocked |
| Local environment | Docker Compose: PostgreSQL, Redis and the three services, with health checks |

## Results

- A burst of any size is accepted immediately and delivered at the provider's rate, so the provider's `429` responses become retries instead of lost messages.
- Each message's lifecycle (`PENDING`, in progress, `SENT`, `FAILED`) and its retry count are stored and can be queried individually or as totals.
- Duplicate submissions of the same `id` are acknowledged without a second delivery.
- Unit tests cover the intake endpoint (new and repeated messages), the status endpoints and the worker's success, `429` and failure paths.

## Run it

Requires Docker with Compose.

```bash
cp .env.example .env
docker compose up --build

# Send a burst of 100,000 messages through the gateway
curl -X POST "http://localhost:3002/simulate?count=100000"

# Watch the totals per status grow at about 100 per second
curl -s http://localhost:3000/messages
```

Unit tests:

```bash
cd service-b
npm install
npm test
```

## Screenshots

No screenshots yet. Add them to `docs/screenshots/` and link them here: for example, the terminal output of a burst and the `GET /messages` totals while the queue drains.

## Links

No live demo or related repositories yet.
