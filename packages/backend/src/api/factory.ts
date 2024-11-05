import {
  AllowlistIdentifierAPI,
  ClientAPI,
  DomainAPI,
  EmailAddressAPI,
  InvitationAPI,
  OrganizationAPI,
  PhoneNumberAPI,
  RedirectUrlAPI,
  SamlConnectionAPI,
  SessionAPI,
  SignInTokenAPI,
  TestingTokenAPI,
  UserAPI,
} from './endpoints';
import { AccountlessApplicationAPI } from './endpoints/AccountlessApplicationsAPI';
import { buildRequest } from './request';

export type CreateBackendApiOptions = Parameters<typeof buildRequest>[0];

export type ApiClient = ReturnType<typeof createBackendApiClient>;

export function createBackendApiClient(options: CreateBackendApiOptions) {
  const request = buildRequest(options);

  return {
    accountlessApplications: new AccountlessApplicationAPI(buildRequest({ ...options, allowAccountless: true })),
    allowlistIdentifiers: new AllowlistIdentifierAPI(request),
    clients: new ClientAPI(request),
    emailAddresses: new EmailAddressAPI(request),
    invitations: new InvitationAPI(request),
    organizations: new OrganizationAPI(request),
    phoneNumbers: new PhoneNumberAPI(request),
    redirectUrls: new RedirectUrlAPI(request),
    sessions: new SessionAPI(request),
    signInTokens: new SignInTokenAPI(request),
    users: new UserAPI(request),
    domains: new DomainAPI(request),
    samlConnections: new SamlConnectionAPI(request),
    testingTokens: new TestingTokenAPI(request),
  };
}
