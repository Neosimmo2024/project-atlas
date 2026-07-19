# Durcissement securite preproduction

Ce document decrit les controles ajoutes avant production sans modifier les regles metier Atlas.

## En-tetes HTTP

Atlas applique des en-tetes de securite globaux via `next.config.ts` et le middleware applicatif :

- `Content-Security-Policy` limite les sources a l'application, Supabase et les origines locales de developpement.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` et `frame-ancestors 'none'`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` desactive camera, micro, geolocalisation, paiement et USB.
- `Strict-Transport-Security` est active uniquement lorsque `VERCEL_ENV=production` ou `ATLAS_ENABLE_HSTS=true`.

`script-src 'unsafe-eval'` est reserve au developpement local Next.js. `style-src 'unsafe-inline'` reste autorise pour la compatibilite Next.js et les styles generes.

## Protection CSRF

Toutes les routes `/api` utilisant `POST`, `PUT`, `PATCH` ou `DELETE` passent par un controle global avant d'atteindre les handlers :

- refus des requetes navigateur `Sec-Fetch-Site: cross-site` ;
- refus d'une origine `Origin` differente de l'origine de la requete, sauf si elle est listee dans `ATLAS_ALLOWED_ORIGINS` ;
- refus des mutations avec `Content-Type` explicite different de `application/json`.

Les requetes sans session restent ensuite soumises aux controles existants : Supabase Auth, contexte tenant et RLS.

## Erreurs API

Les erreurs metier connues conservent un message public explicite via `ApiError`.
Les erreurs techniques inattendues sont journalisees cote serveur puis exposees au navigateur avec un message generique et un code stable.

## Logs serveur

Les logs serveur utilisent une redaction defensive :

- cles et champs sensibles ;
- valeurs de type `sb_secret_*` ou `sb_publishable_*` ;
- UUID presents dans les payloads de contexte.

## Cookies et session Supabase

Atlas utilise `@supabase/ssr` pour la session navigateur et serveur. Les cookies sont crees par Supabase et rafraichis dans le middleware. Aucun mot de passe n'est stocke par Atlas dans le code, le stockage local ou les fichiers de configuration.

Les variables locales reelles doivent rester dans des fichiers ignores par Git, comme `.env.local`. Les fichiers exemples ne contiennent que des placeholders.
