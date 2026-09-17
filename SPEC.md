# Gym appka – specifikace

Osobní webová aplikace (PWA) pro záznam tréninků v posilovně. Jeden uživatel, iPhone, spouštěná z plochy jako samostatná appka. Veškerý text v aplikaci je česky.

## Technické požadavky

- Statická PWA bez backendu, hostovaná na GitHub Pages z repozitáře uživatele.
- Čisté HTML, CSS a JavaScript (ES moduly), bez frameworku a bez build kroku.
- Žádné CDN. Knihovny, fonty a obrázky jsou uložené přímo v repozitáři, aby appka fungovala offline.
- Všechny cesty relativní (appka poběží na adrese `uzivatel.github.io/nazev-repa/`), včetně `start_url` a `scope` v manifestu.
- `manifest.webmanifest` s `display: standalone`, ikony, `apple-touch-icon`, meta tagy pro iOS, `viewport-fit=cover` a respektování safe area (výřez displeje, spodní lišta).
- Service worker: offline cache, nová verze se načte při dalším spuštění. Cache verzovat.
- Data v IndexedDB, uložit po každé akci (potvrzení série, úprava hodnot), aby se nic neztratilo při zavření appky. Požádat o trvalé úložiště (`navigator.storage.persist()`).
- Datové schéma verzované s migracemi, aby budoucí úpravy appky nesmazaly data.
- Grafy vykreslovat vlastním SVG, nebo knihovnou uloženou lokálně.
- Testovat hlavně v nainstalované verzi na iPhonu (appka na ploše má jiné úložiště než Safari).

## Navigace

Spodní lišta: **Domů, Statistiky, Cíle, Cviky, Nastavení**. Během rozdělaného tréninku lze volně přecházet mezi sekcemi, trénink běží dál.

## Domů

- Velké tlačítko **Nový trénink**. Pokud existuje neukončený trénink, je místo něj **Pokračovat v tréninku**.
- Po klepnutí na Nový trénink výběr typu tréninku (1. Hrazda, 2. Bradla, 3. Core…) a posilovny (předvybraná poslední).
- Historie tréninků pod sebou, nejnovější nahoře. Každá položka jen datum a název tréninku. Po rozkliknutí detail: posilovna, délka, všechny cviky a série, poznámky, škály a komentář z konce tréninku.

## Průběh tréninku

- Nahoře malá časomíra celkové délky tréninku.
- Aktuální cvik: název, ukazatel série (např. „Série 2/3“), ilustrační obrázek a tlačítko **Podrobnosti** (otevře detail cviku z encyklopedie).
- U cviku vždy vidět: **minule** (co jsem dal v posledním tréninku) a **doporučení teď** (viz pravidla níže).
- Váha a opakování (nebo čas výdrže) předvyplněné z posledního tréninku. Ovládání tlačítky +/− po nastaveném kroku váhy, případně přímé zadání. Tlačítko **Použít doporučení** přepíše hodnoty doporučenými.
- Údaj o doporučené pauze mezi sériemi (např. „Pauza 5 min“). Appka pauzu neodpočítává, uživatel ji sleduje na hodinkách.
- Tlačítko **Hotovo** potvrdí sérii a přejde na další.
- Poznámka u cviku (volný text, např. „10 opakování, ale ne v celku“) a rychlá volba na příště: **Přidat / Nechat / Snížit**. Volba ovlivní doporučení v příštím tréninku.
- Pod aktuálním cvikem je vždy vidět náhled na další cvik.
- Pořadí cviků je dané šablonou, ale v této session lze cviky přehodit, nahradit jiným, přidat nebo odebrat.

### Ukončení tréninku

- Tlačítko **Ukončit trénink** s potvrzením.
- Souhrn: délka, všechny cviky a série, porovnání s posledním tréninkem stejného typu (co se zlepšilo, co zhoršilo), nové osobní rekordy zvýrazněné zlatě, splněné nebo posunuté cíle.
- Škály 1–5: **energie, spánek, jídlo** a volný komentář (např. „unavený už předem“).
- **Uložit trénink** trénink uzavře a na Domů se vrátí tlačítko Nový trénink.

## Typy cviků

1. **Opakování s váhou.** U cviků s vlastní vahou jde o přidanou váhu: 0 = jen tělo, záporná hodnota = s dopomocí gumou.
2. **Výdrž na čas** (sekundy).
3. **Opakování bez váhy.**

Každý cvik má **krok váhy** (výchozí 2,5 kg, nastavitelný) a **rozsah opakování** (výchozí: počet opakování ze šablony až o 2 víc).

## Posilovny

- Seznam posiloven v Nastavení, na začátku jedna („Hlavní posilovna“).
- Cviky na **kladce** mají poslední hodnoty, doporučení, krok váhy a osobní rekordy **zvlášť pro každou posilovnu**, protože závaží na kladkách se v každé posilovně liší (někde krok 2,5 kg, jinde 2,25 kg).
- Volné váhy a cviky s vlastní vahou jsou společné pro všechny posilovny.

## Pravidla doporučení

- Pokud byly v posledním tréninku splněny všechny série v plném počtu opakování: **+1 opakování**.
- Po dosažení horní hranice rozsahu opakování: **+1 krok váhy** a návrat na spodní hranici rozsahu.
- U výdrže: **+5 s**.
- Nesplněné série: stejné hodnoty.
- Volba na příště z poznámky má přednost: Přidat = posun jako při splnění, Nechat = stejné hodnoty, Snížit = −1 krok váhy (u výdrže −5 s, bez váhy −1 opakování).
- Pokud má cvik aktivní cíl, doporučení se odvozuje z cíle: zbývající přírůstek se rovnoměrně rozpočítá na zbývající tréninky a zaokrouhlí na krok váhy.
- **Drop set** (viz Série) se hodnotí jako celé kolo: splněno vše = +1 opakování u všech stupňů, na horní hranici +1 krok váhy u všech stupňů.

## Série

- Šablona určuje u každého cviku série a pro každou sérii váhu, opakování (nebo čas) a pauzu po sérii.
- Série mohou mít různou váhu.
- **Drop set:** několik stupňů se snižující se váhou bez pauzy, pak pauza a další kolo. Zobrazení během tréninku např. „Kolo 1/2, váha 2/3“.

## Šablony tréninků (předvyplnit)

### 1. Hrazda – záda, biceps

| Cvik | Typ | Hodnoty | Pauza |
|---|---|---|---|
| Shyb | vlastní váha + přidaná | +15 kg, 3 × 8 | 5 min |
| Kladka biceps curls | kladka | 9 kg, 3 × 10 | 4 min |
| Kladka pull row | kladka | 43 kg, 3 × 12 | 3 min |
| Dumbell brachialis curls (slant hammer) | jednoručky | 10 kg, 3 × 10 | 4 min |

### 2. Bradla – ramena, triceps, prsa

| Cvik | Typ | Hodnoty | Pauza |
|---|---|---|---|
| Dip | vlastní váha + přidaná | +35 kg, 3 × 10 | 5 min |
| Shoulder press dumbell | jednoručky | 15 kg, 3 × 8 | 4 min |
| Shoulder lateral raise | jednoručky, drop set | 2 kola, každé 7,5 kg × 10 → 5 kg × 10 → 2,5 kg × 10 bez pauzy | 3 min mezi koly |
| Overhead + around wheel lift | kotouč | 5 kg, 2 × 10 | 4 min |
| Kladka triceps extension/pulldown | kladka | 22,75 kg, 3 × 10 | 3 min |

### 3. Core – střed těla

Zatím bez cviků, uživatel je doplní v Nastavení.

## Cviky (encyklopedie)

- Vyhledávání podle názvu, přezdívek (vlastní názvy uživatele) a partií.
- Detail cviku: obrázek, partie (hlavní a vedlejší), postup, tipy, **minule** a **doporučení teď**, graf vývoje a osobní rekord.
- Obrázky: stáhnout do repozitáře jen potřebné obrázky z databáze free-exercise-db (github.com/yuhonas/free-exercise-db, public domain). Kde vhodný obrázek chybí, zobrazit neutrální zástupný obrázek.
- U každého cviku možnost nahradit obrázek vlastní fotkou z mobilu (zmenšit na max. 1200 px, uložit do IndexedDB).
- Přidání nového cviku: vlastní, nebo z databáze free-exercise-db. Uživatel doplní český název, přezdívky a typ.
- Uživatel může upravit názvy, přezdívky, popis i tipy.

### Obsah cviků

**Shyb** — přezdívky: shyby, pull-up, shyby se zátěží. Partie: široký sval zádový, biceps, zadní ramena.
Postup: nadhmat o něco širší než ramena, začít z plného visu, stáhnout lopatky dolů a přitáhnout se bradou nad hrazdu, kontrolovaně spustit do plného visu.
Tipy: nehoupat se a nekopat nohama, zátěž na opasku držet u těla, každé opakování začínat z plného visu.

**Kladka biceps curls** — přezdívky: bicepsový zdvih na kladce, bicáky kladka. Partie: biceps, předloktí.
Postup: stoj čelem ke spodní kladce, podhmat, lokty u těla, zdvih k ramenům, pomalé spuštění do natažených paží.
Tipy: lokty se nesmí posouvat dopředu, nezaklánět se, nahoře krátce zpevnit.

**Kladka pull row** — přezdívky: veslování na kladce, přítahy vsedě. Partie: střední část zad, široký sval zádový, zadní ramena, biceps.
Postup: sed na spodní kladce, nohy opřené, záda rovně, přitáhnout rukojeť k břichu, stáhnout lopatky k sobě, kontrolovaně vrátit.
Tipy: netahat zády ani švihem, ramena držet dole, pohyb začínat lopatkami.

**Dumbell brachialis curls (slant hammer)** — přezdívky: kladiva, kladivový zdvih, slant hammer. Partie: brachialis, brachioradialis, biceps.
Postup: jednoručky neutrálním úchopem, ruce mírně vytočené šikmo, lokty u těla, zdvih k ramenům, pomalé spuštění.
Tipy: nehoupat trupem, zápěstí držet pevně v jedné rovině s předloktím, spouštět pomaleji než zvedat.

**Dip** — přezdívky: bradla, dipy, kliky na bradlech. Partie: prsa, triceps, přední ramena.
Postup: vzpor na bradlech, ramena dole, spustit se do mírného předklonu, dokud nadloktí není zhruba vodorovně, vytlačit zpět do vzporu.
Tipy: nepropadat se v ramenou, nechodit hlouběji, než ramena snesou, zátěž na opasku nesmí houpat.

**Shoulder press dumbell** — přezdívky: tlaky na ramena, military s jednoručkami. Partie: přední a střední ramena, triceps.
Postup: sed s oporou zad, jednoručky u ramen, vytlačit nad hlavu, kontrolovaně spustit k ramenům.
Tipy: neprohýbat se v bedrech, lokty mírně před tělem, nahoře nezamykat lokty prudce.

**Shoulder lateral raise** — přezdívky: upažování, lateral raise, drop set ramena. Partie: střední ramena.
Postup: stoj, jednoručky podél těla, upažit do výše ramen s mírně pokrčenými lokty, pomalu spustit.
Tipy: vést pohyb lokty, ne rukama, nekrčit ramena k uším, u drop setu měnit váhu co nejrychleji.

**Overhead + around wheel lift** — přezdívky: kotouč nad hlavu, around the world. Partie: ramena, střed těla.
Postup: 10× zvednout kotouč nad hlavu. Poté ze spodní pozice na jedné straně přenést kotouč obloukem přes hlavu na druhou stranu dolů, totéž opačným směrem.
Tipy: zpevněný střed těla, neprohýbat se v bedrech, pohyb plynulý a kontrolovaný.

**Kladka triceps extension/pulldown** — přezdívky: stahování tricepsu, triceps kladka. Partie: triceps.
Postup: stoj čelem k horní kladce, lokty u těla, propnout paže dolů, kontrolovaně vrátit do úhlu cca 90°.
Tipy: lokty se nehýbou, nezapojovat ramena ani trup, dole krátce zpevnit.

## Statistiky

- Tělesné míry: tělesná váha, obvod bicepsu a další míry, které si uživatel přidá.
- Osobní rekordy u každého cviku podle typu: nejvyšší váha, nejvíc opakování při dané váze, nejdelší výdrž. U kladkových cviků podle posilovny.
- Hodnoty se plní automaticky z tréninků a lze je zapsat i ručně jako jednorázový záznam (např. vážení, změření obvodu, test maxima).
- Každá hodnota jde zobrazit v grafu na časové ose s rozsahy 1 měsíc, 3 měsíce, 1 rok a vše.
- Frekvence tréninků (počet za týden a měsíc).

## Cíle

- Cíl u cviku: za X tréninků zvednout o Y kg víc, případně o Y opakování nebo sekund víc.
- Cíl u tělesné míry: dosáhnout hodnoty (např. tělesná váha, obvod bicepsu), volitelně do data.
- U každého cíle ukazatel postupu. Splněný cíl zlatě a přesune se do splněných.
- Aktivní cíl u cviku ovlivňuje doporučení (viz Pravidla doporučení).

## Nastavení

- Tmavý a světlý režim, výchozí tmavý.
- Typy tréninků: přidat, přejmenovat, smazat, upravit cviky, pořadí, série, váhy, opakování, pauzy, rozsah opakování a krok váhy.
- Posilovny: přidat, přejmenovat, smazat.
- Export dat do souboru JSON (včetně vlastních fotek) přes sdílení iOS (Uložit do Souborů) a import ze souboru. Import s potvrzením, že přepíše současná data.

## Vzhled

Tmavý, industriální, ale hlavně praktický do posilovny.

**Barvy (tmavý režim)**
- Pozadí: skoro černá `#0A0A0A`
- Plochy a karty: tmavě grafitová `#161618`, okraje `#2A2A2D`
- Hlavní akcent: vínová `#7A1C2A` (hlavní tlačítka, aktivní prvky)
- Důležité akce: krvavě červená `#B0141E` (Ukončit trénink, mazání)
- Rekordy a splněné cíle: zlatá `#C8A04A`, používat jen pro ně
- Text: `#ECEAE6`, sekundární text `#8E8B87`

Světlý režim odvodit ze stejných akcentů.

**Typografie**
- Nadpisy: úzké hranaté písmo (Big Shoulders Display, případně Barlow Condensed), velká písmena jen v nadpisech obrazovek.
- Text a čísla: Barlow, čísla s pevnou šířkou číslic (`tabular-nums`).
- Ověřit podporu české diakritiky, fonty uložit lokálně.

**Principy**
- Nejvýraznější prvek appky je obrazovka tréninku: váha a opakování velkými čísly, čitelnými z dálky. Ostatní obrazovky klidné a střídmé.
- Ostré hrany, minimum dekorací, jemná kovová textura nanejvýš v detailech.
- Ovládání jednou rukou: dotykové prvky min. 48 px, hlavní akce ve spodní polovině obrazovky.
- Animace jen jako odezva na akci uživatele (potvrzení série, nový rekord).

## Pořadí stavby

1. Kostra PWA a nasazení na GitHub Pages. Hned ověřit instalaci na plochu iPhonu a spuštění bez prohlížeče.
2. Datový model, IndexedDB, posilovny a předvyplněné šablony.
3. Průběh tréninku, rozdělaný trénink a ukončení se souhrnem.
4. Historie a detail tréninku.
5. Encyklopedie cviků s obrázky.
6. Pravidla doporučení a cíle.
7. Statistiky, grafy a ruční záznamy.
8. Nastavení, světlý režim, export a import.

Po každém kroku nasadit a nechat uživatele vyzkoušet na iPhonu.
