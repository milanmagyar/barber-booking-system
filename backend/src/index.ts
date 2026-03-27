import { serve } from "@hono/node-server";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
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
  const [hours, minutes] = time.split(":").map(Number);

  if (isNaN(hours) || isNaN(minutes)) {
    return NaN;
  }

  return hours * 60 + minutes;
};

const getAvailableSlots = async (barberId: string, date: Date) => {
  const barber = await getBarber(barberId);

  if (!barber) {
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

const ParamsIdSchema = z.object({
  id: z.uuid().openapi({
    param: { name: "id", in: "path" },
    example: "123e4567-e89b-12d3-a456-426614174000",
  }),
});

const AppointmentSchema = z
  .object({
    id: z.uuid(),
    barberId: z.uuid(),
    startTime: z.iso.datetime(),
    email: z.email(),
  })
  .openapi("Appointment");

const ErrorSchema = z
  .object({
    success: z.boolean(),
    error: z.string(),
    validationErrors: z
      .array(z.object({ name: z.string(), message: z.string() }))
      .optional(),
  })
  .openapi("Error");

const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success && result.error.name === "ZodError") {
      return c.json(
        {
          success: false,
          error: "Validation Error",
          validationErrors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
  },
});

app.use("/api/*", cors());

app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
});

const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header("X-API-Key");

  if (key !== API_KEY) {
    return c.json({ success: false, error: "Invalid X-API-Key" }, 401);
  }

  await next();
};

app.use("/api/*", authMiddleware);

const getBarbersRoute = createRoute({
  method: "get",
  path: "/api/barbers",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.object({ id: z.string(), name: z.string() })),
        },
      },
      description: "List barbers",
    },
  },
});

app.openapi(getBarbersRoute, async (c) => {
  const barbers = await getBarbers();

  return c.json(
    barbers.map((barber) => ({ id: barber.id, name: barber.name })),
    200,
  );
});

const getSlotsRoute = createRoute({
  method: "get",
  path: "/api/available-slots",
  request: {
    query: z.object({
      barberId: z.uuid(),
      date: z.iso.date(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(z.iso.datetime()) } },
      description: "Available slots",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation Error",
    },
  },
});

app.openapi(getSlotsRoute, async (c) => {
  const { barberId, date: dateStr } = c.req.valid("query");

  const slots = await getAvailableSlots(
    barberId,
    convertDateStringToDate(dateStr),
  );

  return c.json(slots, 200);
});

const createAppointmentRoute = createRoute({
  method: "post",
  path: "/api/appointments",
  request: {
    body: {
      content: {
        "application/json": { schema: AppointmentSchema.omit({ id: true }) },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: AppointmentSchema } },
      description: "Created",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Bad Request",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not Found",
    },
    409: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Conflict",
    },
  },
});

app.openapi(createAppointmentRoute, async (c) => {
  const { barberId, startTime, email } = c.req.valid("json");
  const startDate = new Date(startTime);

  if (startDate < new Date()) {
    return c.json({ success: false, error: "Cannot book in the past" }, 400);
  }

  if (!isWorkingDay(startDate)) {
    return c.json({ success: false, error: "Not a working day" }, 400);
  }

  const barber = await getBarber(barberId);

  if (!barber) {
    return c.json({ success: false, error: "Barber not found" }, 404);
  }

  const dayKey = DAY_KEYS[startDate.getUTCDay()];
  const daySchedule = barber.workSchedule[dayKey];
  const startMin = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();

  if (
    !daySchedule ||
    startMin < timeToMinutes(daySchedule.start) ||
    startMin + APPOINTMENT_DURATION_MINUTES > timeToMinutes(daySchedule.end)
  ) {
    return c.json({ success: false, error: "Outside work schedule" }, 400);
  }

  if (
    await hasOverlap(
      barberId,
      startDate,
      APPOINTMENT_DURATION_MINUTES * 60 * 1000,
    )
  ) {
    return c.json({ success: false, error: "Time slot taken" }, 409);
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

const getAppointmentsByEmailRoute = createRoute({
  method: "get",
  path: "/api/appointments",
  request: {
    query: z.object({
      email: z.email().openapi({
        example: "customer@example.com",
        description: "The email address associated with the appointments",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(AppointmentSchema),
        },
      },
      description: "Retrieve appointments for a specific email",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Invalid email format",
    },
  },
});

app.openapi(getAppointmentsByEmailRoute, async (c) => {
  const { email } = c.req.valid("query");

  await db.read();

  const appointments = db.data.appointments.filter(
    (appointment) => appointment.email === email,
  );

  return c.json(appointments, 200);
});

const deleteAppointmentRoute = createRoute({
  method: "delete",
  path: "/api/appointments/{id}",
  request: { params: ParamsIdSchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
      description: "Deleted",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not Found",
    },
  },
});

app.openapi(deleteAppointmentRoute, async (c) => {
  const { id } = c.req.valid("param");

  await db.read();

  const index = db.data.appointments.findIndex(
    (appointment) => appointment.id === id,
  );

  if (index === -1) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  db.data.appointments.splice(index, 1);

  await db.write();

  return c.json({ success: true }, 200);
});

app.doc("/doc", {
  openapi: "3.0.0",
  info: { version: "1.0.0", title: "Barber API" },
  security: [{ ApiKeyAuth: [] }],
});

app.get("/reference", Scalar({ url: "/doc" }));

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server: http://localhost:${info.port}`);
  console.log(`Docs: http://localhost:${info.port}/reference`);
});
