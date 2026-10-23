import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: env.isProd ? "Something went wrong. Please try again." : message });
}

export function asyncHandler<T extends (req: any, res: Response, next: NextFunction) => Promise<void>>(fn: T) {
  return (req: any, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
