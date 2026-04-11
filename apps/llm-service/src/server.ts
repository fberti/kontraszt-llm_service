import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getEnv } from "./env.ts";
import { runSync } from "./runSync.ts";

const env = getEnv();

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isAuthorized(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  const secretHeader = req.headers["x-webhook-secret"];

  if (authHeader === `Bearer ${env.webhookSecret}`) {
    return true;
  }
  if (secretHeader === env.webhookSecret) {
    return true;
  }

  return false;
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      return sendJson(res, 404, { ok: false });
    }

    if (req.method === "GET" && req.url === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/webhook/scrape-complete") {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }

      const body = await readJsonBody(req).catch(() => ({}));
      const webhookId = typeof body.webhookId === "string" ? body.webhookId : undefined;

      console.log("Webhook received", { webhookId });

      void runSync({ webhookId })
        .then((result) => {
          console.log("Sync finished", result);
        })
        .catch((error) => {
          console.error("Sync crashed", error);
        });

      return sendJson(res, 202, {
        ok: true,
        accepted: true,
        webhookId: webhookId ?? null,
      });
    }

    return sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    console.error("Server error", error);
    return sendJson(res, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(env.port, () => {
  console.log(`llm-service listening on port ${env.port}`);
});
