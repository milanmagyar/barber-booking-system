import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

const formatDate = (date: Date) => {
  return format(date, "PPP", { locale: hu });
};

const formatTime = (date: Date) => {
  return format(date, "HH:mm", { locale: hu });
};

const getUTCDateString = (date: Date) => {
  return date.toISOString().split("T")[0];
};

export { formatDate, formatTime, getUTCDateString };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
