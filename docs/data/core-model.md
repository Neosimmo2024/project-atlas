# Core Data Model

## Principle

The Atlas data model is multi-tenant and relational. The model is the core of the product; AI and automation are capabilities built on top of it.

## Core Objects

| Object | Role |
| --- | --- |
| `tenants` | Isolated customer organizations |
| `profiles` | Application profiles for Supabase Auth users |
| `roles` | Application roles: owner, admin, recruiter, manager, reader |
| `tenant_users` | User to tenant to role association |
| `people` | Contacts, talents, candidates, partners |
| `organizations` | Networks, agencies, companies, partners |
| `relationships` | Business links between people and organizations |
| `audit_log` | Minimal change history |

## Business Tables

- `people`: talents and contacts.
- `organizations`: companies, agencies, networks, or partner structures.
- `relationships`: recruitment or business relationship between a person and an organization.

## Shared Constraints

- Each business row has a `tenant_id`.
- Business status values remain `TEXT` with check constraints.
- PostgreSQL `ENUM` types are not used.
- Mutable tables use `updated_at` triggers.

## Deduplication Principles

People deduplication priority:

1. normalized email;
2. normalized phone;
3. first name + last name + city.

Organizations deduplication priority:

1. SIREN;
2. SIRET;
3. email;
4. phone;
5. name + city;
6. name + postal code.
