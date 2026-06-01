export type ProviderErrorCode =
  | "PROVIDER_BAD_AIRPORT"
  | "PROVIDER_CREDENTIALS_MISSING"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_UNAVAILABLE";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;

  constructor(code: ProviderErrorCode, message: string, status = 502) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

export function providerErrorBody(error: ProviderError): Record<string, unknown> {
  return {
    error: error.message,
    code: error.code
  };
}
