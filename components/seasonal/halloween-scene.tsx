"use client";

import { useId } from "react";
import { useHalloween } from "./halloween-provider";

function Pumpkin() {
  const gradient = useId();
  return (
    <svg viewBox="0 0 200 180" fill="none">
      <defs>
        <linearGradient id={gradient} x1="50" y1="40" x2="150" y2="170" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd187" />
          <stop offset="0.45" stopColor="#ff983f" />
          <stop offset="1" stopColor="#c34d15" />
        </linearGradient>
      </defs>
      <path d="M91 51C94 36 84 28 87 15C99 17 112 25 109 47" fill="#859450" stroke="#536239" strokeWidth="4" strokeLinejoin="round" />
      <path d="M107 38C121 25 139 28 137 40C134 49 122 47 126 40" stroke="#859450" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="100" cy="106" rx="82" ry="63" fill={`url(#${gradient})`} />
      <ellipse cx="100" cy="106" rx="54" ry="65" fill={`url(#${gradient})`} stroke="#e67828" strokeWidth="2" />
      <ellipse cx="100" cy="106" rx="27" ry="64" fill={`url(#${gradient})`} stroke="#e67828" strokeWidth="2" />
      <path d="M52 95L72 73L82 98Z M118 98L128 73L148 95Z" fill="#352035" />
      <path d="M57 94L71 79L78 95Z M122 95L129 79L143 94Z" fill="#ffdf8a" />
      <path d="M95 104L101 94L108 104Z" fill="#352035" />
      <path d="M51 116Q100 143 149 116Q139 151 100 153Q62 151 51 116Z" fill="#352035" />
      <path d="M78 130V139H88V133 M111 133V142H122V130" fill="#ffbc65" />
      <path d="M38 76Q43 64 53 59" stroke="#ffe3aa" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function Ghost() {
  return (
    <svg viewBox="0 0 96 120" fill="none">
      <path d="M14 103V51A34 34 0 0 1 82 51V103L71 94L59 106L48 96L36 106L24 95Z" fill="#fff8ed" stroke="#e7d9f5" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="36" cy="54" rx="4" ry="7" fill="#352035" />
      <ellipse cx="60" cy="54" rx="4" ry="7" fill="#352035" />
      <path d="M42 70Q48 78 54 70" stroke="#352035" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="27" cy="67" rx="7" ry="4" fill="#ffc2bc" opacity="0.65" />
      <ellipse cx="69" cy="67" rx="7" ry="4" fill="#ffc2bc" opacity="0.65" />
    </svg>
  );
}

function Bat() {
  return (
    <svg viewBox="0 0 120 60" fill="currentColor">
      <path d="M49 28L50 13L58 21H62L70 13L71 28Q87 6 117 9Q97 21 107 39Q88 28 81 48Q68 40 60 55Q52 40 39 48Q32 28 13 39Q23 21 3 9Q33 6 49 28Z" />
    </svg>
  );
}

export function HalloweenScene({ variant }: { variant: "login" | "compact" | "panel" }) {
  const { enabled } = useHalloween();
  if (!enabled) return null;
  return (
    <div className={`halloween-scene halloween-scene--${variant}`} aria-hidden="true">
      {variant !== "panel" && <div className="halloween-pumpkin"><Pumpkin /></div>}
      <div className="halloween-ghost"><Ghost /></div>
      <div className="halloween-bat halloween-bat--one"><Bat /></div>
      <div className="halloween-bat halloween-bat--two"><Bat /></div>
      {variant === "login" && <>
        <span className="halloween-star halloween-star--one">✦</span>
        <span className="halloween-star halloween-star--two">✧</span>
        <span className="halloween-star halloween-star--three">✦</span>
      </>}
    </div>
  );
}
