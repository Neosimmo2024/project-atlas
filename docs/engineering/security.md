# Security

## Security Baseline

- RLS is enabled on every exposed business table.
- `tenant_id` is imposed server-side.
- The browser must never provide a trusted `tenant_id`.
- No `service_role` key is exposed in the browser.
- Real `.env` files are never versioned.
- Roles control sensitive actions, especially deletion.
- `contact_allowed` and `do_not_contact` must be checked before any campaign.
- Important changes are kept in an audit log.
- Integration tests must validate isolation between two tenants.
- Deletion and objection requests must be handled in the product.

## Tenant Isolation

Every business datum belongs to one tenant. Server-side routes and repositories must derive tenant context from the authenticated user session and tenant membership, not from arbitrary browser input.

## Roles

The product uses these application roles:

- `owner`;
- `admin`;
- `recruiter`;
- `manager`;
- `reader`.

Sensitive operations must be explicitly checked server-side according to the role rules of the relevant module.

## Secrets

Only publishable public client configuration can be exposed to the browser. Secret keys, service role keys, passwords, real local environment files, and private user identifiers must not be committed.

## Compliance Direction

The V1 must preserve contact consent, do-not-contact intent, auditability, and tenant isolation. Before commercialization, GDPR deletion and objection workflows, legal documents, monitoring, and incident recovery must be completed.
