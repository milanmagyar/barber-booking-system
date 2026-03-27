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

export { formatDate, formatTime };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
