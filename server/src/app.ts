import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

// Behind Vercel's proxy, req.ip would otherwise be the proxy's address, lumping every user into one IP-based
// rate-limit bucket. Trust exactly one hop (Vercel's), not the whole client-supplied X-Forwarded-For chain.
if (env.isProd) app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use("/api", apiRouter);

app.use(errorHandler);
