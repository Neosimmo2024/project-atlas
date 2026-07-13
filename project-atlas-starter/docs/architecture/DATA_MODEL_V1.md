# Modèle de données V1

## people
- id UUID
- tenant_id UUID
- first_name TEXT
- last_name TEXT
- display_name TEXT
- primary_email TEXT
- primary_phone TEXT
- city TEXT
- postal_code TEXT
- department TEXT
- linkedin_url TEXT
- source TEXT
- status TEXT
- talent_types TEXT[]
- priority TEXT
- talent_score INTEGER
- contact_allowed BOOLEAN
- do_not_contact BOOLEAN
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

## organizations
- id UUID
- tenant_id UUID
- name TEXT
- organization_type TEXT
- siren TEXT
- website_url TEXT
- city TEXT
- department TEXT
- status TEXT
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

## relationships
- id UUID
- tenant_id UUID
- person_id UUID
- organization_id UUID
- relationship_type TEXT
- phase TEXT
- status TEXT
- owner_user_id UUID
- next_action TEXT
- next_action_at TIMESTAMPTZ
- started_at TIMESTAMPTZ
- ended_at TIMESTAMPTZ
- notes TEXT
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

## Règle de déduplication
Ordre de priorité :
1. email normalisé ;
2. téléphone normalisé ;
3. SIREN/RSAC futur ;
4. prénom + nom + ville, à confirmer manuellement.
