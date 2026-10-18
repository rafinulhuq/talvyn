import { clsx } from "clsx";
import { ChevronDown, ChevronUp, CopyPlus, GripVertical, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cloneJson, moveItem, stringValue } from "@/lib/cms/jsonPath";
import type { JsonValue, JsonObject } from "@/types/cms";
import { FieldGrid, TextField } from "./basicFields";

export function RepeatableList<T extends JsonValue>({
  items,
  addLabel,
  emptyText,
  getTitle,
  onAdd,
  onMove,
  onDuplicate,
  onRemove,
  children,
}: {
  items: T[];
  addLabel: string;
  emptyText: string;
  getTitle: (item: T, index: number) => string;
  onAdd: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  children: (item: T, index: number) => ReactNode;
}) {
  const dragIndex = useRef<number | null>(null);
  // Items start collapsed to a title row; a newly added item opens for
  // editing. Reorder/duplicate/remove shift indexes, so collapse everything
  // rather than let the open state point at the wrong row.
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  // `items` is arbitrary JSON with no natural id, and rows are draggable/
  // reorderable, so React needs a stable key that isn't the array index —
  // otherwise reordering reassigns each row's DOM (and any in-progress
  // input state) to the wrong item. This shadow array mirrors every
  // move/duplicate/remove/add on `items` so index `i` always keeps the
  // same id across reorders.
  const [ids, setIds] = useState<string[]>(() => items.map(() => crypto.randomUUID()));

  function toggleItem(index: number) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const handleMove = (fromIndex: number, toIndex: number) => {
    setOpenItems(new Set());
    setIds((prev) => moveItem(prev, fromIndex, toIndex));
    onMove(fromIndex, toIndex);
  };

  const handleDuplicate = (index: number) => {
    setOpenItems(new Set());
    setIds((prev) => [...prev.slice(0, index + 1), crypto.randomUUID(), ...prev.slice(index + 1)]);
    onDuplicate(index);
  };

  const handleRemove = (index: number) => {
    setOpenItems(new Set());
    setIds((prev) => prev.filter((_, i) => i !== index));
    onRemove(index);
  };

  function handleAdd() {
    setOpenItems((prev) => new Set(prev).add(items.length));
    setIds((prev) => [...prev, crypto.randomUUID()]);
    onAdd();
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const open = openItems.has(index);
        return (
          <div
            key={ids[index]}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex.current !== null) handleMove(dragIndex.current, index);
              dragIndex.current = null;
            }}
            className="rounded-xl bg-white dark:bg-slate-900"
          >
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              className={clsx(
                "flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-3 py-2",
                open && "border-b border-slate-100 dark:border-slate-800"
              )}
              onClick={() => toggleItem(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleItem(index);
                }
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <GripVertical
                  className="h-4 w-4 shrink-0 cursor-grab text-slate-400 dark:text-slate-500"
                  onClick={(event) => event.stopPropagation()}
                />
                <ChevronDown
                  className={clsx(
                    "h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500 transition-transform",
                    open && "rotate-180"
                  )}
                />
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {getTitle(item, index)}
                </p>
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                onClick={(event) => event.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => handleMove(index, index - 1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => handleMove(index, index + 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Duplicate"
                  onClick={() => handleDuplicate(index)}
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={() => handleRemove(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {open && <div className="space-y-3 p-3">{children(item, index)}</div>}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          {emptyText}
        </div>
      )}
      <Button size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={handleAdd}>
        {addLabel}
      </Button>
    </div>
  );
}

export function StringListEditor({
  items,
  addLabel,
  emptyText,
  onChange,
}: {
  items: string[];
  addLabel: string;
  emptyText: string;
  onChange: (items: string[]) => void;
}) {
  return (
    <RepeatableList<string>
      items={items}
      addLabel={addLabel}
      emptyText={emptyText}
      getTitle={(item, index) => item || `Item ${index + 1}`}
      onAdd={() => onChange([...items, ""])}
      onMove={(from, to) => onChange(moveItem(items, from, to))}
      onDuplicate={(index) => onChange([...items.slice(0, index + 1), items[index], ...items.slice(index + 1)])}
      onRemove={(index) => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
    >
      {(item, index) => (
        <TextField
          label={`Item ${index + 1}`}
          value={item}
          onChange={(next) => onChange(items.map((current, itemIndex) => (itemIndex === index ? next : current)))}
        />
      )}
    </RepeatableList>
  );
}

export function LinkListEditor({
  items,
  addLabel,
  emptyText,
  onChange,
}: {
  items: JsonObject[];
  addLabel: string;
  emptyText: string;
  onChange: (items: JsonObject[]) => void;
}) {
  return (
    <RepeatableList<JsonObject>
      items={items}
      addLabel={addLabel}
      emptyText={emptyText}
      getTitle={(item, index) => stringValue(item.label, `Link ${index + 1}`)}
      onAdd={() => onChange([...items, { label: "", href: "" }])}
      onMove={(from, to) => onChange(moveItem(items, from, to))}
      onDuplicate={(index) => onChange([...items.slice(0, index + 1), cloneJson(items[index]), ...items.slice(index + 1)])}
      onRemove={(index) => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
    >
      {(item, index) => (
        <FieldGrid>
          <TextField label="Label" value={stringValue(item.label)} onChange={(value) => onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, label: value } : current)))} />
          <TextField label="Href" value={stringValue(item.href)} onChange={(value) => onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, href: value } : current)))} />
        </FieldGrid>
      )}
    </RepeatableList>
  );
}
