"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";

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

export default function Home() {
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const queryClient = useQueryClient();

  const { data: barbers = [] } = useQuery<Barber[]>({
    queryKey: ["barbers"],
    queryFn: () => apiFetch("/api/barbers"),
  });

  const selectedBarber = barbers.find((b) => b.id === selectedBarberId);

  const dateStr = selectedDate.toISOString().split("T")[0];
  const { data: slots = [], isLoading: slotsLoading } = useQuery<string[]>({
    queryKey: ["slots", selectedBarberId, dateStr],
    queryFn: () => {
      if (!selectedBarberId) {
        return Promise.resolve([]);
      }

      return apiFetch(`/api/available-slots?barberId=${selectedBarberId}&date=${dateStr}`);
    },
    enabled: !!selectedBarberId,
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-center mb-2 text-amber-600">
        Időpontfoglalás
      </h1>
      <p className="text-center text-muted-foreground mb-10">
        Válassz borbélyt, dátumot és időpontot
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>1. Borbély kiválasztása</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedBarberId}
              onValueChange={setSelectedBarberId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Válassz borbélyt..." />
              </SelectTrigger>
              <SelectContent>
                {barbers.map((barber) => (
                  <SelectItem key={barber.id} value={barber.id}>
                    {barber.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
          <CardHeader className="pt-6">
            <CardTitle>2. Dátum kiválasztása</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? formatDate(selectedDate) : "Válassz dátumot"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  disabled={(date) =>
                    date < new Date(new Date().setHours(0, 0, 0, 0))
                  }
                  autoFocus
                  timeZone="UTC"
                />
              </PopoverContent>
            </Popover>
          </CardContent>
          <CardHeader className="pt-6">
            <CardTitle>3. Elérhető időpontok</CardTitle>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <p className="text-muted-foreground">Betöltés...</p>
            ) : slots.length === 0 ? (
              <p className="text-amber-600">
                Nincs elérhető időpont ezen a napon.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot}
                    variant={selectedSlot === slot ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setSelectedSlot(slot)}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {formatTime(new Date(slot))}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>4. Foglalás véglegesítése</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {selectedBarber && selectedSlot && (
              <div className="bg-amber-50 p-4 rounded-lg">
                <p className="font-medium">Választott időpont:</p>
                <p>
                  {selectedBarber.name} – {formatDate(new Date(selectedSlot))}{" "}
                  {formatTime(new Date(selectedSlot))}
                </p>
              </div>
            )}
            {/*<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="email">Email cím</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="pelda@email.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!selectedSlot || createMutation.isPending}
                size="lg"
              >
                {createMutation.isPending
                  ? "Foglalás folyamatban..."
                  : "Időpont lefoglalása"}
              </Button>
            </form>*/}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
