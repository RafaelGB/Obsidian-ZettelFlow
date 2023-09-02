import { c } from "architecture";
import React from "react";

export function LeafIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={c("icon")}
    >
      <g
        transform="translate(0.000000,24.000000) scale(0.100000,-0.100000)"
        fill="#000000"
        stroke="none"
      >
        <path
          d="M113 205 c-73 -31 -100 -86 -68 -132 10 -14 12 -24 5 -28 -13 -8 -13
-25 -1 -25 16 0 73 62 87 95 10 22 13 25 13 10 0 -11 -6 -31 -14 -45 -8 -14
-14 -31 -15 -37 0 -22 40 -14 67 13 22 22 25 32 20 70 -5 47 -30 94 -50 94 -6
-1 -27 -7 -44 -15z"
        />
      </g>
    </svg>
  );
}
