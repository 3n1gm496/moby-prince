export default function AnchorAvatar({ size = "sm" }) {
  const dim = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <div
      className={`flex-shrink-0 ${dim} rounded-full bg-surface-raised border border-border
                  flex items-center justify-center`}
    >
      <svg
        className={`${icon} text-accent`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="5" r="3" />
        <line x1="12" y1="22" x2="12" y2="8" />
        <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      </svg>
    </div>
  );
}
