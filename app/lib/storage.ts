/**
 * Off-chain, browser-local storage for option labels.
 *
 * The on-chain `Proposal` only stores a title and an option count — not the
 * option names — so labels are kept here purely for display. If no labels are
 * stored for a poll, the UI falls back to "Option 1…N".
 */

const LABELS_KEY = "zkc-voter:option-labels";

function readAll(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LABELS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function saveOptionLabels(address: string, labels: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const all = readAll();
    all[address] = labels;
    window.localStorage.setItem(LABELS_KEY, JSON.stringify(all));
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function loadOptionLabels(address: string): string[] | null {
  const value = readAll()[address];
  return Array.isArray(value) ? value : null;
}

/** Labels to display, falling back to "Option N" when none are stored. */
export function getDisplayLabels(
  address: string,
  optionsCount: number
): string[] {
  const saved = loadOptionLabels(address);
  return Array.from({ length: optionsCount }, (_, index) => {
    const label = saved?.[index]?.trim();
    return label ? label : `Option ${index + 1}`;
  });
}
