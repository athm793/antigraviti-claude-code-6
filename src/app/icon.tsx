import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon: the brand mark turned 45 degrees so it fills the square, dark on
 * brand teal for contrast against both light and dark browser chrome.
 *
 * The app previously shipped no icon at all, so a tab fell back to Next's
 * default globe. Identical to the marketing site's icon route — a user with
 * the dashboard and the site open should see the same tab icon on both.
 *
 * The amber bit darkens here. On teal, the amber used elsewhere sits at nearly
 * the same luminance as its background and the bit disappears; a deep gold
 * keeps the cut visible at 16px, which is the whole point of having it.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
<g transform="rotate(-45 24 24) translate(0 9)">
<circle cx="11" cy="15" r="7.6" stroke="#08080f" stroke-width="5.4"/>
<rect x="17" y="12.3" width="28" height="5.4" rx="2.7" fill="#08080f"/>
<rect x="25.6" y="17.7" width="5" height="6.4" rx="2.4" fill="#08080f"/>
<rect x="33.2" y="17.7" width="5" height="8.6" rx="2.4" fill="#6d5000"/>
<rect x="40.8" y="17.7" width="4.2" height="5.2" rx="2.1" fill="#08080f"/>
</g></svg>`;

export default function Icon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00c4b4",
          borderRadius: 7,
        }}
      >
        {/* Satori, not the browser: `img` is the element it rasterises. */}
        <img src={src} width={28} height={28} alt="" />
      </div>
    ),
    size
  );
}
