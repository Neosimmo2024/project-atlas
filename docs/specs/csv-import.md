# Import CSV

## Sprint 11D

L'import CSV execute uniquement les decisions validees apres la previsualisation, la correspondance de colonnes et la detection des doublons.

## Execution

- L'utilisateur confirme explicitement l'import avant toute ecriture.
- L'API `/api/imports/csv/execute` recalcule la previsualisation cote serveur avec le tenant authentifie.
- Le mapping, l'empreinte d'analyse et les decisions sont revalides avant l'appel SQL.
- Les droits autorises sont `owner`, `admin`, `recruiter` et `manager`.
- Le role `reader` ne peut pas executer un import.

## Transaction

L'execution finale passe par la fonction PostgreSQL `public.execute_csv_import`. Une fonction RPC est necessaire parce que les repositories Atlas existants effectuent des ecritures separees et ne peuvent pas garantir une transaction globale depuis le client Supabase.

La transaction couvre :

- la creation ou le rattachement des personnes ;
- la creation ou le rattachement des organisations ;
- l'enregistrement de l'historique `csv_import_runs` ;
- le rapport retourne a l'interface.

Si une erreur survient, PostgreSQL annule la transaction complete.

## Idempotence

La table `csv_import_runs` impose une unicite `(tenant_id, idempotency_key)`. Une repetition de la meme demande retourne le rapport existant avec `idempotent: true` au lieu de recreer des donnees.

## Decisions

- `create_new` cree une personne et, si le nom d'organisation est present et sans cible existante, une organisation.
- `link_existing` verifie les cibles dans le tenant et n'ecrase aucune valeur existante.
- `ignore_row` ne modifie aucune donnee metier.
- `review_later` ne modifie aucune donnee metier.

Les lignes en conflit critique ou invalides ne peuvent pas etre creees. Les lignes invalides ignorees apparaissent comme refusees dans le rapport.

## Relationships

Sprint 11D ne cree pas automatiquement de Relationship. Le rapport expose `relationshipsCreated: 0`. La creation de relations CSV necessitera une decision explicite dans un sprint ulterieur si le modele d'import la prepare.

## Historique

`csv_import_runs` conserve :

- tenant ;
- utilisateur ;
- cle d'idempotence ;
- nom non sensible du fichier ;
- empreinte d'analyse ;
- compteurs d'execution ;
- rapport JSON sans fichier CSV brut.

## Hors Perimetre

Le sprint ne couvre pas :

- annulation ou restauration d'import ;
- Brevo ;
- SMS ;
- n8n ;
- automatisations commerciales ;
- creation automatique de relations.
