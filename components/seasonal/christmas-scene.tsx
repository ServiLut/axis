"use client";

import { useId } from "react";
import { useChristmas } from "./christmas-provider";

function Tree() {
  const gradient = useId();
  return <svg viewBox="0 0 180 210" fill="none">
    <defs><linearGradient id={gradient} x1="35" y1="40" x2="140" y2="180" gradientUnits="userSpaceOnUse">
      <stop stopColor="#5eaa7a" /><stop offset="1" stopColor="#0d5948" />
    </linearGradient></defs>
    <ellipse cx="90" cy="196" rx="63" ry="7" fill="#d8bd7b" opacity="0.2" />
    <rect x="79" y="165" width="22" height="28" rx="4" fill="#986746" />
    <path d="M90 30L129 86H113L148 137H126L164 181Q90 199 16 181L54 137H32L67 86H51Z" fill={`url(#${gradient})`} stroke="#79af87" strokeWidth="2" strokeLinejoin="round" />
    <path d="M61 87Q88 100 120 100M43 135Q87 155 144 148" stroke="#efd28a" strokeWidth="4" strokeLinecap="round" />
    <path d="M90 5L97 20L114 22L101 34L104 51L90 43L75 51L78 34L65 22L82 20Z" fill="#ffdc80" stroke="#ffeeb7" strokeWidth="2" strokeLinejoin="round" />
    <g className="christmas-lights">
      <circle cx="88" cy="78" r="6" fill="#ffe7a8" />
      <circle cx="64" cy="115" r="7" fill="#d95162" />
      <circle cx="116" cy="123" r="6" fill="#ffe7a8" />
      <circle cx="73" cy="162" r="6" fill="#ffe7a8" />
      <circle cx="127" cy="167" r="7" fill="#d95162" />
      <circle cx="98" cy="146" r="5" fill="#fff8e6" />
    </g>
  </svg>;
}

function Gift({ gold = false }: { gold?: boolean }) {
  return <svg viewBox="0 0 80 76" fill="none">
    <path d="M39 25C17 25 11 2 26 5C36 7 40 25 40 25C40 25 47 5 59 6C74 8 59 29 41 25Z" stroke={gold ? "#ad354d" : "#f8d98e"} strokeWidth="5" strokeLinejoin="round" />
    <rect x="10" y="29" width="60" height="41" rx="5" fill={gold ? "#e8c16d" : "#b94059"} />
    <rect x="6" y="24" width="68" height="15" rx="4" fill={gold ? "#f6d98d" : "#d96176"} />
    <path d="M35 24H45V70H35Z" fill={gold ? "#ad354d" : "#f8d98e"} />
    <path d="M16 44H64" stroke="#fff8ed" strokeOpacity="0.18" strokeWidth="2" />
  </svg>;
}

export function ChristmasScene({ variant }: { variant: "login" | "compact" | "panel" }) {
  const { enabled } = useChristmas();
  if (!enabled) return null;
  return <div className={`christmas-scene christmas-scene--${variant}`} aria-hidden="true">
    <div className="christmas-tree"><Tree /></div>
    <div className="christmas-gift christmas-gift--red"><Gift /></div>
    {variant !== "panel" && <div className="christmas-gift christmas-gift--gold"><Gift gold /></div>}
    <span className="christmas-snow christmas-snow--one">✦</span>
    <span className="christmas-snow christmas-snow--two">❄</span>
    {variant !== "panel" && <span className="christmas-snow christmas-snow--three">✧</span>}
  </div>;
}
