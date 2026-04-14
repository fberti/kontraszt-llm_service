# llm-service

Ez a szolgáltatás a forrás Convex `headlineDefinitions` táblájából olvas headline-okat, LLM-mel elemzi őket, majd az eredményt a cél Convex `llmAnalysis` táblába menti.

## Normál működés

A szokásos működési folyamat:

1. A scraper vagy egy webhook meghívja a szolgáltatást.
2. A szolgáltatás lekéri a forrás `headlineDefinitions` rekordokat.
3. Incremental módban csak az újabb forrás rekordokat vizsgálja.
4. Csak a még nem elemzett rekordokat küldi el az LLM-nek.
5. Az eredményt elmenti a cél `llmAnalysis` táblába.

Normál üzemhez ajánlott beállítás:

```env
FULL_BACKFILL=false
```

## Gyakori hibakeresési helyzetek

### 1. A webhook lefut, de nem kerülnek új rekordok a `llmAnalysis` táblába

Ilyenkor érdemes ellenőrizni:

- elindult-e valóban a sync,
- incremental módban túl korán áll-e meg a feldolgozás,
- van-e egyáltalán hiányzó rekord a célban.

Javasolt lépések:

1. Nézd meg a szolgáltatás logját.
2. Futtasd az audit scriptet.
3. Ha kell, ideiglenesen kapcsold be a backfill módot.

### 2. A forrás és a cél rekordszáma eltér

A nyers darabszám önmagában nem mindig elég. A fontos kérdés az, hogy a `(hashedId, headlineText)` párok egyeznek-e.

Ezért először mindig auditot érdemes futtatni, nem csak darabszámot nézni.

### 3. A célban több rekord van, mint a forrásban

Ez általában azt jelenti, hogy a célban maradtak olyan korábbi elemzések, amelyek már nincsenek benne az aktuális forrásban.

Ilyenkor:

1. futtasd az audit scriptet,
2. ellenőrizd az `extraInTargetCount` értéket,
3. ha szükséges, futtasd a cleanup scriptet.

### 4. Régebbi hiányzó rekordokat is pótolni kell

Ehhez használd ideiglenesen a backfill módot:

```env
FULL_BACKFILL=true
```

Ezután indítsd újra a szolgáltatást, futtasd le a szinkront, majd a végén állítsd vissza:

```env
FULL_BACKFILL=false
```

## Hasznos karbantartó scriptek

### Audit script

Fájl: `scripts/audit-sync.ts`

Feladata:

- végigolvassa a teljes forrás `headlineDefinitions` állományt,
- végigolvassa a teljes cél `llmAnalysis` állományt,
- összehasonlítja a `(hashedId, headlineText)` párokat,
- megmutatja, hogy van-e hiányzó, extra vagy duplikált rekord.

Futtatás:

```bash
node --experimental-strip-types scripts/audit-sync.ts
```

Vagy package scriptként:

```bash
vp run audit:sync
```

Mit érdemes nézni a kimenetben:

- `missingInTargetCount`: ennyi forrás rekord hiányzik a célból
- `extraInTargetCount`: ennyi cél rekord nincs már benne a forrásban
- `targetDuplicatePairCount`: ennyi duplikált `(hashedId, headlineText)` pár van a célban

Ha minden rendben van, akkor tipikusan ezt szeretnéd látni:

- `missingInTargetCount = 0`
- `extraInTargetCount = 0`
- `targetDuplicatePairCount = 0`

### Cleanup script

Fájl: `scripts/cleanup-extra-llm-analysis.ts`

Feladata:

- megkeresi azokat a `llmAnalysis` rekordokat, amelyek már nincsenek benne a forrás `headlineDefinitions` táblában,
- és törli őket a cél Convexből.

#### Dry run

Először mindig dry-run módban érdemes futtatni:

```bash
node --experimental-strip-types scripts/cleanup-extra-llm-analysis.ts --dry-run
```

Vagy:

```bash
vp run cleanup:llm-analysis --dry-run
```

Ez nem töröl semmit, csak megmutatja:

- hány extra rekord lenne törölve,
- és ad egy mintát az érintett azonosítókból.

#### Valódi törlés

Ha a dry-run eredménye helyesnek tűnik, akkor jöhet az éles futtatás:

```bash
node --experimental-strip-types scripts/cleanup-extra-llm-analysis.ts
```

Vagy:

```bash
vp run cleanup:llm-analysis
```

A script batch-ekben töröl, és a végén kiírja, hány rekordot törölt.

## Ajánlott üzemeltetési sorrend

Ha eltérést látsz a forrás és a cél között:

1. Futtasd az audit scriptet.
2. Ha `missingInTargetCount > 0`, futtasd a szinkront vagy ideiglenesen a backfill módot.
3. Ha `extraInTargetCount > 0`, előbb dry-run cleanup, majd éles cleanup.
4. Futtasd újra az audit scriptet ellenőrzésként.

## Backfill mód

A `FULL_BACKFILL=true` környezeti változóval a szinkron nem csak az új rekordokat nézi, hanem végigmegy a forráson és minden hiányzó `llmAnalysis` rekordot pótol.

Normál működéshez ezt érdemes kikapcsolva tartani:

```env
FULL_BACKFILL=false
```

Backfill után ajánlott:

- visszaállítani `false` értékre,
- újraindítani a szolgáltatást,
- majd futtatni egy auditot.
