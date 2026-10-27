export interface TurtleDrawing {
  // [x1, y1, x2, y2, colour, pen size], in turtle coordinates: (0, 0) is the centre, y points up.
  lines: [number, number, number, number, string, number][];
  // [x, y, size, colour]
  dots: [number, number, number, string][];
  bg: string | null;
  // [x, y, heading] for each turtle at the end of the run.
  turtles: [number, number, number][];
}

export interface RunRequest {
  id: number;
  code: string;
}

export type WorkerMessage =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; id: number; stdout: string; error: string | null; drawing: TurtleDrawing };

export const EMPTY_DRAWING: TurtleDrawing = { lines: [], dots: [], bg: null, turtles: [] };
