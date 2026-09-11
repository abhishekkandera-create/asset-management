import type { AssetSpecs } from '@asset/shared';

/**
 * Model specifications are a free-form JSON blob, because a laptop and a
 * charger share no fields worth naming. That flexibility is right for the
 * schema and wrong for the screen: naively splitting `ramGb` gives "Ram gb",
 * and `1024` with no unit means nothing.
 *
 * So known keys get a proper label and unit. Anything unknown still renders —
 * a new key never disappears just because nobody added it here.
 */
const KNOWN_SPECS: Record<string, { label: string; unit?: string }> = {
  cpu: { label: 'Processor' },
  ramGb: { label: 'Memory', unit: 'GB' },
  storageGb: { label: 'Storage', unit: 'GB' },
  screenInches: { label: 'Screen', unit: '"' },
  os: { label: 'Operating system' },
  resolution: { label: 'Resolution' },
  panel: { label: 'Panel' },
  ports: { label: 'Ports' },
  power: { label: 'Power' },
  connector: { label: 'Connector' },
  connection: { label: 'Connection' },
  microphone: { label: 'Microphone' },
  wireless: { label: 'Wireless' },
  includes: { label: 'Includes' },
  weightKg: { label: 'Weight', unit: 'kg' },
  warrantyMonths: { label: 'Warranty', unit: 'months' },
  graphics: { label: 'Graphics' },
  batteryWh: { label: 'Battery', unit: 'Wh' },
};

/** Acronyms that should not be title-cased when a key is unknown. */
const ACRONYMS = new Set(['os', 'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'usb', 'id', 'ip', 'mac']);

export interface FormattedSpec {
  key: string;
  label: string;
  value: string;
}

export function specLabel(key: string): string {
  const known = KNOWN_SPECS[key];
  if (known) return known.label;

  // `screenInches` -> `Screen inches`, but `os` -> `OS`.
  const words = key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(/\s+/);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      return lower;
    })
    .join(' ');
}

export function specValue(key: string, value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const unit = KNOWN_SPECS[key]?.unit;
  if (unit === undefined) return String(value);

  // 1024 GB is a terabyte, and everyone thinks of it that way.
  if (key === 'storageGb' && typeof value === 'number' && value >= 1024 && value % 1024 === 0) {
    return `${value / 1024} TB`;
  }

  // A screen size reads as 14", not 14 ".
  return unit === '"' ? `${value}"` : `${value} ${unit}`;
}

/**
 * Known specs first, in the order declared above, so every laptop lists its
 * processor before its screen size. Unknown keys follow alphabetically.
 */
export function formatSpecs(specs: AssetSpecs | undefined | null): FormattedSpec[] {
  if (!specs) return [];

  const order = Object.keys(KNOWN_SPECS);
  const entries = Object.entries(specs).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );

  return entries
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([key, value]) => ({
      key,
      label: specLabel(key),
      value: specValue(key, value),
    }));
}

/** A one-line summary for a table cell or a picker option. */
export function specSummary(specs: AssetSpecs | undefined | null, max = 3): string {
  const formatted = formatSpecs(specs);
  if (formatted.length === 0) return '';
  return formatted
    .slice(0, max)
    .map((spec) => spec.value)
    .join(' · ');
}
