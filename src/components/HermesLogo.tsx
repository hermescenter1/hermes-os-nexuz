export function HermesLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="16" cy="16" r="13.5" stroke="#2DD4BF" strokeWidth="1" opacity="0.55" />
      {/* Globe meridian ellipse */}
      <ellipse cx="16" cy="16" rx="6" ry="13.5" stroke="#2DD4BF" strokeWidth="0.6" opacity="0.22" />
      {/* Globe equator */}
      <line x1="2.5" y1="16" x2="29.5" y2="16" stroke="#2DD4BF" strokeWidth="0.6" opacity="0.18" />
      {/* Circuit nodes at cardinal points */}
      <circle cx="16" cy="2.5" r="1.3" fill="#2DD4BF" opacity="0.75" />
      <circle cx="29.5" cy="16" r="1.3" fill="#2DD4BF" opacity="0.75" />
      <circle cx="16" cy="29.5" r="1.3" fill="#2DD4BF" opacity="0.75" />
      <circle cx="2.5" cy="16" r="1.3" fill="#2DD4BF" opacity="0.75" />
      {/* H letterform — bold, industrial, centered */}
      <path
        d="M10 10.5v11M22 10.5v11M10 16h12"
        stroke="#E8F4FF"
        strokeWidth="2.3"
        strokeLinecap="square"
      />
    </svg>
  );
}
