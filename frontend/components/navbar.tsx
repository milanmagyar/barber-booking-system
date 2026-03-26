"use client";

import Link from "next/link";
import { Scissors } from "lucide-react";

export function Navbar() {
  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Scissors className="h-8 w-8 text-amber-600" />
            <h1 className="text-2xl font-bold text-amber-600">Borbélyüzlet</h1>
          </div>
          <div className="flex gap-8 text-sm font-medium">
            <Link href="/" className="hover:text-amber-600 transition-colors">
              Foglalás
            </Link>
            <Link
              href="/my-bookings"
              className="hover:text-amber-600 transition-colors"
            >
              Saját foglalásaim
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
