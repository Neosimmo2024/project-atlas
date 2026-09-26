import { vi } from "vitest";

// Vitest runs server modules outside the Next.js compiler.
vi.mock("server-only", () => ({}));
