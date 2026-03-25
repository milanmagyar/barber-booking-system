import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

interface DaySchedule {
  start: string;
  end: string;
}

interface WorkSchedule {
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
  sunday?: DaySchedule;
}

interface Barber {
  id: string;
  name: string;
  workSchedule: WorkSchedule;
}

const API_KEY = "secret-backend-api-key";
const EXTERNAL_API_KEY =
  "08980fd4d393b390ec1d60a33945ff301e28c9092e660f593d6d182bc8364d2c";
const EXTERNAL_BARBERS_URL =
  "https://barber-hono-on-vercel.vercel.app/api/v1/barbers";

const app = new Hono();

const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header("X-API-Key");

  if (key !== API_KEY) {
    return c.json({ error: "Unauthorized - invalid X-API-Key" }, 401);
  }

  await next();
};

app.use("/api/*", authMiddleware);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/api/barbers", async (c) => {
  try {
    const res = await fetch(EXTERNAL_BARBERS_URL, {
      headers: { "X-API-Key": EXTERNAL_API_KEY },
    });

    if (!res.ok) {
      throw new Error("External API error");
    }

    const barbers = (await res.json()) as Barber[];

    return c.json(barbers);
  } catch (e) {
    console.error(e);

    return c.json({ error: "Failed to fetch barbers from external API" }, 500);
  }
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
