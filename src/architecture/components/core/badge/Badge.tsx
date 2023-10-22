import React from "react";
import { BadgeType } from "./typing";

export function Badge(props: BadgeType) {
  const { children, content } = props;
  return (
    <div className="badge">
      {children}
      {content && <span>{content}</span>}
    </div>
  );
}
