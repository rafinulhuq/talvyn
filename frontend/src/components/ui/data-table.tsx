"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Table, TD, TH, THead, TR } from "./table";

// Stable, module-scope feature registry (TanStack Table v9 requirement):
// client-side sorting + row selection. Add features here as screens need them.
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowSelectionFeature,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumn<T extends object> = ColumnDef<DataTableFeatures, T, never>;

export function dataTableColumns<T extends object>() {
  return createColumnHelper<DataTableFeatures, T>();
}

// Native input on purpose: TanStack's selection handler reads
// `event.target.checked` (and Shift for range selection). Radix's checkbox is a
// <button> with no `checked`, which would break Shift-click ranges.
function RowCheckbox({ indeterminate = false, ...props }: ComponentProps<"input"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="size-4 cursor-pointer align-middle accent-[var(--accent)]" {...props} />;
}

export function DataTable<T extends object>({
  columns,
  data,
  getRowId,
  selectable = false,
  onRowClick,
  bulkActions,
  empty,
  label,
}: {
  // Columns come from dataTableColumns<T>().columns([...]); keep them stable (module scope or memo).
  columns: ReturnType<ReturnType<typeof dataTableColumns<T>>["columns"]>;
  data: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  onRowClick?: (row: T) => void;
  /** Rendered in the selection bar when rows are selected. Receives the selected ids. */
  bulkActions?: (selectedIds: string[]) => ReactNode;
  empty?: ReactNode;
  /** Accessible name for the table. */
  label: string;
}) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    enableRowSelection: selectable,
  });

  const rows = table.getRowModel().rows;
  const selectedIds = useMemo(() => Object.keys(table.state.rowSelection ?? {}), [table.state.rowSelection]);

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      {selectable && selectedIds.length > 0 && bulkActions && (
        <div className="flex h-11 items-center gap-3 border-b border-line bg-accent-soft/50 px-4 animate-fade-in">
          <span className="text-base font-medium text-ink">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">{bulkActions(selectedIds)}</div>
          <button
            type="button"
            className="ml-auto text-sm text-ink-muted hover:text-ink"
            onClick={() => table.resetRowSelection()}
          >
            Clear selection
          </button>
        </div>
      )}
      <Table aria-label={label}>
        <THead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {selectable && (
                <TH className="w-10">
                  <RowCheckbox
                    aria-label="Select all rows"
                    checked={table.getIsAllRowsSelected()}
                    indeterminate={table.getIsSomeRowsSelected()}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </TH>
              )}
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <TH
                    key={header.id}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn("-ml-1 inline-flex items-center gap-1 rounded-control px-1 hover:text-ink", sorted && "text-ink")}
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <ArrowUp aria-hidden className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ArrowDown aria-hidden className="size-3.5" />
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TH>
                );
              })}
            </tr>
          ))}
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <TR
                key={row.id}
                data-selected={row.getIsSelected() || undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {selectable && (
                  <TD className="w-10" onClick={(e) => e.stopPropagation()}>
                    <RowCheckbox
                      aria-label="Select row"
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                    />
                  </TD>
                )}
                {row.getAllCells().map((cell) => (
                  <TD key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TD>
                ))}
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
