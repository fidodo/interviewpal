import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // A bad request caught before any handler ran (malformed JSON, a body that's too large): express.json() marks these
  // with a 4xx status and a message that's safe to show, so answer with that instead of a 500.
  const clientError = err as { status?: unknown; expose?: unknown; message?: unknown; type?: unknown };
  if (typeof clientError?.status === "number" && clientError.status >= 400 && clientError.status < 500 && clientError.expose === true) {
    const message =
      clientError.type === "entity.parse.failed" ? "The request couldn't be read (it isn't valid JSON)." : typeof clientError.message === "string" ? clientError.message : "Bad request";
    res.status(clientError.status).json({ error: message });
    return;
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: env.isProd ? "Something went wrong. Please try again." : message });
}

export function asyncHandler<T extends (req: any, res: Response, next: NextFunction) => Promise<void>>(fn: T) {
  return (req: any, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
