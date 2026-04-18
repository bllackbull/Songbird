import { Check, Bookmark, Megaphone, Users } from "../../icons/lucide.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { hasPersian } from "../../utils/fontUtils.js";
import Avatar from "../common/Avatar.jsx";

function ForwardChatGlyph({ kind }) {
  if (kind === "saved") return <Bookmark size={18} className="text-white" />;
  return null;
}

function ForwardChatKindIcon({ kind }) {
  if (kind === "channel") {
    return <Megaphone size={13} className="shrink-0 text-emerald-500" />;
  }
  if (kind === "group") {
    return <Users size={13} className="shrink-0 text-emerald-500" />;
  }
  return null;
}

export default function ForwardChatGridItem({
  title,
  avatarUrl,
  color,
  kind,
  initialsSource,
  selected,
  onClick,
}) {
  const initials = getAvatarInitials(initialsSource || title);
  const titleHasPersian = hasPersian(title);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-transparent px-1.5 py-2.5 text-center transition hover:bg-black/5 dark:hover:bg-white/5"
    >
      <span
        className={`relative flex h-[4.15rem] w-[4.15rem] items-center justify-center rounded-full border-[4px] transition ${
          selected
            ? "border-emerald-500 bg-emerald-500/8"
            : "border-transparent bg-transparent p-0"
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-full ${selected ? "h-[3.3rem] w-[3.3rem]" : "h-full w-full"}`}
        >
          <Avatar
            src={avatarUrl}
            alt={title}
            name={title}
            color={color || "#10b981"}
            initials={initials}
            placeholderContent={
              kind === "saved" ? <ForwardChatGlyph kind={kind} /> : initials
            }
            className="h-full w-full text-[1.05rem] font-semibold"
            style={{ unicodeBidi: "plaintext" }}
          />
        </span>
        {selected ? (
          <span className="absolute bottom-0 right-0 inline-flex h-[1.2rem] w-[1.2rem] items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <Check size={11} strokeWidth={3.25} />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 max-w-full items-center gap-1">
        <ForwardChatKindIcon kind={kind} />
        <span
          className={`block min-w-0 max-w-full truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${
            titleHasPersian ? "font-fa" : ""
          }`}
          dir="auto"
          title={title}
          style={{ unicodeBidi: "plaintext" }}
        >
          {title}
        </span>
      </span>
    </button>
  );
}
