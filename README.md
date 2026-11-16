# Pečujeme

Česká aplikace pro jednu domácnost: tablet pro pečovatelky, rodinný přehled na telefonu, denní historie, statistiky a Web Push. Node 22+, Supabase Postgres, Render. Frontend bez sestavování.

## Lokální vyzkoušení

```
npm ci
npm start
```

Otevřete http://localhost:3000. Bez Supabase aplikace běží s **označenými ukázkovými daty v localStorage**. Změny v demu nejsou sdílené mezi zařízeními a neposílají push. Produkce bez databáze se nespustí.

## GitHub → Supabase → Render

1. Nahrajte obsah této složky do nového soukromého GitHub repozitáře. Neuploadujte `.env` ani klíče.
2. V novém Supabase projektu spusťte `database/setup.sql` v SQL editoru **jednou**. Nevkládá žádné osoby ani skutečné návštěvy, pouze výchozí úkony. Existující databáze nejdřív vyžaduje kontrolu schématu. SQL není soubor historie migrací Supabase CLI.
3. V Render vytvořte Blueprint z repozitáře s `render.yaml`. Zvolený tarif zkontrolujte v Render před potvrzením. Pro průběžnou dostupnost používejte službu bez uspávání a jednu instanci (živý přehled používá SSE uvnitř procesu).
4. Vyplňte tajné proměnné v Render:
   - `SUPABASE_URL`: URL projektu (https://…supabase.co).
   - `SUPABASE_SERVICE_ROLE_KEY`: serverový service_role klíč, **nikdy do frontendového kódu**.
   - `ADMIN_PASSWORD`, `TERMINAL_PASSWORD`: různá hesla alespoň 12 znaků. Terminál spárujete jednou heslem, poté pečovatelka vybírá jen své jméno.
   - `SESSION_SECRET`: Blueprint vygeneruje. Ručně alespoň 32 náhodných znaků.
   - `APP_URL`: přesný HTTPS origin Render aplikace, bez cesty.
   - Push: vygenerujte `npx web-push generate-vapid-keys`, uložte `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (např. mailto:spravce@example.cz). Soukromý klíč patří jen do Render secrets. Neupravujte ho po aktivaci telefonů bez nového přihlášení k odběru.
5. Po nasazení se v telefonu přihlaste jako správce a přidejte skutečné pečovatelky. Na tabletu zvolte Domácí terminál a zadejte jeho heslo. Zařízení si přihlášení pamatuje 30 dní.
6. V telefonu otevřete Nastavení → Aktivovat push oznámení. Na iPhonu/iPadu použijte iOS 16.4+ a nejdřív přidejte aplikaci na plochu přes Sdílet → Přidat na plochu. Otestujte příchod, úkon i odchod s vypnutou obrazovkou telefonu.

## Co funguje

- Více přítomných pečovatelek zároveň, samostatné návštěvy a úkony.
- Transakční zápis příchodu/odchodu a úkonu, zámek podle pečovatelky, zákaz dvou otevřených návštěv a idempotentní ID požadavku.
- Záznam úkonů jen během návštěvy; potvrzení odchodu.
- Denní historie, CSV export zvoleného dne, součty hodin, profily a počty jednotlivých úkonů. Čas se ukládá v UTC a zobrazuje v Praze, ukončené směny přes půlnoc se rozdělují do příslušných dnů.
- Živý přehled přes serverové události, trvalá historie v Supabase.
- Web Push se jménem a úkonem, více odběratelských telefonů, odstranění zaniklých odběrů.
- Oddělené oprávnění správce a spárovaného terminálu; tabulky s RLS bez přístupu anon/authenticated. RPC je security invoker, dostupná pouze service_role. Jedna instalace je určena jedné domácnosti.

## Limity a ověření před skutečným provozem

Živá databáze a doručení na fyzický telefon nebyly bez připojeného projektu ověřeny. Před použitím projděte SQL/advisory kontrolu v Supabase, otestujte dvě souběžná přihlášení a celou směnu na tabletu.

Push je odesílán až po uložení události. Síťové selhání push neruší uložený záznam. Zatím není trvalá fronta s opakováním doručení: při restartu serveru mezi uložením a odesláním se zpráva může ztratit. Historie zůstane uložená. Pro garantované pokusy o doručení doplňte outbox a worker. Operační systém může doručení také zpozdit. Aplikace není zdravotnický alarm.

Terminál musí být online. Bez připojení nepotvrzuje úspěšné uložení; offline fronta zatím není implementovaná. Přehled stahuje historii po stránkách, pro dlouhodobě rozsáhlá data doporučujeme serverové filtrování/statistiky. Po změně hesla zůstávají stávající relace platné do expirace; okamžité odhlášení všech zařízení provedete změnou SESSION_SECRET a restartem. Přístup na terminálu vychází z důvěry k fyzicky spárovanému tabletu, nikoli z individuálního ověření jména pečovatelky.

## Kontroly

```
npm test
node --check server.js
node --check public/app.js
```

## Změna hesel v aplikaci

Správce otevře Nastavení → Hesla a přístup. Pro změnu vlastního hesla i hesla terminálu je třeba současné heslo správce, nové heslo (12–128 znaků) a jeho zopakování. Hesla musí být rozdílná. Nová hesla se ukládají jako scrypt otisky do privátní tabulky app_credentials a mají přednost před počátečními hesly v Renderu. Změna odhlásí stará zařízení daného účtu; správce při změně vlastního hesla zůstane přihlášen. Starší instalace aplikují database/passwords.sql jednou; nová instalace obsahuje tabulku v setup.sql.

Při zapomenutí hesla může vlastník projektu v Supabase SQL editoru odstranit pouze odpovídající řádek app_credentials (role admin nebo terminal). Tím obnoví počáteční heslo z Renderu a zneplatní dosavadní relace s databázovou verzí hesla. Neodstraňujte tabulku ani historii péče.

## Čitelnost a správa dat

Rodinný přehled i terminál mají větší písmo, výrazné časy a barevně odlišené karty. Správce (majitel) může vytvářet a odstraňovat úkony i profily pečovatelek. Odstranění skryje položku z nabídky, ale zachová historii. Přítomnou pečovatelku lze odstranit až po odchodu. Terminál nemá oprávnění spravovat profily, úkony ani mazat data.

V Nastavení → Vymazat aktuální data lze vymazat pouze historii, nebo všechna data péče včetně profilů a seznamu úkonů. Akce vyžaduje heslo majitele a slovo VYMAZAT; proběhne v jedné transakci. Hesla, relace zařízení a push odběry zůstanou zachované. Při plném vymazání se výchozí úkony automaticky neobnovují.

Stávající instalace spustí jednou `database/manage-data.sql` před nasazením nové verze. Nové instalace používají pouze `database/setup.sql`, který správu dat již obsahuje. Upgrade samotný žádná data nemaže.
