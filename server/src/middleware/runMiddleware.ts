import { RequestHandler, Response } from "express";
import { AuthedRequest } from "./auth.middleware";

// Runs middleware (e.g. rate limiters) from inside a handler. Resolves false when the middleware answered the
// request itself (e.g. a 429), so the handler must stop.
export function passes(req: AuthedRequest, res: Response, middleware: RequestHandler[]): Promise<boolean> {
  return middleware.reduce<Promise<boolean>>(
    (prev, mw) =>
      prev.then(
        (ok) =>
          ok &&
          new Promise<boolean>((resolve, reject) => {
            const onFinish = () => resolve(false);
            res.once("finish", onFinish);
            mw(req, res, (err?: unknown) => {
              res.off("finish", onFinish);
              if (err) reject(err);
              else resolve(true);
            });
          })
      ),
    Promise.resolve(true)
  );
}
