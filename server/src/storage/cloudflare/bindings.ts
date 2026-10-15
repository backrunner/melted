export interface CloudBindings {
  ACCOUNTS: DurableObjectNamespace;
  CONTROL: DurableObjectNamespace;
  MELTED_SERVER_ID: string;
  MELTED_OPERATOR: string;
  PUBLIC_ORIGIN: string;
  REGISTRATION_MODE?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  DEVELOPMENT_SAMPLES?: string;
}
