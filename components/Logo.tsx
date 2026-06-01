import React from "react";
import logo from "../logo.png";

/**
 * Brand mark from logo.png ,  the artwork sits slightly high-left inside the square canvas,
 * so a small translate optically centers the glyph in UI boxes (plain flex center looks off).
 */
const Logo: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => {
  const optical =
    style?.transform == null
      ? ({ transform: "translate(6%, 5%)" } as React.CSSProperties)
      : {};
  return (
    <img
      src={logo}
      alt=""
      width={256}
      height={256}
      decoding="async"
      draggable={false}
      className={[className, "block object-contain object-center select-none"].filter(Boolean).join(" ")}
      style={{ objectPosition: "center", ...optical, ...style }}
    />
  );
};

export default Logo;