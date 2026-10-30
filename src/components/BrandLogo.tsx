type Props = { size?: "sm" | "md" | "lg"; showText?: boolean; className?: string };

const sizes = { sm: { icon: 24, text: "text-base" }, md: { icon: 28, text: "text-lg" }, lg: { icon: 36, text: "text-2xl" } };

/** EasyHouseHunt logo: roof over a magnifying lens + wordmark. Designed for dark backgrounds. */
export default function BrandLogo({ size = "md", showText = true, className = "" }: Props) {
  const s = sizes[size];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="EasyHouseHunt">
      <svg width={s.icon} height={s.icon} viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 30 L32 11 L54 30" fill="none" stroke="#F8FAFC" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="30" cy="37" r="11" fill="none" stroke="#EA580C" strokeWidth="6" />
        <path d="M38.5 45.5 L50 57" stroke="#EA580C" strokeWidth="6.5" strokeLinecap="round" />
      </svg>
      {showText && (
        <span className={`${s.text} font-extrabold tracking-tight text-white leading-none`}>
          EasyHouse<span className="text-[#EA580C]">Hunt</span>
        </span>
      )}
    </span>
  );
}
