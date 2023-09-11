import React from "react";
import { BadgeModel } from "./model/BadgeModel";

export function Badge(props: BadgeModel) {
  const { children, content } = props;
  return (
    <div className="badge">
      {children}
      {content && <span>{content}</span>}
    </div>
  );
}
