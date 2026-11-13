"use client";

// A day's note: a textarea plus a small emoji picker, because a desktop
// keyboard has no emoji key. The picked emoji goes in at the cursor.
import { useEffect, useRef, useState } from "react";

// A short list that fits challenge posts. No library, to keep the page light.
const EMOJIS = [
  ..."✅ 🔥 🚀 💪 🎯 📈 ⭐ 🏆".split(" "),
  ..."🎉 🙌 👏 ✨ 🥳 💯 🏁 🎁".split(" "),
  ..."💻 🛠️ 🐛 📦 🧪 📝 📚 💡".split(" "),
  ..."😀 😅 😎 🤔 😴 🤯 😤 🥲".split(" "),
  ..."☕ 🏃 🧘 🥗 💧 🎨 🎸 🌱".split(" "),
  ..."❤️ 👍 👀 🙏 ⏰ 📅 ➡️ ⚠️".split(" "),
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
};

export default function NoteField({ value, onChange, label, placeholder, disabled }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const touched = useRef(false); // has the user placed a cursor in the textarea yet?
  const caret = useRef<number | null>(null); // where the cursor goes after an insert
  const [open, setOpen] = useState(false);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Runs after React has written the new text: put the cursor after the emoji.
  useEffect(() => {
    if (caret.current === null) return;
    area.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  function insert(emoji: string, byKeyboard: boolean) {
    const el = area.current;
    // Before the first focus there is no real cursor, so add to the end.
    const start = touched.current && el ? el.selectionStart : value.length;
    const end = touched.current && el ? el.selectionEnd : value.length;
    caret.current = start + emoji.length;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    // Mouse users go back to typing. Keyboard users stay in the picker to add more.
    if (!byKeyboard) el?.focus();
  }

  // Stops a mouse click from taking focus (and the cursor) out of the textarea.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div ref={box} className="relative">
      <textarea
        ref={area}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (touched.current = true)}
        disabled={disabled}
        rows={2}
        aria-label={label}
        placeholder={placeholder}
        className="block w-full rounded-md border bg-transparent py-2 pl-3 pr-11 text-sm disabled:opacity-60"
      />
      {!disabled && (
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => setOpen((o) => !o)}
          aria-label="Add emoji"
          aria-expanded={open}
          title="Add emoji"
          className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-base transition hover:bg-black/10 hover:opacity-100 hover:grayscale-0 dark:hover:bg-white/15 ${
            open ? "bg-black/10 dark:bg-white/15" : "opacity-60 grayscale"
          }`}
        >
          😊
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Pick an emoji"
          className="absolute right-0 top-full z-20 mt-1 w-[17rem] rounded-xl border bg-[var(--background)] p-2 shadow-lg"
        >
          <div className="grid grid-cols-8">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onMouseDown={keepFocus}
                onClick={(e) => insert(emoji, e.detail === 0)}
                className="flex h-8 items-center justify-center rounded-md text-lg hover:bg-black/10 dark:hover:bg-white/15"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
