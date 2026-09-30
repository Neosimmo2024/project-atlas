export type StopSummary = {
  mode: string; bookings: number; missingEmail: number; unmatched: number;
  alreadyStopped: number; planned: number; added: number;
};
export function syncCalendlyStops(options: {
  token?: string; brevoKey?: string; apply?: boolean; transport?: typeof fetch;
}): Promise<StopSummary>;
