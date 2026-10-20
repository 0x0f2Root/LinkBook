
import { ImageIcon, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DashboardButton, DashboardPopover, DashboardPopoverContent, DashboardPopoverTrigger } from "@/components/block/dashboard-shell";
import { fetchPreview, hostname, imageSrc, parseTags, type Bookmark, type Category, type LinkPreview } from "@/lib/bookmarks";
import { isHttpUrl } from "@/shared/ipc";

export type BookmarkDraft = Pick<Bookmark, "url" | "title" | "description" | "image" | "categoryId" | "tags" | "previewFetched">;

/** Accepts "example.com" as well as full URLs. Null until it looks like a link. */
function toFullUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

export const fieldClassName =
  "h-8 w-full rounded-md bg-(--obsidian-dashboard-shell-control) px-2.5 text-xs text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-control-shadow) outline-none placeholder:text-(--obsidian-dashboard-shell-text-subtle) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)";

type BookmarkFormPopoverProps = {
  /** The button that opens the form. */
  children: ReactNode;
  categories: Category[];
  /** Existing bookmark to edit. Without it the form adds a new one. */
  bookmark?: Bookmark;
  defaultCategoryId?: string;
  onSubmit: (draft: BookmarkDraft) => void;
  align?: "start" | "center" | "end";
};

export function BookmarkFormPopover({ children, categories, bookmark, defaultCategoryId, onSubmit, align = "end" }: BookmarkFormPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <DashboardPopover open={open} onOpenChange={setOpen}>
      <DashboardPopoverTrigger asChild>{children}</DashboardPopoverTrigger>
      <DashboardPopoverContent align={align} className="w-[min(320px,calc(100vw-2rem))] p-3">
        {/* Remounts on every open, so the fields start from the bookmark again. */}
        {open && (
          <BookmarkForm
            categories={categories}
            bookmark={bookmark}
            defaultCategoryId={defaultCategoryId}
            onCancel={() => setOpen(false)}
            onSubmit={(draft) => {
              onSubmit(draft);
              setOpen(false);
            }}
          />
        )}
      </DashboardPopoverContent>
    </DashboardPopover>
  );
}

type BookmarkFormProps = Omit<BookmarkFormPopoverProps, "children" | "align"> & { onCancel: () => void };

function BookmarkForm({ categories, bookmark, defaultCategoryId, onSubmit, onCancel }: BookmarkFormProps) {
  const id = useId();
  const [url, setUrl] = useState(bookmark?.url ?? "");
  const [title, setTitle] = useState(bookmark?.title ?? "");
  const [description, setDescription] = useState(bookmark?.description ?? "");
  const [image, setImage] = useState(bookmark?.image ?? "");
  const [categoryId, setCategoryId] = useState(bookmark?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [tags, setTags] = useState(bookmark?.tags.join(", ") ?? "");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "found" | "none">("idle");
  // What the last preview filled in, so a field is replaced only while it still holds that value.
  const autofilled = useRef<LinkPreview>({});

  const fullUrl = toFullUrl(url);
  const lookupUrl = fullUrl && fullUrl !== bookmark?.url ? fullUrl : null;

  useEffect(() => {
    if (!lookupUrl) return;
    let cancelled = false;
    // Waits for the paste or typing to settle before asking the server.
    const timer = window.setTimeout(() => {
      setPreviewStatus("loading");
      fetchPreview(lookupUrl, { priority: true }).then((preview) => {
        if (cancelled) return;
        if (!preview || (!preview.title && !preview.image && !preview.description)) return setPreviewStatus("none");
        const fill = (current: string, previous: string | undefined, next: string | undefined, set: (value: string) => void) => {
          if (next && (!current.trim() || current === previous)) set(next);
        };
        fill(title, autofilled.current.title, preview.title, setTitle);
        fill(description, autofilled.current.description, preview.description, setDescription);
        fill(image, autofilled.current.image, preview.image, setImage);
        autofilled.current = preview;
        setPreviewStatus("found");
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Only a new URL starts a lookup; the fields are read at the moment it answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupUrl]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullUrl) return;
    onSubmit({
      url: fullUrl,
      title: title.trim() || hostname(fullUrl),
      description: description.trim() || undefined,
      image: image.trim() || undefined,
      categoryId,
      tags: parseTags(tags),
      // A preview that answered already counts; otherwise the board looks it up after saving.
      previewFetched: previewStatus === "found" || previewStatus === "none" ? true : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-[11px] font-medium uppercase leading-none tracking-[1px] text-(--obsidian-dashboard-shell-text-subtle)">
        {bookmark ? "Edit bookmark" : "New bookmark"}
      </p>
      <Field label="URL" htmlFor={`${id}-url`}>
        <input
          id={`${id}-url`}
          required
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a link"
          inputMode="url"
          aria-describedby={`${id}-preview-status`}
          className={fieldClassName}
        />
      </Field>
      <div className="flex items-center gap-2.5">
        <div className="flex aspect-[16/9] w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--obsidian-dashboard-shell-muted)">
          {isHttpUrl(image.trim()) ? (
            // Through the main process like every other image; the window loads nothing from other sites itself.
            <img src={imageSrc(image.trim(), 320)} alt="" className="size-full object-cover" />
          ) : previewStatus === "loading" ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin text-(--obsidian-dashboard-shell-text-subtle)" />
          ) : (
            <ImageIcon aria-hidden className="size-4 text-(--obsidian-dashboard-shell-text-subtle)" />
          )}
        </div>
        <p id={`${id}-preview-status`} role="status" className="text-[11px] leading-snug text-(--obsidian-dashboard-shell-text-subtle)">
          {previewStatus === "loading"
            ? "Reading the page…"
            : previewStatus === "found"
              ? image.trim()
                ? "Preview found. Edit anything below."
                : "No image on this page, so the card uses the site icon."
              : previewStatus === "none"
                ? "This site doesn't share a preview. Fill it in below, or leave it."
                : "Paste a link and the title and image fill in."}
        </p>
      </div>
      <Field label="Title" htmlFor={`${id}-title`}>
        <input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Defaults to the site name" className={fieldClassName} />
      </Field>
      <Field label="Description" htmlFor={`${id}-description`}>
        <textarea
          id={`${id}-description`}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={`${fieldClassName} h-auto resize-none py-2`}
        />
      </Field>
      <Field label="Preview image URL" htmlFor={`${id}-image`}>
        <input id={`${id}-image`} type="url" value={image} onChange={(event) => setImage(event.target.value)} placeholder="Optional" className={fieldClassName} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category" htmlFor={`${id}-category`}>
          <select id={`${id}-category`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={fieldClassName}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags" htmlFor={`${id}-tags`}>
          <input id={`${id}-tags`} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="react, docs" className={fieldClassName} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <DashboardButton variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </DashboardButton>
        <DashboardButton variant="primary" size="sm" type="submit" disabled={!fullUrl || !categoryId}>
          {bookmark ? "Save" : "Add bookmark"}
        </DashboardButton>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs text-(--obsidian-dashboard-shell-text-muted)">
        {label}
      </label>
      {children}
    </div>
  );
}
