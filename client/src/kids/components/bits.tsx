import { Avatar } from "../types";

const AVATAR_EMOJI: Record<Avatar, string> = {
  fox: "🦊",
  owl: "🦉",
  cat: "🐱",
  robot: "🤖",
  rocket: "🚀",
  dino: "🦖",
  unicorn: "🦄",
  panda: "🐼",
};

export function AvatarIcon({ avatar, size = "md" }: { avatar: Avatar; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`kid-avatar kid-avatar-${size}`} role="img" aria-label={avatar}>
      {AVATAR_EMOJI[avatar] ?? "🙂"}
    </span>
  );
}

export function Stars({ count, max = 3, label }: { count: number; max?: number; label?: string }) {
  return (
    <span className="kid-stars" role="img" aria-label={label ?? `${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? "star on" : "star"} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export function avatarEmoji(avatar: Avatar) {
  return AVATAR_EMOJI[avatar] ?? "🙂";
}
