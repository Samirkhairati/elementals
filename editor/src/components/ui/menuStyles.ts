// One look for every menu: right-click menus (context-menu.tsx) and dropdowns (dropdown-menu.tsx) share these classes,
// so a menu in a panel, on the canvas or in the toolbar has the same rows, icons, gaps and separators.
// Icons placed directly in an item are sized and spaced here: write `<Icon />`, not `<Icon className="mr-2 h-3.5 w-3.5" />`
// (a colour class is fine).

const panel =
  'z-50 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'

const row =
  'relative flex min-h-[28px] cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-ed-body outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0'

export const menuClass = {
  content: `${panel} min-w-[11rem]`,
  subContent: `${panel} min-w-[10rem]`,
  item: row,
  subTrigger: `${row} data-[state=open]:bg-accent data-[state=open]:text-accent-foreground`,
  /** The chevron at the end of a submenu row. */
  subChevron: 'ml-auto !size-3.5 text-muted-foreground',
  /** Checkbox / radio rows: the mark sits in the left gutter, the label lines up with icon rows. */
  checkItem: `${row} pl-7`,
  indicator: 'absolute left-2 flex size-3.5 items-center justify-center',
  inset: 'pl-7',
  /** Delete and other actions that lose work. */
  destructive: 'text-red-400 focus:bg-red-500/10 focus:text-red-400',
  label: 'px-2 pb-1 pt-1.5 text-ed-label font-semibold uppercase tracking-wide text-muted-foreground',
  separator: '-mx-1 my-1 h-px bg-border',
  shortcut: 'ml-auto pl-3 text-ed-label tracking-wide text-muted-foreground',
} as const
