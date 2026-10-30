// Component kinds on the canvas. Mirrored in server/src/design/design.prompts.ts (COMPONENT_KINDS).
export const COMPONENT_KINDS = {
  client: "Client",
  cdn: "CDN",
  loadBalancer: "Load balancer",
  apiGateway: "API gateway",
  service: "Service",
  worker: "Worker",
  database: "Database",
  cache: "Cache",
  queue: "Queue / stream",
  storage: "Object storage",
  search: "Search index",
  external: "External API",
} as const;

export type ComponentKind = keyof typeof COMPONENT_KINDS;

// Groups set the node's colour, so the kind of each box reads at a glance.
export const KIND_GROUP: Record<ComponentKind, "edge" | "compute" | "data" | "messaging"> = {
  client: "edge",
  cdn: "edge",
  loadBalancer: "edge",
  apiGateway: "edge",
  service: "compute",
  worker: "compute",
  external: "compute",
  database: "data",
  cache: "data",
  storage: "data",
  search: "data",
  queue: "messaging",
};

export interface DiagramNode {
  id: string;
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// Limits match the server's.
export const MAX_NODES = 40;
export const MAX_EDGES = 80;
export const MAX_LABEL = 40;

export const nodeName = (n: DiagramNode) => n.label || COMPONENT_KINDS[n.kind];
