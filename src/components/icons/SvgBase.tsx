import { c } from "architecture";
import React, { FC, ReactNode } from "react";

type IconBaseProps = {
  children: ReactNode;
};

const SvgBase: FC<IconBaseProps> = ({ children }) => {
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
      {children}
    </svg>
  );
};

export default SvgBase;
