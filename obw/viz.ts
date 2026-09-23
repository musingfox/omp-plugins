type Exec = (command: string, args: string[], options?: { timeout?: number }) => Promise<unknown>;

function stdout(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "stdout" in value && typeof value.stdout === "string") return value.stdout;
  return "";
}

/** Discover and invoke viz only when its executable is present; absent viz is a no-op. */
export async function openCardInViz(cardMarkdown: string, exec: Exec): Promise<{ available: boolean; opened: boolean; error?: string }> {
  try {
    const found = await exec("sh", ["-c", "test -f \"$1\" && printf '%s' \"$1\"", "sh", "viz/lib/render.sh"], { timeout: 2000 });
    const script = stdout(found).trim();
    if (!script) return { available: false, opened: false };
    const safe = Buffer.from(cardMarkdown, "utf8").toString("base64");
    const result = await exec("sh", ["-c", "f=$(mktemp -t omp-viz-card.XXXXXX.md); trap 'rm -f \"$f\"' EXIT; printf '%s' \"$1\" | base64 -d >\"$f\"; bash \"$2\" \"$f\" omp-issue >/dev/null && printf opened", "sh", safe, script], { timeout: 10_000 });
    return stdout(result).includes("opened") ? { available: true, opened: true } : { available: true, opened: false, error: "viz did not open the card" };
  } catch (error) {
    return { available: true, opened: false, error: error instanceof Error ? error.message : String(error) };
  }
}
