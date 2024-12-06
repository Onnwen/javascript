import { createCheckAuthorization } from '@clerk/shared/authorization';
import { is4xxError, isClerkAPIResponseError } from '@clerk/shared/error';
import { runWithExponentialBackOff } from '@clerk/shared/utils';
import type {
  ActJWTClaim,
  CheckAuthorization,
  EmailCodeConfig,
  GetToken,
  GetTokenOptions,
  PhoneCodeConfig,
  SessionJSON,
  SessionResource,
  SessionStatus,
  SessionVerificationJSON,
  SessionVerificationResource,
  SessionVerifyAttemptFirstFactorParams,
  SessionVerifyAttemptSecondFactorParams,
  SessionVerifyCreateParams,
  SessionVerifyPrepareFirstFactorParams,
  SessionVerifyPrepareSecondFactorParams,
  TokenResource,
  UserResource,
} from '@clerk/types';

import { unixEpochToDate } from '../../utils/date';
import { clerkInvalidStrategy } from '../errors';
import { eventBus, events } from '../events';
import { fraudProtection } from '../fraudProtection';
import { SessionTokenCache } from '../tokenCache';
import { BaseResource, PublicUserData, Token, User } from './internal';
import { SessionVerification } from './SessionVerification';

export class Session extends BaseResource implements SessionResource {
  pathRoot = '/client/sessions';

  id!: string;
  status!: SessionStatus;
  lastActiveAt!: Date;
  lastActiveToken!: TokenResource | null;
  lastActiveOrganizationId!: string | null;
  actor!: ActJWTClaim | null;
  user!: UserResource | null;
  publicUserData!: PublicUserData;
  factorVerificationAge: [number, number] | null = null;
  expireAt!: Date;
  abandonAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;

  static isSessionResource(resource: unknown): resource is Session {
    return !!resource && resource instanceof Session;
  }

  constructor(data: SessionJSON) {
    super();

    this.fromJSON(data);
    this.#hydrateCache(this.lastActiveToken);
  }

  end = (): Promise<SessionResource> => {
    SessionTokenCache.clear();
    return this._basePost({
      action: 'end',
    });
  };

  remove = (): Promise<SessionResource> => {
    SessionTokenCache.clear();
    return this._basePost({
      action: 'remove',
    });
  };

  touch = (): Promise<SessionResource> => {
    return this._basePost({
      action: 'touch',
      body: { active_organization_id: this.lastActiveOrganizationId },
    });
  };

  clearCache = (): void => {
    return SessionTokenCache.clear();
  };

  getToken: GetToken = async (options?: GetTokenOptions): Promise<string | null> => {
    return runWithExponentialBackOff(() => this._getToken(options), {
      shouldRetry: (error: unknown, currentIteration: number) => !is4xxError(error) && currentIteration < 4,
    });
  };

  checkAuthorization: CheckAuthorization = params => {
    const orgMemberships = this.user?.organizationMemberships || [];
    const activeMembership = orgMemberships.find(mem => mem.organization.id === this.lastActiveOrganizationId);
    return createCheckAuthorization({
      userId: this.user?.id,
      factorVerificationAge: this.factorVerificationAge,
      orgId: activeMembership?.id,
      orgRole: activeMembership?.role,
      orgPermissions: activeMembership?.permissions,
    })(params);
  };

  #hydrateCache = (token: TokenResource | null) => {
    if (token) {
      SessionTokenCache.set({
        tokenId: this.#getCacheId(),
        tokenResolver: Promise.resolve(token),
      });
    }
  };

  // If it's a session token, retrieve it with their session id, otherwise it's a jwt template token
  // and retrieve it using the session id concatenated with the jwt template name.
  // e.g. session id is 'sess_abc12345' and jwt template name is 'haris'
  // The session token ID will be 'sess_abc12345' and the jwt template token ID will be 'sess_abc12345-haris'
  #getCacheId(template?: string, organizationId?: string | null) {
    const resolvedOrganizationId =
      typeof organizationId === 'undefined' ? this.lastActiveOrganizationId : organizationId;
    return [this.id, template, resolvedOrganizationId, this.updatedAt.getTime()].filter(Boolean).join('-');
  }

  startVerification = async ({ level }: SessionVerifyCreateParams): Promise<SessionVerificationResource> => {
    const json = (
      await BaseResource._fetch({
        method: 'POST',
        path: `/client/sessions/${this.id}/verify`,
        body: {
          level,
        } as any,
      })
    )?.response as unknown as SessionVerificationJSON;

    return new SessionVerification(json);
  };

  prepareFirstFactorVerification = async (
    factor: SessionVerifyPrepareFirstFactorParams,
  ): Promise<SessionVerificationResource> => {
    let config;
    switch (factor.strategy) {
      case 'email_code':
        config = { emailAddressId: factor.emailAddressId } as EmailCodeConfig;
        break;
      case 'phone_code':
        config = {
          phoneNumberId: factor.phoneNumberId,
          default: factor.default,
        } as PhoneCodeConfig;
        break;
      default:
        clerkInvalidStrategy('Session.prepareFirstFactorVerification', (factor as any).strategy);
    }

    const json = (
      await BaseResource._fetch({
        method: 'POST',
        path: `/client/sessions/${this.id}/verify/prepare_first_factor`,
        body: {
          ...config,
          strategy: factor.strategy,
        } as any,
      })
    )?.response as unknown as SessionVerificationJSON;

    return new SessionVerification(json);
  };

  attemptFirstFactorVerification = async (
    attemptFactor: SessionVerifyAttemptFirstFactorParams,
  ): Promise<SessionVerificationResource> => {
    const json = (
      await BaseResource._fetch({
        method: 'POST',
        path: `/client/sessions/${this.id}/verify/attempt_first_factor`,
        body: { ...attemptFactor, strategy: attemptFactor.strategy } as any,
      })
    )?.response as unknown as SessionVerificationJSON;

    return new SessionVerification(json);
  };

  prepareSecondFactorVerification = async (
    params: SessionVerifyPrepareSecondFactorParams,
  ): Promise<SessionVerificationResource> => {
    const json = (
      await BaseResource._fetch({
        method: 'POST',
        path: `/client/sessions/${this.id}/verify/prepare_second_factor`,
        body: params as any,
      })
    )?.response as unknown as SessionVerificationJSON;

    return new SessionVerification(json);
  };

  attemptSecondFactorVerification = async (
    params: SessionVerifyAttemptSecondFactorParams,
  ): Promise<SessionVerificationResource> => {
    const json = (
      await BaseResource._fetch({
        method: 'POST',
        path: `/client/sessions/${this.id}/verify/attempt_second_factor`,
        body: params as any,
      })
    )?.response as unknown as SessionVerificationJSON;

    return new SessionVerification(json);
  };

  protected fromJSON(data: SessionJSON | null): this {
    if (!data) {
      return this;
    }

    this.id = data.id;
    this.status = data.status;
    this.expireAt = unixEpochToDate(data.expire_at);
    this.abandonAt = unixEpochToDate(data.abandon_at);
    this.factorVerificationAge = data.factor_verification_age;
    this.lastActiveAt = unixEpochToDate(data.last_active_at || undefined);
    this.lastActiveOrganizationId = data.last_active_organization_id;
    this.actor = data.actor;
    this.createdAt = unixEpochToDate(data.created_at);
    this.updatedAt = unixEpochToDate(data.updated_at);
    this.user = new User(data.user!);

    if (data.public_user_data) {
      this.publicUserData = new PublicUserData(data.public_user_data);
    }

    this.lastActiveToken = data.last_active_token ? new Token(data.last_active_token) : null;

    return this;
  }

  public toJSON(): SessionJSON {
    return {
      object: 'session',
      id: this.id,
      status: this.status,
      expire_at: this.expireAt.getTime(),
      abandon_at: this.abandonAt.getTime(),
      factor_verification_age: this.factorVerificationAge,
      last_active_at: this.lastActiveAt.getTime(),
      last_active_organization_id: this.lastActiveOrganizationId,
      actor: this.actor,
      user: this.user?.toJSON() || null,
      public_user_data: this.publicUserData.toJSON(),
      last_active_token: this.lastActiveToken?.toJSON() || null,
      created_at: this.createdAt.getTime(),
      updated_at: this.updatedAt.getTime(),
    };
  }

  private async _getToken(options?: GetTokenOptions): Promise<string | null> {
    if (!this.user) {
      return null;
    }

    const { leewayInSeconds, template, skipCache = false } = options || {};

    // If no organization ID is provided, default to the selected organization in memory
    // Note: this explicitly allows passing `null` or `""`, which should select the personal workspace.
    const organizationId =
      typeof options?.organizationId === 'undefined' ? this.lastActiveOrganizationId : options?.organizationId;

    if (!template && Number(leewayInSeconds) >= 60) {
      throw new Error('Leeway can not exceed the token lifespan (60 seconds)');
    }

    const tokenId = this.#getCacheId(template, organizationId);
    const cachedEntry = skipCache ? undefined : SessionTokenCache.get({ tokenId }, leewayInSeconds);

    // Dispatch tokenUpdate only for __session tokens with the session's active organization ID, and not JWT templates
    const shouldDispatchTokenUpdate = !template && organizationId === this.lastActiveOrganizationId;

    if (cachedEntry) {
      const cachedToken = await cachedEntry.tokenResolver;
      if (shouldDispatchTokenUpdate) {
        eventBus.dispatch(events.TokenUpdate, { token: cachedToken });
      }
      // Return null when raw string is empty to indicate that there it's signed-out
      return cachedToken.getRawString() || null;
    }
    const path = template ? `${this.path()}/tokens/${template}` : `${this.path()}/tokens`;

    // TODO: update template endpoint to accept organizationId
    const params: Record<string, string | null> = template ? {} : { organizationId };

    // this handles all getToken invocations with skipCache: true
    await fraudProtection.blockUntilReady();

    const tokenResolver = Token.create(path, params).catch(e => {
      if (isClerkAPIResponseError(e) && e.errors[0].code === 'requires_captcha') {
        return fraudProtection.execute(async () => {
          const captchaParams = await fraudProtection.managedChallenge(Session.clerk);
          return Token.create(path, { ...params, ...captchaParams });
        });
      }
      throw e;
    });

    SessionTokenCache.set({ tokenId, tokenResolver });
    return tokenResolver.then(token => {
      if (shouldDispatchTokenUpdate) {
        eventBus.dispatch(events.TokenUpdate, { token });
      }
      // Return null when raw string is empty to indicate that there it's signed-out
      return token.getRawString() || null;
    });
  }
}
