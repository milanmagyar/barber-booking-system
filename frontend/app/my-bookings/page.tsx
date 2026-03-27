"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const formatDate = (date: Date) => {
  return format(date, "PPP", { locale: hu });
};

const formatTime = (date: Date) => {
  return format(date, "HH:mm", { locale: hu });
};

interface Barber {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  barberId: string;
  startTime: string;
  email: string;
}

const emailSchema = z.object({ email: z.email("Érvénytelen email cím") });

type EmailForm = z.infer<typeof emailSchema>;

export default function MyBookings() {
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();

  const { data: barbers = [] } = useQuery<Barber[]>({
    queryKey: ["barbers"],
    queryFn: () => apiFetch("/api/barbers"),
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["my-appointments", email],
    queryFn: () => apiFetch(`/api/appointments?email=${email}`),
    enabled: !!email,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/appointments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(emailSchema),
  });

  const onSubmit = (data: EmailForm) => setEmail(data.email);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8">Saját foglalásaim</h1>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Email cím megadása</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4">
            <Input
              placeholder="pelda@email.com"
              {...register("email")}
              className="flex-1"
            />
            <Button type="submit">Mutasd a foglalásaimat</Button>
          </form>
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </CardContent>
      </Card>
      {isLoading && <p>Betöltés...</p>}
      {appointments.length === 0 && email && (
        <p className="text-muted-foreground">
          Nincs foglalás ehhez az email címhez.
        </p>
      )}
      <div className="space-y-4">
        {appointments.map((app) => {
          const barber = barbers.find((b) => b.id === app.barberId);
          const date = new Date(app.startTime);
          return (
            <Card key={app.id}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="font-semibold">
                    {barber?.name || "Ismeretlen borbély"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(date)} {formatTime(date)}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(app.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
