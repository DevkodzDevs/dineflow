/**
 * The keyboard, one table for the whole shell (`Keys.tsx` reads it, and its `?` sheet prints it).
 *
 * Everywhere: Ctrl/⌘ K opens Go to; `?` lists the keys; `G` then a letter goes to a section; `N` starts a new
 * order. On a list (`items`): ↑ ↓ (or J K, and ← → on a grid) move a highlight down the screen's own items,
 * Enter opens the highlighted one, Esc lets go; `/` jumps to the screen's search (`search`). `Ctrl Enter`
 * presses the button marked `data-kbd-primary` (the bill's Generate / Mark paid). Screens that already have
 * their own keys say so in `hints` and keep them (the till, the kitchen).
 *
 * `items` is a CSS selector for the things to step through; `open` is what Enter presses inside one (absent:
 * the item itself if it is a link or a button, else its first link or button).
 */
export type Screen = {
  match: (path: string) => boolean;
  title: string;
  items?: string;
  open?: string;
  search?: string;
  hints?: [string, string][];
};

/** `G` + letter → section. Shown only when this person may open it (`module` from modulesFor, or always; `owner`: the owner's alone). */
export const GO: { key: string; href: string; label: string; module?: string; owner?: true; grant?: string }[] = [
  { key: "d", href: "/dashboard", label: "Control room", module: "dashboard" },
  { key: "r", href: "/reservations", label: "Reservations", module: "reservations" },
  { key: "p", href: "/pulse", label: "Pulse", module: "pulse" },
  { key: "o", href: "/orders", label: "Orders", module: "orders" },
  { key: "n", href: "/orders/new", label: "New order", module: "orders" },
  { key: "l", href: "/online-orders", label: "Online orders", module: "online-orders" },
  { key: "c", href: "/customers", label: "Customers", module: "customers" },
  { key: "k", href: "/kitchen", label: "Kitchen", module: "kitchen" },
  { key: "b", href: "/billing", label: "Billing", module: "billing" },
  { key: "m", href: "/menu", label: "Menu", module: "menu" },
  { key: "i", href: "/inventory", label: "Pantry", module: "inventory" },
  { key: "t", href: "/reports", label: "Reports", module: "reports", grant: "reports" },
  { key: "x", href: "/connections", label: "Connections", grant: "connections" },
  { key: "s", href: "/settings", label: "Settings", module: "settings" },
  { key: "f", href: "/voice", label: "Feedback & complaints" },
  { key: "h", href: "/help", label: "Help & support", owner: true },
];

const LIST: [string, string][] = [["↑ ↓", "move through the list"], ["Enter", "open the highlighted one"], ["Esc", "let go"]];

export const SCREENS: Screen[] = [
  { match: (p) => p === "/orders/new", title: "Till", items: "main [data-tile]", open: ".more",
    hints: [["/", "search dishes"], ["↑ ↓ ← →", "move between dishes"], ["Enter", "add highlighted dish"],
      ["Backspace", "take one off it"], ["Ctrl Enter", "send to the kitchen"]] },
  { match: (p) => /^\/orders\/[^/]+$/.test(p), title: "Order", hints: [["G B", "go to Billing"]] },
  { match: (p) => p === "/orders", title: "Orders", items: "main a[href^='/orders/']:not([href='/orders/new'])", hints: [...LIST, ["N", "new order"]] },
  { match: (p) => p === "/kitchen", title: "Kitchen", hints: [["1 – 9", "move ticket on"], ["R", "recall last served"]] },
  { match: (p) => /^\/billing\/[^/]+$/.test(p), title: "Bill", hints: [["Ctrl Enter", "bill, or mark paid"]] },
  { match: (p) => p === "/billing", title: "Billing", items: "main a[href^='/billing/']", hints: LIST },
  { match: (p) => p === "/reservations", title: "Reservations", items: "main [data-res]", hints: [...LIST, ["[  ]", "the day before / after"]] },
  { match: (p) => p === "/pulse", title: "Pulse", items: "main [data-table]", hints: LIST },
  { match: (p) => p === "/online-orders", title: "Online orders", items: "main [data-online]", hints: LIST },
  { match: (p) => p === "/customers", title: "Customers", items: "main [data-customer]", open: "[data-open-customer]", search: "main input[placeholder='Name or phone']", hints: [["/", "search name or phone"], ...LIST] },
  { match: (p) => p === "/menu", title: "Menu", items: "main [data-dish]", open: "button[aria-label^='Edit']", hints: [["↑ ↓ ← →", "move between dishes"], ["Enter", "edit the highlighted dish"], ["Esc", "let go"]] },
  { match: (p) => p === "/inventory", title: "Pantry", items: "main [data-ing]", open: "button[aria-label='Edit']", search: "main [data-pantry-search] input", hints: [["/", "find an item"], ["↑ ↓ ← →", "move through the pantry"], ["Enter", "edit the highlighted item"], ["Esc", "let go"]] },
];

export const screenFor = (path: string) => SCREENS.find((s) => s.match(path)) ?? null;
