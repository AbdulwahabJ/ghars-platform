export function PageBackgroundDecorations() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 z-0 h-full w-screen -translate-x-1/2 overflow-hidden print:hidden"
    >
      <div className="absolute left-[-10rem] top-[8rem] hidden h-[34rem] w-[34rem] rounded-full bg-cyan-300/20 blur-3xl md:block" />
      <div className="absolute right-[-11rem] top-[24rem] hidden h-[38rem] w-[38rem] rounded-full bg-blue-300/15 blur-3xl md:block" />

      <svg
        className="absolute left-[-10rem] top-[7rem] hidden h-[34rem] w-[34rem] opacity-90 md:block"
        viewBox="0 0 560 620"
        fill="none"
      >
        <defs>
          <linearGradient id="page-left-orbit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f766e" stopOpacity="0.05" />
            <stop offset="0.5" stopColor="#1fa9b8" stopOpacity="0.34" />
            <stop offset="1" stopColor="#172b62" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <ellipse
          cx="245"
          cy="300"
          rx="230"
          ry="150"
          transform="rotate(-28 245 300)"
          stroke="url(#page-left-orbit)"
          strokeWidth="2"
        />
        <ellipse
          cx="245"
          cy="300"
          rx="180"
          ry="112"
          transform="rotate(34 245 300)"
          stroke="#1fa9b8"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
        <path
          d="M-18 470C80 390 120 262 218 224C303 190 357 248 446 190C491 161 526 113 575 42"
          stroke="#173e68"
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
        <path
          d="M-24 180C94 237 148 147 241 125C331 104 382 175 461 250C505 291 535 332 578 348"
          stroke="#1fa9b8"
          strokeOpacity="0.26"
          strokeWidth="1.5"
        />
        <path d="M56 390L176 308L292 344L415 254" stroke="#1fa9b8" strokeOpacity="0.18" />
        <path d="M176 308L218 224L331 175L415 254" stroke="#173e68" strokeOpacity="0.14" />
        <g fill="#1fa9b8">
          <circle cx="56" cy="390" r="5" fillOpacity="0.42" />
          <circle cx="176" cy="308" r="6" fillOpacity="0.56" />
          <circle cx="292" cy="344" r="4" fillOpacity="0.34" />
          <circle cx="415" cy="254" r="7" fillOpacity="0.48" />
          <circle cx="218" cy="224" r="4" fillOpacity="0.36" />
        </g>
        <g fill="#173e68">
          <circle cx="331" cy="175" r="4" fillOpacity="0.28" />
          <circle cx="461" cy="250" r="3" fillOpacity="0.3" />
        </g>
      </svg>

      <svg
        className="absolute right-[-11rem] top-[22rem] hidden h-[38rem] w-[38rem] opacity-90 md:block"
        viewBox="0 0 620 680"
        fill="none"
      >
        <defs>
          <radialGradient id="page-right-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1fa9b8" stopOpacity="0.18" />
            <stop offset="1" stopColor="#1fa9b8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="340" cy="310" r="180" fill="url(#page-right-glow)" />
        <circle
          cx="350"
          cy="310"
          r="238"
          stroke="#173e68"
          strokeOpacity="0.18"
          strokeWidth="2"
          strokeDasharray="18 15"
        />
        <ellipse
          cx="350"
          cy="310"
          rx="238"
          ry="120"
          transform="rotate(-38 350 310)"
          stroke="#1fa9b8"
          strokeOpacity="0.3"
          strokeWidth="2"
        />
        <ellipse
          cx="350"
          cy="310"
          rx="178"
          ry="92"
          transform="rotate(42 350 310)"
          stroke="#0f766e"
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />
        <path d="M110 460L240 384L358 430L488 319L581 260" stroke="#1fa9b8" strokeOpacity="0.22" />
        <path d="M240 384L286 236L410 192L488 319" stroke="#173e68" strokeOpacity="0.16" />
        <path d="M286 236L190 164M410 192L521 126M358 430L410 528" stroke="#1fa9b8" strokeOpacity="0.16" />
        <g fill="#1fa9b8">
          <circle cx="110" cy="460" r="5" fillOpacity="0.38" />
          <circle cx="240" cy="384" r="7" fillOpacity="0.55" />
          <circle cx="358" cy="430" r="4" fillOpacity="0.34" />
          <circle cx="488" cy="319" r="6" fillOpacity="0.5" />
          <circle cx="581" cy="260" r="4" fillOpacity="0.35" />
        </g>
        <g fill="#173e68">
          <circle cx="286" cy="236" r="5" fillOpacity="0.3" />
          <circle cx="410" cy="192" r="4" fillOpacity="0.32" />
          <circle cx="521" cy="126" r="3" fillOpacity="0.28" />
        </g>
      </svg>

      <div className="absolute left-4 top-[15rem] h-16 w-16 rounded-full border border-cyan-500/20 md:hidden" />
      <div className="absolute right-4 top-[32rem] h-20 w-20 rounded-full border border-blue-500/15 md:hidden" />
    </div>
  );
}