# kontraszt-llm_service

Monorepo egy LLM-alapú címelemző szolgáltatáshoz.

## Mit csinál ez a projekt

Ez a repository egy backend szolgáltatást tartalmaz, amely:

- headline definíciókat olvas egy **forrás Convex deploymentből**
- a headline-okat elküldi egy LLM-nek a **Kilo API-n** keresztül
- strukturált elemzést készít minden headline-hoz, többek között:
  - `label`
  - `sentiment`
  - `sentiment_score`
  - `entities`
  - `confidence`
- az elemzett eredményeket egy **cél Convex deploymentbe** írja
- biztosít egy kis HTTP szervert az alábbi végpontokkal:
  - `GET /healthz`
  - `POST /webhook/scrape-complete`

A fő alkalmazás az `apps/llm-service` mappában található.

## Repository felépítése

```text
.
├── apps/
│   └── llm-service/      # fő szolgáltatás alkalmazás
├── packages/
│   └── utils/            # megosztott workspace csomag
├── data/                 # helyi adatfájlok
├── package.json          # gyökér workspace scriptek
├── pnpm-workspace.yaml   # workspace definíció
└── vite.config.ts        # Vite+ konfiguráció
```

## Eszközök

Ez a projekt a **Vite+ (`vp`)** eszközt használja elsődleges CLI-ként.

Fontos:

- Normál projektműveletekhez `vp`-t használj, ne `pnpm`, `npm` vagy `yarn` parancsot.
- Ahol releváns, használd a beépített Vite+ parancsokat, például: `vp check`, `vp lint`, `vp test`, `vp build`.
- Package scriptek futtatásához a `vp run ...` parancsot használd.

## Követelmények

- Node.js `>=22.12.0`
- globálisan elérhető `vp`

A verziók ellenőrzése:

```bash
vp --version
node --version
```

## Függőségek telepítése

A repository gyökeréből:

```bash
vp install
```

## Környezeti változók

Az alkalmazás innen tölti be a környezeti változókat:

- `/.env.local`
- `/apps/llm-service/.env.local`

Példa alkalmazás környezeti fájl: `apps/llm-service/.env.example`

Szükséges változók:

```env
PORT=3000

SOURCE_CONVEX_URL=https://your-original-deployment.convex.cloud
TARGET_CONVEX_URL=https://your-llm-service-deployment.convex.cloud

WEBHOOK_SECRET=change-me

KILO_API_KEY=change-me
KILO_MODEL=your-model-name

SOURCE_PAGE_SIZE=200
MAX_SOURCE_PAGES_PER_RUN=30
CONVEX_SAVE_BATCH_SIZE=200
SYNC_STATE_KEY=source-headline-definitions
```

Egy egyszerű beállítási folyamat:

1. Másold az `apps/llm-service/.env.example` fájlt `apps/llm-service/.env.local` néven
2. Töltsd ki a Convex URL-eket, a webhook titkot és a Kilo API beállításait
3. Indítsd el az alkalmazást

## Használati parancsok

### Gyökérszintű parancsok

Ezeket a repository gyökeréből futtasd.

#### Telepítés

```bash
vp install
```

#### Formázás, lint, teszt és build futtatása mindarra, amit a gyökérscript ellenőriz

```bash
vp run ready
```

Ez a gyökér `ready` scriptet futtatja:

```bash
vp fmt && vp lint && vp run test -r && vp run build -r
```

#### Workspace script futtatása rekurzívan

Példák:

```bash
vp run test -r
vp run build -r
```

- Az `-r` a scriptet minden olyan workspace csomagban futtatja, amely definiálja azt.

#### Az llm-service belépési script futtatása a gyökérből

```bash
vp run:llm-service
```

Ez erre képeződik le:

```bash
vp run llm-service#run:llm-service
```

### Alkalmazásszintű parancsok

A fő alkalmazás az `apps/llm-service` mappában található.

Ezeket futtathatod:

- az `apps/llm-service` mappából, vagy
- a repository gyökeréből workspace célzással a `vp run llm-service#<script>` formában

#### Convex helyi/fejlesztői workflow indítása

```bash
vp run llm-service#dev
```

Script:

```bash
vp exec convex dev
```

Ezt akkor használd, amikor Convex függvényeket fejlesztesz és szinkronizálod őket a Convex deployment/dev környezeteddel.

#### Convex függvények deployolása

```bash
vp run llm-service#deploy
```

Script:

```bash
vp exec convex deploy
```

#### A HTTP szolgáltatás indítása

```bash
vp run llm-service#serve
```

Script:

```bash
node --experimental-strip-types src/server.ts
```

Ez elindítja a szolgáltatást, amely a `PORT` porton figyel, és az alábbi végpontokat biztosítja:

- `GET /healthz`
- `POST /webhook/scrape-complete`

#### A teljes szinkron feladat kézi futtatása

```bash
vp run llm-service#run:sync
```

Script:

```bash
node --experimental-strip-types scripts/run-sync.ts
```

Ezt arra használhatod, hogy kézzel lekérd a forrás headline-okat, elemeztesd őket az LLM-mel, majd elmentsd az eredményeket a cél Convex deploymentbe.

#### Az önálló service runner futtatása

```bash
vp run llm-service#run:llm-service
```

Script:

```bash
node scripts/run-llm-service.mjs
```

#### Parquet adatok importálása

```bash
vp run llm-service#import:parquet
```

Script:

```bash
node scripts/import-parquet.mjs
```

#### Az LLM közvetlen meghívása scriptből

```bash
vp run llm-service#call:llm
```

Script:

```bash
node --experimental-strip-types scripts/call_llm.ts
```

#### Adatok mentése Convexbe scriptből

```bash
vp run llm-service#save:convex
```

Script:

```bash
node --experimental-strip-types scripts/save_to_convex.ts
```

## Script futtatási útmutató

Mivel ez egy Vite+ monorepo, a script futtatásának módja attól függ, hol van definiálva a script.

### Gyökérscriptek futtatása

Ha a script a gyökér `package.json` fájlban van definiálva, ezt használd:

```bash
vp run <script>
```

Példák:

```bash
vp run ready
vp run run:llm-service
```

### Egy adott workspace csomag scriptjének futtatása a gyökérből

Használd ezt:

```bash
vp run <workspace-name>#<script>
```

Példák:

```bash
vp run llm-service#serve
vp run llm-service#run:sync
vp run llm-service#deploy
vp run utils#build
```

### Scriptek futtatása rekurzívan a teljes monorepóban

Használd ezt:

```bash
vp run <script> -r
```

Példák:

```bash
vp run test -r
vp run build -r
```

Ez minden olyan workspace-ben végrehajtja a scriptet, amely definiálja azt.

### Fontos Vite+ megjegyzés

A beépített parancsok és a scriptek nem ugyanazok:

- a `vp dev` a beépített Vite+ fejlesztői parancsot futtatja
- a `vp run dev` egy `dev` nevű package scriptet futtat

Tehát ha `package.json` scriptet akarsz futtatni, mindig a `vp run` parancsot használd.

## Tipikus fejlesztési workflow-k

### 1. Minden telepítése és ellenőrzése

```bash
vp install
vp run ready
```

### 2. A szolgáltatás helyi futtatása

```bash
vp run llm-service#serve
```

Ezután ellenőrizd a health végpontot:

```bash
curl http://localhost:3000/healthz
```

### 3. Szinkron futtatás kézzel

```bash
vp run llm-service#run:sync
```

### 4. A webhook végpont meghívása

```bash
curl -X POST http://localhost:3000/webhook/scrape-complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -d '{"webhookId":"example-webhook-id"}'
```

Hitelesítéshez ezt is használhatod:

```bash
-H "x-webhook-secret: YOUR_WEBHOOK_SECRET"
```

## Docker

Az `apps/llm-service` számára van Docker támogatás.

Kapcsolódó fájlok:

- `docker-compose.coolify.yml`
- `apps/llm-service/docker-compose.yml`
- `apps/llm-service/Dockerfile`

Ha Docker Compose-szal szeretnéd futtatni az alkalmazást az app saját beállításával, nézd át ezt:

- `apps/llm-service/docker-compose.yml`

A konténer a `3000` portot teszi elérhetővé, és ugyanazokat a környezeti változókat használja, mint a helyi futtatás.

## Workspace csomagok

### `apps/llm-service`

A fő backend szolgáltatás az alábbi feladatokra:

- webhook értesítések fogadása
- szinkron feladatok futtatása
- a Kilo LLM API hívása
- olvasás a forrás Convexből
- írás a cél Convexbe

### `packages/utils`

Megosztott workspace csomag.

Elérhető scriptek:

```bash
vp run utils#build
vp run utils#dev
vp run utils#test
vp run utils#check
```

## Validációs parancsok

Hasznos parancsok változtatások commitolása előtt:

```bash
vp fmt
vp lint
vp run test -r
vp run build -r
```

Vagy futtasd az összesített gyökérellenőrzést:

```bash
vp run ready
```

## Megjegyzések

- Az LLM elemzés headline-csomagokban történik.
- A szolgáltatás az elemzés előtt deduplikálja a headline bemenetet.
- A szinkron állapot a beállított `SYNC_STATE_KEY` használatával kerül mentésre.
- Ha egy szinkron már fut, egy újabb szinkronkísérlet biztonságosan figyelmen kívül lesz hagyva.
