export type BrowserFlow = {
  id: string;
  client_state: string;
  client_challenge: string;
  redirect_uri: string;
  provider_state: string;
  nonce: string;
  provider_verifier: string;
  issuer: string;
};
