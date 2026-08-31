# Worker de synchronisation Bingo

Petit service Cloudflare Worker qui sert de relais entre tes appareils : chacun
pousse et récupère un instantané JSON de ses grilles, identifié par un code
de synchronisation à 8 caractères (pas de compte, pas de mot de passe). Voir
`../src/hooks/useRemoteSync.ts` côté app pour la logique qui l'appelle.

## Déployer ton propre worker

Il te faut un compte Cloudflare (gratuit). Toutes les commandes ci-dessous
s'exécutent depuis ce dossier (`worker/`).

```sh
npm install
npx wrangler login
```

Crée l'espace de stockage clé-valeur :

```sh
npx wrangler kv namespace create SYNC_KV
```

La commande affiche un `id` — colle-le dans `wrangler.toml` :

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "colle-l-id-ici"
```

Optionnel : dans `wrangler.toml`, remplace `ALLOWED_ORIGIN = "*"` par le
domaine exact où l'app est servie (ex. `https://tonpseudo.github.io`) pour
n'accepter les requêtes que depuis ce site.

Déploie :

```sh
npm run deploy
```

Wrangler affiche l'URL du worker déployé (`https://bingo-sync.<ton-compte>.workers.dev`).
Renseigne-la dans l'app via la variable d'environnement `VITE_SYNC_WORKER_URL`
au moment du build (voir le `README.md` racine et le workflow de déploiement
GitHub Pages) — sans elle, la section « Code de synchro » de la modale
Synchroniser reste masquée.

## Déployer depuis GitHub Actions (optionnel)

Le workflow `.github/workflows/worker-deploy.yml` déploie automatiquement le
worker à chaque changement poussé sous `worker/` sur `main` (et à la demande
via l'onglet Actions → "Déploiement du worker de synchronisation" → Run
workflow). Pour l'activer, ajoute deux secrets au repo (Settings → Secrets
and variables → Actions → New repository secret) :

- `CLOUDFLARE_API_TOKEN` : un token créé depuis le template "Edit Cloudflare
  Workers" dans le dashboard Cloudflare (Profil → API Tokens), restreint à ton
  compte.
- `CLOUDFLARE_ACCOUNT_ID` : visible dans la barre latérale du dashboard
  Cloudflare, sur n'importe quelle page Workers.

Sans ces secrets, seul `npm run deploy` en local fonctionne.

## Développement local

```sh
npm run dev       # démarre le worker en local (wrangler dev)
npm test          # tests unitaires (routage, code, écriture optimiste)
npm run typecheck
```

## Ce que stocke le worker

Une seule valeur par code, sous la clé `sync:<CODE>` :

```json
{ "version": 3, "grids": [ /* état complet, format lib/share.ts */ ] }
```

- Écriture (`PUT`) : optimiste façon « compare-and-swap ». Le client envoie
  `{ baseVersion, grids }` (la version qu'il pensait être la version
  courante) ; le worker n'accepte que si `baseVersion` correspond exactement
  à la version stockée, puis l'incrémente. Sinon il répond `409` avec l'état
  serveur actuel, à adopter côté client plutôt que de l'écraser. `version`
  est un entier attribué par le serveur, jamais une horloge : contrairement à
  un horodatage comparé entre appareils, aucun décalage d'horloge client ne
  peut faire accepter à tort une poussée périmée ou rejeter une poussée
  légitime.
- Un code inutilisé pendant 180 jours expire et libère sa place.
- Aucune donnée personnelle n'est demandée : le code lui-même (8 caractères,
  ~500 milliards de combinaisons) fait office de secret partagé.

## Limitation de débit

Chaque IP est plafonnée à 60 requêtes par minute (tous types confondus :
création, lecture, écriture), au-delà le worker répond `429` avec un en-tête
`Retry-After`. Le préflight CORS (`OPTIONS`) n'est jamais compté. Ce quota est
largement suffisant pour un usage normal — le sondage côté app tourne toutes
les 20s — mais dissuade un script qui bouclerait sur `POST /api/sync` (création
de codes en masse) ou sur `PUT /api/sync/:code` (poussées en boucle). Compteur
tenu dans le même espace KV (`SYNC_KV`), par fenêtre fixe d'une minute : pas de
garantie stricte sous forte concurrence, mais suffisant pour dissuader un abus
scripté sans dépendre d'un Object Durable.
