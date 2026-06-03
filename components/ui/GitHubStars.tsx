import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

export default function GitHubBadge() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/CristianOlivera1/openvid")
      .then((res) => res.json())
      .then((data) => setStars(data.stargazers_count))
      .catch(() => setStars(null));
  }, []);

  const formatStars = (count: number | null): string => {
    if (count === null) return "—";
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <a
      href="https://github.com/CristianOlivera1/openvid"
      target="_blank"
      rel="noopener noreferrer"
      className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-linear-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black font-semibold text-sm shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 select-none whitespace-nowrap"
      aria-label={`Repositorio de GitHub, ${stars ?? ""} estrellas`}
    >
      <div
        className="absolute -top-px left-4 right-4 h-px bg-linear-to-r from-transparent via-white/90 to-transparent z-10"
        aria-hidden="true"
      />

      <div
        className="absolute -right-px top-2 bottom-2 w-px bg-linear-to-b from-transparent via-white/60 to-transparent z-10"
        aria-hidden="true"
      />

      <Icon icon="mdi:github" width="20" height="20" className="text-black" />
      <div className="flex items-center gap-1 tracking-tight">
        <span>{formatStars(stars)}</span>
      </div>
    </a>
  );
}