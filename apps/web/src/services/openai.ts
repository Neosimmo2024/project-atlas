export type AiCompletionRequest = {
  tenantId: string;
  purpose: "qualification" | "summary" | "deduplication";
  input: string;
};

export async function runAiTask(_request: AiCompletionRequest) {
  void _request;

  throw new Error("OpenAI integration is prepared but not implemented in Sprint 001.");
}
