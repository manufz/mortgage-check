// Swiss number formats. Hand-rolled rather than toLocaleString(), which
// differs between the Worker and the browser and breaks hydration.

/** CHF 1'250'000 */
export function chf(n: number | null | undefined): string {
  if (n === null || n === undefined) {
    return "–";
  }
  const sign = n < 0 ? "-" : "";
  const digits = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `CHF ${sign}${digits}`;
}

/** 30.7% */
export function pct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** 2026-10-06 17:40 UTC */
export function utc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

/** Reads a File or Blob as base64 without the data: prefix. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
