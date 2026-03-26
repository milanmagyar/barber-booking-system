import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

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
const DAY_KEYS: (keyof WorkSchedule)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const HOLIDAYS = new Set(["2026-01-01", "2026-03-15", "2026-05-01"]);
const APPOINTMENT_DURATION_MINUTES = 60;

const fetchBarbers = async () => {
  const res = await fetch(EXTERNAL_BARBERS_URL, {
    headers: { "X-API-Key": EXTERNAL_API_KEY },
  });

  if (!res.ok) {
    throw new Error("External API error");
  }

  return (await res.json()) as Barber[];
};

const getBarbers = async () => {
  try {
    return await fetchBarbers();
  } catch (e) {
    console.error(e);

    return [];
  }
};

const getBarber = async (id: string) => {
  const barbers = await getBarbers();

  return barbers.find((barber) => barber.id === id) ?? null;
};

const convertDateStringToDate = (dateStr: string) => {
  return new Date(dateStr + "T00:00:00Z");
};

const convertDateToDateString = (date: Date) => {
  return date.toISOString().split("T")[0];
};

const isSunday = (date: Date) => {
  return date.getDay() === 0;
};

const isHoliday = (date: Date) => {
  return HOLIDAYS.has(convertDateToDateString(date));
};

const isWorkingDay = (date: Date) => {
  return !isSunday(date) && !isHoliday(date);
};

const timeToMinutes = (time: string) => {
  if (typeof time !== "string") {
    return NaN;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (isNaN(hours) || isNaN(minutes)) {
    return NaN;
  }

  return hours * 60 + minutes;
};

const getAvailableSlots = async (barberId: string, dateStr: string) => {
  const barber = await getBarber(barberId);

  if (!barber) {
    return [];
  }

  const date = convertDateStringToDate(dateStr);

  if (isNaN(date.getTime())) {
    return [];
  }

  if (!isWorkingDay(date)) {
    return [];
  }

  const daySchedule = barber.workSchedule[DAY_KEYS[date.getDay()]];

  if (!daySchedule) {
    return [];
  }

  const startMinutes = timeToMinutes(daySchedule.start);
  const endMinutes = timeToMinutes(daySchedule.end);

  if (startMinutes >= endMinutes || isNaN(startMinutes) || isNaN(endMinutes)) {
    return [];
  }

  const now = new Date();
  const slots: string[] = [];

  for (
    let currentMinutes = startMinutes;
    currentMinutes + APPOINTMENT_DURATION_MINUTES <= endMinutes;
    currentMinutes += APPOINTMENT_DURATION_MINUTES
  ) {
    const slotDate = new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(currentMinutes / 60),
        currentMinutes % 60,
      ),
    );

    if (slotDate > now) {
      slots.push(slotDate.toISOString());
    }
  }

  return slots;
};

const AvailableSlotsSchema = z.object({
  barberId: z.uuid(),
  date: z.iso.date(),
});

const app = new Hono();

app.use('/api/*', cors());

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
  const barbers = await getBarbers();

  return c.json(barbers.map(barber => ({ id: barber.id, name: barber.name })));
});

app.get("/api/available-slots", async (c) => {
  const parsed = AvailableSlotsSchema.safeParse({
    barberId: c.req.query("barberId"),
    date: c.req.query("date"),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation error",
        issues: parsed.error.issues.map((issue) => ({
          name: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const slots = await getAvailableSlots(parsed.data.barberId, parsed.data.date);

  return c.json(slots);
});

serve(
  {
    fetch: app.fetch,
    port: 3001,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
