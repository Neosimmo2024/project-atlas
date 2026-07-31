# Sprint 13 - Recette CSV vers Pipeline

Ce runbook décrit une recette locale et reproductible du parcours Atlas :

CSV -> prévisualisation -> mapping -> import transactionnel -> People -> Organizations -> Relationships -> Pipeline -> historique -> annulation.

Il ne doit jamais être utilisé avec des données réelles. Le dataset et le CSV fournis sont entièrement fictifs.

## Préconditions

- Base Supabase locale ou environnement QA éphémère.
- Migrations canoniques appliquées de `0001` à `0014`.
- Un utilisateur Auth local existant pour servir d'owner de recette.
- Variables psql locales :
  - `atlas_demo_owner_user_id`
  - `atlas_demo_owner_email`
  - `atlas_demo_tenant_name`, optionnel.

Ne pas exécuter ce runbook contre une base distante partagée ou de production.

## Dataset fictif

Fichier : `supabase/demo/sprint13_demo_dataset.sql`

Contenu attendu :

- tenant : `Atlas Sprint 13 Demo Tenant` ;
- owner fictif : profil `Camille Martin Démo`, e-mail fourni par variable ;
- 4 People fictives ;
- 4 Organizations fictives ;
- 2 Relationships préexistantes ;
- 1 Task et 1 Interaction fictives pour protéger des données préexistantes ;
- statuts TVA : `assujetti`, `non_assujetti`, `a_verifier`, et `null`.

Le script est idempotent et ne contient aucune instruction destructive.

Commande locale type :

```powershell
psql "$env:QA_DB_URL" `
  -v atlas_demo_owner_user_id="$env:ATLAS_DEMO_OWNER_USER_ID" `
  -v atlas_demo_owner_email="$env:ATLAS_DEMO_OWNER_EMAIL" `
  -f supabase/demo/sprint13_demo_dataset.sql
```

## CSV de démonstration

Fichier : `docs/fixtures/sprint13/demo-import.csv`

Le fichier couvre :

- création complète Person + Organization + Relationship ;
- Person valide sans Organization ;
- Organization existante ;
- Person existante ;
- Relationship recruiting préexistante ;
- Relationship préexistante d'un autre type ;
- doublon interne CSV ;
- doublon avec Atlas ;
- ligne incomplète ;
- email invalide ;
- téléphone à normaliser ;
- accents, apostrophe et caractères français ;
- TVA absente, `Assujetti`, `Non assujetti`, `À vérifier`, valeur inconnue.

## Matrice ligne par ligne

| Ligne | Résultat attendu |
| --- | --- |
| 2 Élodie Carpentier | Person créée, Organization créée, Relationship `recruiting` créée, carte Pipeline en `detection`, TVA `assujetti`. |
| 3 Hugo Lambert | Person créée, aucune Organization, aucune Relationship, aucune carte Pipeline, TVA ignorée faute d'Organization. |
| 4 Bastien Moreau | Person rattachée, Organization rattachée, Relationship recruiting préexistante rattachée, aucune duplication, TVA existante conservée. |
| 5 Claire Dubois | Person rattachée, Organization rattachée, Relationship d'un autre type détectée, aucune transformation, TVA inconnue classée `a_verifier` seulement si l'Organization n'a pas déjà de statut. |
| 6 Alice Bernard | Doublon Atlas certain, décision humaine attendue, aucune duplication injustifiée. |
| 7 Maëlle O'Connor | Nouvelle Person, Organization rattachée, statut TVA `a_verifier`, caractères français conservés. |
| 8 Maëlle O'Connor doublon | Doublon interne CSV détecté, décision humaine attendue. |
| 9 Nora Invalid | Email invalide, ligne rejetée ou à corriger, aucune écriture métier. |
| 10 Seul Incomplete | Ligne incomplète sans email ni téléphone, rejetée, aucune écriture métier. |
| 11 Lina Durand | Person créée, Organization créée, Relationship créée si Pipeline activé, téléphone normalisé, TVA inconnue classée `a_verifier` avec warning. |

## Procédure de recette

1. Démarrer Supabase localement.
2. Appliquer les migrations `0001` à `0014`.
3. Charger le dataset fictif.
4. Démarrer l'application web locale.
5. Se connecter avec l'utilisateur Auth local rattaché au tenant de démonstration.
6. Ouvrir `/imports`.
7. Sélectionner `docs/fixtures/sprint13/demo-import.csv`.
8. Vérifier le mapping automatique :
   - `Prénom`, `Téléphone`, `Réseau immobilier`, `Statut TVA` doivent s'afficher sans mojibake.
9. Activer l'option globale Pipeline.
10. Vérifier les warnings et les lignes à décision humaine.
11. Confirmer uniquement les lignes attendues.
12. Exécuter l'import.
13. Contrôler People, Organizations, Relationships et Pipeline.
14. Ouvrir `/imports` puis le détail de l'import.
15. Vérifier le rapport, les compteurs et les statuts TVA affichés.
16. Lancer l'analyse d'annulation.
17. Annuler l'import si le rôle est `owner` ou `admin`.
18. Vérifier que les données préexistantes, rattachées, modifiées ou utilisées sont conservées.
19. Relancer l'annulation avec la même clé depuis l'interface ou l'API uniquement si le parcours le permet : le résultat doit rester idempotent.

## Comptes attendus

Les compteurs exacts dépendent des décisions prises sur les lignes ambiguës. Avec l'option Pipeline activée et uniquement les lignes propres confirmées :

- People créées : Élodie, Hugo, Maëlle, Lina.
- People rattachées : Bastien, Claire, Alice selon décision.
- Organizations créées : Atlas Démo Nouvelle Agence, Atlas Démo TVA Inconnue.
- Organizations rattachées : Agence Horizon, Cabinet Équinoxe, Relation Autre Type, Réseau Lumière.
- Relationships créées : Élodie et Lina au minimum si leurs Organizations sont créées.
- Relationships rattachées : Bastien.
- Relationships non créées : Hugo sans Organization, Claire autre type, lignes invalides.

## Règles TVA

La donnée est facultative et portée par `organizations.vat_status`.

Valeurs canoniques :

- `assujetti` ;
- `non_assujetti` ;
- `a_verifier`.

Normalisation :

- `Assujetti`, casse et espaces variables -> `assujetti` ;
- `Non assujetti`, tirets ou espaces variables -> `non_assujetti` ;
- `À vérifier`, `a verifier`, variantes proches -> `a_verifier` ;
- anciennes valeurs booléennes compatibles : `oui` -> `assujetti`, `non` -> `non_assujetti` ;
- valeur vide : aucune écriture ;
- valeur inconnue : `a_verifier` avec warning, sans bloquer l'import.

Mise à jour :

- Organization créée par l'import : statut écrit si une valeur exploitable existe ;
- Organization existante sans statut : statut écrit ;
- Organization existante avec statut : statut conservé, pas d'écrasement silencieux.

## GO / NO-GO bêta

| Critère | Statut attendu | Bloquant |
| --- | --- | --- |
| Toutes les lignes valides produisent le résultat attendu | PASS obligatoire | Oui |
| Lignes invalides signalées sans écriture métier | PASS obligatoire | Oui |
| Aucun doublon injustifié | PASS obligatoire | Oui |
| People sans Organization sans carte Pipeline | PASS obligatoire | Oui |
| Relationship recruiting préexistante non dupliquée | PASS obligatoire | Oui |
| Relationship autre type non transformée | PASS obligatoire | Oui |
| TVA persistée ou signalée sans blocage | PASS obligatoire | Oui |
| Historique et détail cohérents | PASS obligatoire | Oui |
| Annulation sûre et idempotente | PASS obligatoire | Oui |
| Isolation inter-tenant confirmée par tests RLS | PASS obligatoire | Oui |
| Aucun mojibake visible | PASS obligatoire | Oui |
| Aucun secret ou donnée réelle | PASS obligatoire | Oui |
| Brevo, SMS, n8n non déclenchés | PASS obligatoire | Oui |
| Desktop utilisable | PASS obligatoire | Oui |
| Mobile essentiel utilisable | PASS obligatoire | Non bloquant si contournement desktop documenté |

Un GO bêta ne doit pas être prononcé sur un critère non vérifié.
