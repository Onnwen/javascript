import type {
  ActiveSessionResource,
  InitialState,
  OrganizationCustomPermissionKey,
  OrganizationCustomRoleKey,
  OrganizationResource,
  Resources,
  UserResource,
} from '@clerk/types';

export const deriveState = (clerkLoaded: boolean, state: Resources, initialState: InitialState | undefined) => {
  if (!clerkLoaded && initialState) {
    return deriveFromSsrInitialState(initialState);
  }
  return deriveFromClientSideState(state);
};

const deriveFromSsrInitialState = (initialState: InitialState) => {
  const userId = initialState.userId;
  const user = initialState.user as UserResource;
  const plan = initialState.plan;
  const sessionId = initialState.sessionId;
  const session = initialState.session as ActiveSessionResource;
  const organization = initialState.organization as OrganizationResource;
  const orgId = initialState.orgId;
  const orgRole = initialState.orgRole as OrganizationCustomRoleKey;
  const orgPermissions = initialState.orgPermissions as OrganizationCustomPermissionKey[];
  const orgPlan = initialState.orgPlan;
  const orgSlug = initialState.orgSlug;
  const actor = initialState.actor;

  return {
    userId,
    user,
    plan,
    sessionId,
    session,
    organization,
    orgId,
    orgRole,
    orgPermissions,
    orgSlug,
    actor,
    orgPlan,
  };
};

const deriveFromClientSideState = (state: Resources) => {
  const userId: string | null | undefined = state.user ? state.user.id : state.user;
  const user = state.user;
  const plan = state.user ? state.user.plan : state.user;
  const sessionId: string | null | undefined = state.session ? state.session.id : state.session;
  const session = state.session;
  const actor = session?.actor;
  const organization = state.organization;
  const orgId: string | null | undefined = state.organization ? state.organization.id : state.organization;
  const orgSlug = organization?.slug;
  const membership = organization
    ? user?.organizationMemberships?.find(om => om.organization.id === orgId)
    : organization;
  const orgPermissions = membership ? membership.permissions : membership;
  const orgRole = membership ? membership.role : membership;
  const orgPlan = membership ? membership.orgPlan : membership;

  return {
    userId,
    user,
    plan,
    sessionId,
    session,
    organization,
    orgId,
    orgRole,
    orgSlug,
    orgPermissions,
    actor,
    orgPlan,
  };
};
