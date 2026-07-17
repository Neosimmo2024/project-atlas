export async function readResponseMessage(response: Response, fallback: string) {
  const body = await response.text();
  const trimmedBody = body.trim();

  if (!trimmedBody) return fallback;

  try {
    const parsed: unknown = JSON.parse(trimmedBody);

    if (parsed && typeof parsed === "object") {
      if ("error" in parsed && typeof parsed.error === "string") return parsed.error;
      if ("message" in parsed && typeof parsed.message === "string") return parsed.message;
      if ("warning" in parsed && typeof parsed.warning === "string") return parsed.warning;
    }
  } catch {
    return trimmedBody;
  }

  return fallback;
}
