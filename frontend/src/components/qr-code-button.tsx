"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, X } from "lucide-react";
import { SITE_URL } from "@/lib/config";

type QRCodeButtonProps = {
  username: string;
};

export function QRCodeButton({ username }: QRCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const profileUrl = `${typeof window !== "undefined" ? window.location.origin : SITE_URL}/profile/${username}`;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Show QR code"
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-sky/80 transition hover:bg-white/10 hover:text-white"
      >
        <QrCode size={14} />
        QR Code
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label="Profile QR code"
          className="absolute left-0 top-full z-50 mt-2 rounded-2xl border border-white/10 bg-[#0A0A0B] p-5 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between gap-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-steel">
              Scan to support
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close QR code"
              className="rounded-lg p-1 text-steel transition hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={profileUrl} size={160} />
          </div>
          <p className="mt-3 max-w-[160px] break-all text-center text-[10px] text-steel">
            {profileUrl}
          </p>
        </div>
      )}
    </div>
  );
}
