/**
 * A topology is one small service graph scenarios are written against:
 *
 *   edge ──▶ app ──▶ dep ──▶ external (third party)
 *              │       │
 *              ├──▶ db ◀┘      consumer ◀── queue
 *              └──▶ cache
 *
 * Scenarios refer to roles (`t.app`, `t.dep`), never concrete names, so every
 * scenario renders on every topology and the agent can't learn "payment-svc is
 * always the culprit".
 */
export interface Topology {
  key: string;
  edge: string;
  app: string;
  dep: string;
  db: string;
  dbKind: "postgres" | "mysql";
  cache: string;
  consumer: string;
  /** Queue/topic the consumer reads, which the app publishes to. */
  queue: string;
  /** User-facing route on the edge, e.g. "POST /checkout". */
  route: string;
  /** The app → dep call, e.g. "POST /charge". */
  depCall: string;
  /** Client method the app uses for that call. */
  depClient: string;
  external: { host: string; path: string; label: string };
  entity: { prefix: string; noun: string };
  table: string;
  /** Typical healthy latency of the edge route, ms. */
  baseLatency: number;
}

export const TOPOLOGIES: readonly Topology[] = [
  {
    key: "checkout",
    edge: "api-gateway",
    app: "order-service",
    dep: "payment-svc",
    db: "postgres",
    dbKind: "postgres",
    cache: "redis",
    consumer: "order-consumer",
    queue: "orders.events",
    route: "POST /checkout",
    depCall: "POST /charge",
    depClient: "PaymentClient.charge",
    external: { host: "api.cardproc.example", path: "/v1/charges", label: "card processor" },
    entity: { prefix: "o-", noun: "order" },
    table: "orders",
    baseLatency: 150,
  },
  {
    key: "search",
    edge: "web-bff",
    app: "search-api",
    dep: "catalog-svc",
    db: "catalog-db",
    dbKind: "postgres",
    cache: "redis-cache",
    consumer: "index-worker",
    queue: "catalog.updates",
    route: "GET /search",
    depCall: "GET /products/batch",
    depClient: "CatalogClient.getBatch",
    external: { host: "api.translate.example", path: "/v2/translate", label: "translation API" },
    entity: { prefix: "p-", noun: "product" },
    table: "products",
    baseLatency: 90,
  },
  {
    key: "notifications",
    edge: "api-gateway",
    app: "notification-svc",
    dep: "template-svc",
    db: "notif-db",
    dbKind: "mysql",
    cache: "redis",
    consumer: "notif-worker",
    queue: "notifications.outbound",
    route: "POST /v1/notify",
    depCall: "POST /render",
    depClient: "TemplateClient.render",
    external: { host: "api.mailer.example", path: "/v3/send", label: "email provider" },
    entity: { prefix: "m-", noun: "message" },
    table: "notifications",
    baseLatency: 120,
  },
  {
    key: "accounts",
    edge: "edge-proxy",
    app: "account-svc",
    dep: "auth-svc",
    db: "accounts-db",
    dbKind: "postgres",
    cache: "session-cache",
    consumer: "audit-consumer",
    queue: "audit.events",
    route: "POST /login",
    depCall: "POST /tokens",
    depClient: "AuthClient.issueToken",
    external: { host: "idp.example", path: "/oauth2/token", label: "identity provider" },
    entity: { prefix: "u-", noun: "user" },
    table: "accounts",
    baseLatency: 110,
  },
  {
    key: "ingest",
    edge: "ingest-gateway",
    app: "ingest-api",
    dep: "enrichment-svc",
    db: "events-db",
    dbKind: "mysql",
    cache: "geo-cache",
    consumer: "event-processor",
    queue: "events.raw",
    route: "POST /v1/events",
    depCall: "POST /enrich",
    depClient: "EnrichClient.enrich",
    external: { host: "api.geoip.example", path: "/v1/lookup", label: "geo-IP provider" },
    entity: { prefix: "e-", noun: "event" },
    table: "events",
    baseLatency: 60,
  },
];

export function servicesOf(t: Topology): string[] {
  return [t.edge, t.app, t.dep, t.db, t.cache, t.consumer];
}

/** "Order" from "order". */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
