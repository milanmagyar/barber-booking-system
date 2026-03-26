import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { z } from "zod";
import crypto from "crypto";

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

interface Appointment {
  id: string;
  barberId: string;
  startTime: string;
  email: string;
}

interface Data {
  appointments: Appointment[];
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

const db = new Low<Data>(new JSONFile("db.json"), { appointments: [] });

const overlaps = (date1: Date, date2: Date, durationMs: number) => {
  const start1 = date1.getTime();
  const end1 = start1 + durationMs;
  const start2 = date2.getTime();
  const end2 = start2 + durationMs;

  return start1 < end2 && start2 < end1;
};

const hasOverlap = async (
  barberId: string,
  startDate: Date,
  durationMs: number,
) => {
  await db.read();

  return db.data.appointments.some((appointment) => {
    if (appointment.barberId !== barberId) {
      return false;
    }

    return overlaps(new Date(appointment.startTime), startDate, durationMs);
  });
};

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
  return date.getUTCDay() === 0;
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

  const daySchedule = barber.workSchedule[DAY_KEYS[date.getUTCDay()]];

  if (!daySchedule) {
    return [];
  }

  const startMinutes = timeToMinutes(daySchedule.start);
  const endMinutes = timeToMinutes(daySchedule.end);

  if (startMinutes >= endMinutes || isNaN(startMinutes) || isNaN(endMinutes)) {
    return [];
  }

  const durationMs = APPOINTMENT_DURATION_MINUTES * 60 * 1000;
  const now = new Date();
  const slots: string[] = [];

  for (
    let currentMinutes = startMinutes;
    currentMinutes + APPOINTMENT_DURATION_MINUTES <= endMinutes;
    currentMinutes += APPOINTMENT_DURATION_MINUTES
  ) {
    const slotDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    slotDate.setUTCMinutes(currentMinutes);

    if (slotDate > now && !(await hasOverlap(barberId, slotDate, durationMs))) {
      slots.push(slotDate.toISOString());
    }
  }

  return slots;
};

const AvailableSlotsSchema = z.object({
  barberId: z.uuid(),
  date: z.iso.date(),
});

const CreateAppointmentSchema = z.object({
  barberId: z.uuid(),
  startTime: z.iso.datetime(),
  email: z.email(),
});

const app = new Hono();

app.use("/api/*", cors());

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

  return c.json(
    barbers.map((barber) => ({ id: barber.id, name: barber.name })),
  );
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

app.post("/api/appointments", async (c) => {
  let body: z.infer<typeof CreateAppointmentSchema>;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = CreateAppointmentSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation error", issues: parsed.error.issues },
      400,
    );
  }

  const { barberId, startTime, email } = parsed.data;
  const startDate = new Date(startTime);

  if (startDate < new Date()) {
    return c.json({ error: "Cannot book in the past" }, 400);
  }

  if (!isWorkingDay(startDate)) {
    return c.json({ error: "It is not a working day" }, 400);
  }

  const barber = await getBarber(barberId);

  if (!barber) {
    return c.json({ error: "Barber not found" }, 404);
  }

  const dayKey = DAY_KEYS[startDate.getUTCDay()];
  const daySchedule = barber.workSchedule[dayKey];

  if (!daySchedule) {
    return c.json(
      { error: "Appointment time outside barber's work schedule" },
      400,
    );
  }

  const openMin = timeToMinutes(daySchedule.start);
  const closeMin = timeToMinutes(daySchedule.end);
  const startMin = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();

  if (
    startMin < openMin ||
    startMin + APPOINTMENT_DURATION_MINUTES > closeMin
  ) {
    return c.json(
      { error: "Appointment time outside barber's work schedule" },
      400,
    );
  }

  if (
    await hasOverlap(
      barberId,
      startDate,
      APPOINTMENT_DURATION_MINUTES * 60 * 1000,
    )
  ) {
    return c.json({ error: "Time slot already taken" }, 409);
  }

  const appointment: Appointment = {
    id: crypto.randomUUID(),
    barberId,
    startTime: startDate.toISOString(),
    email,
  };

  await db.read();

  db.data.appointments.push(appointment);

  await db.write();

  return c.json(appointment, 201);
});

app.get("/api/appointments", async (c) => {
  const email = c.req.query("email");

  if (!z.email().safeParse(email).success) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  await db.read();

  const appointments = db.data.appointments.filter(
    (appointment) => appointment.email === email,
  );

  return c.json(appointments);
});

app.delete("/api/appointments/:id", async (c) => {
  const id = c.req.param("id");

  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "Valid ID is required" }, 400);
  }

  await db.read();

  const index = db.data.appointments.findIndex(
    (appointment) => appointment.id === id,
  );

  if (index === -1) {
    return c.json({ error: "Appointment not found" }, 404);
  }

  db.data.appointments.splice(index, 1);

  await db.write();

  return c.json({ success: true, message: "Appointment deleted" });
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
