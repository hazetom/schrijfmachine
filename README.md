# Schrijfmachine

Een rustige schrijfapp voor de Chromebook. Kleuren-e-ink: warm grijs papier, inkt, Literata. Je bladert per pagina zoals op een e-reader, eerdere alinea's verbleken iets, en verder is er niets dat aandacht vraagt.

**De app:** https://hazetom.github.io/schrijfmachine/

**Opslag controleren:** https://hazetom.github.io/schrijfmachine/test.html

Deze repo bevat alleen de code. Je manuscript staat in je eigen map (Google Drive) en op je Chromebook, nooit hier. Voor de zekerheid staan `*.docx`, `Starttekst/` en `manuscript*.md` in `.gitignore`.

---

## Installeren op de Chromebook

1. Log in met je schrijfaccount en open de link hierboven in Chrome.
2. Klik rechts in de adresbalk op het installeer-icoontje (een schermpje met een pijl), of ga naar het menu met de drie puntjes > **Opslaan en delen** > **App installeren**.
3. De Schrijfmachine staat nu in je launcher en opent in een eigen venster, ook zonder internet.

## De map kiezen (Google Drive)

1. Bij de eerste start vraagt de app om een map. Klik **Kies map**.
2. Ga in het venster naar **Google Drive > Mijn Drive** en kies (of maak) je schrijfmap, bijvoorbeeld `Schrijven/Manuscript`.
3. Chrome vraagt of de app in die map mag schrijven. Kies **Bij elk bezoek toestaan** als die keuze er staat, anders **Toestaan**.
4. Klaar. Rechtsonder staat nu "Opgeslagen in Manuscript · 23:14".

Vraagt Chrome later opnieuw om toestemming (bijvoorbeeld na een herstart), dan vraagt de app dat zelf bij je eerste toets of klik. Eén keer **Toestaan** en hij doet het weer. Tot die tijd wordt alles gewoon op de Chromebook bewaard.

Later een andere map kiezen kan via **Meer > Map**.

## Je bestaande tekst inlezen

1. Zet `Tekst.docx` ergens waar de Chromebook bij kan (bijvoorbeeld in je Drive-map).
2. Kies **Meer > Importeer tekst…** en selecteer het bestand.
3. Je krijgt een voorstel: welke regels een nieuw hoofdstuk beginnen ("Proloog", "Act 1 – De moeder") en welke een kopje zijn ("Santorini, Griekenland - 2003"). Pas aan wat niet klopt en klik **Importeer**.

Vet en cursief blijven behouden. Werkt ook met `.md` en `.txt`.

---

## Twee plekken: Schrijven en Boek

De app kent maar twee plekken. **Schrijven** is je pagina. **Boek** is alles over je boek. Rechtsboven staat altijd op dezelfde plek één knop om te wisselen ("Boek" of "Schrijven"), en **Esc** doet hetzelfde.

**Terug waar je was.** Elke sprong is een stap: naar een ander hoofdstuk, een zoektreffer, een personage, je boek. De **terugtoets** bovenaan het Chromebook-toetsenbord (of **Alt+←**) brengt je één stap terug, op dezelfde plek in de tekst. Na een sprong staat onderin ook even "Terug naar De moeder, blz. 12".

**Waar ben ik?** Linksboven staat het pad: De Gevangen Observator › Act 1 › Hoofdstuk 1 · De moeder. Klik op de titel voor het overzicht, op het deel of het hoofdstuk om dat in de lijst open te klappen.

### Boek

De app opent op Boek, met drie tabbladen:

- **Overzicht:** de titel, een grote knop **Verder schrijven** (of gewoon Enter) en de lijst met delen en hoofdstukken. Bij het hoofdstuk waar je bent staat "hier ben je". Klik een hoofdstuk aan en scènedoel, samenvatting, status en verhaallijn klappen eronder open; nog een keer klikken klapt ze in. Heb je verhaallijnen, dan kun je de lijst op één lijn laten zien. Rechts: wat er nog te bekijken is (je aantekeningen, namen die anders gespeld zijn) en vergrendelen.
- **Personages:** wie komt waar voor, je personagekaarten, en de namen in je tekst. Zie hieronder.
- **Aantekeningen:** alles wat je in de tekst noteerde, plus je Ideeën en Verhaallijnen.

Instellingen, exporteren en de rest staan onder **Meer**.

### Snel bewerken in de lijst

Achter elk hoofdstuk staat **···**: openen, hernoemen, nieuw hoofdstuk hierna, nieuw deel vanaf hier, omhoog, omlaag, vergrendelen, verwijderen. Bij een deel: hernoemen, nieuw hoofdstuk in dit deel, deel verwijderen. Slepen kan ook.

**Verwijderen** vraagt niets, maar rechtsonder staat tien seconden **Ongedaan maken**. Daarna is het nog steeds niet weg: er is vooraf een versie gemaakt (**Versies terugzetten**) en het bestand staat in `Prullenbak/` in je map. Een gekozen hoofdstuk kun je ook met de Delete-toets weghalen.

## Aantekeningen in de tekst

Zet je cursor bij een woord (of selecteer een stuk) en druk **Ctrl+Alt+A**, of kies **NOOT** in het balkje dat verschijnt als je iets selecteert. Typ wat je later nog wilt doen of checken, bijvoorbeeld "was dit dinsdag?".

- Het woord krijgt een zacht okerkleurig vlakje. Staat je cursor erin, dan zie je de aantekening onderin, met **Klaar**, **Bewerk** en **Verwijder**.
- Open aantekeningen staan op het overzicht onder "Nog te bekijken" en allemaal bij Boek > Aantekeningen. Een klik brengt je naar de plek.
- Ze schuiven mee als je tekst ervoor schrijft. Ze staan in `schrijfmachine.json`, niet in de tekst zelf, dus ze gaan nooit mee in de export en tellen niet mee bij de woorden.

## Het spiekbriefje

**Spiekbrief** (of **Ctrl+Alt+N**) zet naast je tekst alles over het hoofdstuk waar je in zit: het scènedoel (ook te bewerken), de samenvatting van het vorige hoofdstuk, wie erin voorkomt (een klik opent de kaart, hier naast je tekst), de aantekeningen in dit hoofdstuk, en een vakje om snel een idee te noteren (Ctrl+Enter). Dat idee komt bij Ideeën, met het hoofdstuk erbij.

---

## Hoe het opslaan werkt

Er zijn drie lagen, zodat er niets mis kan gaan:

1. **Op de Chromebook (IndexedDB).** Binnen een halve seconde na je laatste toetsaanslag. Dit is het vangnet en werkt altijd, ook offline en ook zonder map.
2. **In je map.** Anderhalve seconde na je laatste toetsaanslag. Elk hoofdstuk als eigen Markdown-bestand.
3. **Versies.** Elke 10 minuten (als er iets veranderd is) een momentopname op de Chromebook, plus vóór elke ingrijpende actie (importeren, terugzetten, verwijderen). Terugzetten via **Meer > Versies terugzetten**. Daarnaast komt er in je map één keer per dag een leesbaar bestand met het hele manuscript in `Versies/`.

**Nooit iets overschrijven wat buiten de app veranderd is.** Voor elk bestand onthoudt de app wat hij er zelf het laatst in schreef. Heb je een bestand in de tussentijd ergens anders aangepast, dan gaat jouw versie eerst naar `Back-ups/` voordat de app het bestand bijwerkt. Gebeurt dat terwijl de app dicht was, dan vraagt hij bij het openen welke versie je wilt gebruiken; de andere blijft bewaard.

**Eén venster tegelijk.** Open je de app een tweede keer, dan vraagt die eerst of je daar verder wilt. Het andere venster slaat dan alles op en gaat op slot. Zo lopen er nooit twee versies door elkaar.

### Wat er in je map staat

```
Manuscript/
  schrijfmachine.json          volgorde, delen, titels, verhaallijnen, status, scènedoelen, samenvattingen, plaatsnamen
  Hoofdstukken/
    proloog-k3f9.md            één bestand per hoofdstuk
    act-1-de-moeder-a81c.md
  Notities/
    Personages.md
    Verhaallijnen.md
    Ideeen.md
  Versies/                     één leesbaar bestand per dag, 30 dagen bewaard
  Back-ups/                    alleen als iets buiten de app was gewijzigd
  Prullenbak/                  verwijderde hoofdstukken
  Manuscript 2026-10-14 09.12.docx   na "Exporteer manuscript"
```

De Markdown is gewoon leesbaar: `**vet**`, `*cursief*`, `## Kopje` en `* * *` voor een scènescheiding. Een hoofdstukbestand begint met `# Titel`.

## Delen (acts)

In de lijst op het overzicht maak je met **Nieuw deel** of **Nieuw deel vanaf hier** een deel, bijvoorbeeld "Act 1 · De verhoren". Een deel is een kopje boven een groep hoofdstukken. Sleep een hoofdstuk op de kop van een deel om het het eerste hoofdstuk van dat deel te maken. Bovenin het schrijfscherm staat dan "Act 1 · De verhoren › De moeder". In de export krijgt elk deel een eigen pagina.

## Nummering

Hoofdstukken krijgen vanzelf een nummer. Een **Proloog**, **Epiloog**, **Intermezzo** of **Voorwoord** telt niet mee; bij elk ander hoofdstuk kun je dat zelf aanzetten met "Telt niet mee". Per deel (act) kies je of de nummers **doortellen** of **opnieuw bij 1 beginnen**. Bovenin staat dan bijvoorbeeld "Act 1 · De verhoren · Hoofdstuk 1 · De moeder".

## Klaar voor Claude

Selecteer een stuk tekst (of niets) en klik in het balkje op **CLAUDE**, of druk **Ctrl+Alt+C**. Je kiest:

- **Wat er mee moet:** je selectie, dit hoofdstuk, dit deel of het hele boek. Bij een deel of het boek kies je de volledige tekst of alleen de samenvattingen en scènedoelen, dat is veel lichter.
- **Context:** scènedoel, de personagekaarten van wie erin voorkomt, de samenvatting van het vorige hoofdstuk.
- **Wat je wilt weten:** Correctie, Stijl en ritme, De scène, Verhaal en samenhang, Als lezer, plus een eigen vraag. Bij een hoofdstuk kan Claude ook een **samenvatting maken** voor het veld Samenvatting.
- **Hoe ver Claude mag gaan:** aanwijzen (jij herschrijft), voorstellen per zin (standaard), of herschrijven met uitleg.

**Klaar voor Claude** zet het verzoek op het klembord; plak het in je Claude-project. De tekst krijgt alineanummers (A12); in de app typ je **A12** in het zoekveld (Ctrl+F) om er meteen naartoe te gaan. De app onthoudt je keuzes.

**Eenmalig:** maak in Claude een project (bijvoorbeeld "Boek") en plak bij de instructies de tekst die je krijgt met **Projectinstructies kopiëren** onderin het paneel. Je book bible kun je als kennis aan dat project toevoegen.

## Personages

**Jij bepaalt de cast, de app zoekt ze op.** Bij Boek > Personages maak je een kaart per personage (naam, rol, kleur, notities). Vanaf dat moment:

- **Wie komt waar voor:** een raster met je cast tegen alle hoofdstukken. Hoe groter de stip, hoe vaker iemand genoemd wordt. Klik op een stip voor de zinnen zelf, en op een zin om erheen te gaan. Achteraan staat waar iemand **laatst genoemd** is.
- **Eén persoon, alle namen:** "Frank Philips" maakt ook elke losse "Frank" en "Philips" tot dezelfde Frank. Bijnamen zet je bij **Ook genoemd als** op de kaart.
- **Schrijfwijze:** staat er ergens "Phillips" terwijl je personage "Philips" heet, dan meldt de app dat. Kies **Zoek en vervang**, **Is ook Frank Philips** (een bewuste bijnaam) of **Klopt zo**.
- **Klaar voor Claude** op de kaart kopieert een verzoek om de kaart bij te werken, met alle passages waarin dit personage voorkomt.

**Namen in je tekst** (ingeklapt, onderaan) zijn namen die de app vond maar die nog geen personage zijn. Alleen namen die minstens twee keer voorkomen, dus een merk of land dat één keer langskomt zie je niet. Per naam kies je **Personage**, **Hoort bij…** (typ of kies een naam, ook een die nog geen personage is) of **Geen personage**. Is een naam het begin van een andere naam, dan vraagt de app het zelf: "Isa: hoort bij Isabelle?" Vink er een paar aan om ze in één keer op "Geen personage" te zetten; ze komen niet meer terug.

De app vraagt hier nergens anders ongevraagd aandacht voor. Dit gaat zonder AI, dus "hij" en "zij" telt hij niet mee: het raster laat zien waar een naam genoemd wordt.

## Tijdens het schrijven

- **Hoofdstukken in de kantlijn.** Ga met de muis naar de lege rand links van de tekst: daar staan **Overzicht** (naar Boek), je delen en hoofdstukken, en het scènedoel van het hoofdstuk waar je in zit. Eén klik en je zit in een ander hoofdstuk. Zodra je typt, is de lijst weer weg, tenzij je in de instellingen **Hoofdstukken altijd in de kantlijn** aanzet.
- **Terug waar je was.** Per hoofdstuk onthoudt de app waar je cursor stond, ook na afsluiten.
- **Zoeken en vervangen** door het hele manuscript met **Ctrl+F**. Enter springt naar de volgende treffer, op de juiste pagina. "Vervang alles" maakt eerst een versie, dus het is altijd terug te draaien.
- **Scènes.** De kopjes in een hoofdstuk staan in de lijst op het overzicht, onder het scènedoel; een klik brengt je erheen.

## Instellingen (Meer > Instellingen)

- **Avondstand:** uit, aan, of automatisch van 20:00 tot 7:00. Donker warm papier met lichte inkt. Voor een warmere kleur van het hele scherm kun je op de Chromebook ook **Nachtverlichting** aanzetten (klik op de klok rechtsonder).
- **Volledig scherm:** bij de eerste toets of klik verdwijnen plank en titelbalk. Houd **Esc** even ingedrukt om eruit te gaan; dan laat de app je de rest van die sessie met rust.
- **Slimme aanhalingstekens:** " wordt “ of ”, ' wordt ‘ of ’, 's wordt ’s en ... wordt ….

## Exporteren

**Meer > Exporteer manuscript** zet alle hoofdstukken achter elkaar in één `.docx` in je map, met de boektitel (als je die invult via **Meer > Titel van het boek**), elk hoofdstuk op een nieuwe pagina, kopjes, vet, cursief en scènescheidingen. Het lettertype is Literata, dat Google Docs ook kent. In Google Drive: rechtsklik > **Openen met > Google Documenten**.

Elke export krijgt de datum en tijd in de naam, zodat een eerdere export nooit wordt overschreven.

## Sneltoetsen

| Toets | Wat |
|---|---|
| Ctrl+B / Ctrl+I | Vet / cursief |
| Ctrl+Alt+2 | Kopje binnen het hoofdstuk (aan/uit) |
| Ctrl+Shift+Enter, of `***` + Enter | Scènescheiding |
| PageDown / PageUp | Volgende / vorige pagina |
| Klik in de lege rand links of rechts | Bladeren |
| Ctrl+PageDown / Ctrl+PageUp | Volgend / vorig hoofdstuk |
| Ctrl+F | Zoeken en vervangen (of A12: naar alinea 12) |
| Ctrl+Alt+C | Klaar voor Claude |
| Ctrl+Alt+A | Aantekening op de plek van je cursor |
| Ctrl+Alt+N | Spiekbriefje open/dicht |
| Ctrl+Alt+H | Wisselen tussen schrijven en Boek |
| Ctrl+S | Nu opslaan (gebeurt ook vanzelf) |
| Esc | Wisselen tussen schrijven en Boek |
| Terugtoets of Alt+← | Terug naar waar je was |
| Delete (in de lijst) | Hoofdstuk verwijderen, met Ongedaan maken |

Selecteer je tekst, dan verschijnt een klein balkje met B, I, KOP, SCÈNE, NOOT en CLAUDE.

---

## Keuzes die ik zelf heb gemaakt

- **Bladeren:** PageDown/PageUp, klikken in de lege rand naast de tekst, de pijltjes onderin, of scrollen met het touchpad (één pagina per beweging). Typ of wis je over de rand van een pagina, dan slaat de app vanzelf om.
- **Verbleken:** alle alinea's vóór de alinea waar je cursor staat zijn iets lichter. Zet je de cursor terug in een oude alinea, dan wordt die weer donker.
- **Vergrendelen:** de knop **Vergrendel** zet alle eerdere hoofdstukken en de eerdere pagina's van dit hoofdstuk achter een waas. Op het overzicht (rechts, bij Vergrendelen) kun je ook een eigen reeks kiezen ("Vergrendel 1 t/m 9") of één hoofdstuk apart. Een vergrendeld hoofdstuk kun je niet per ongeluk bewerken. Eén klik op **Ontgrendel** en alles is weer zichtbaar.
- **Verhaallijnen:** de kleurlabels van hoofdstukken komen uit Boek > Aantekeningen > Verhaallijnen. Je kunt er ook direct een maken vanuit een hoofdstuk ("Nieuwe verhaallijn…"). Kleuren: blauw, rood, oker, groen, pruim en grijs, allemaal gedempt.
- **Status:** Idee, Concept, Herschrijven, Klaar.
- **Volgorde:** slepen in de lijst, de knoppen Omhoog/Omlaag, of Alt+pijltje.
- **Bestandsnamen** van hoofdstukken krijgen de titel van het moment van aanmaken plus een korte code. Hernoem je een hoofdstuk, dan blijft de bestandsnaam gelijk (de nieuwe titel staat wel bovenin het bestand en in het projectbestand). Zo raakt er nooit een bestand zoek.
- **Lege alinea's** (twee keer Enter) bestaan niet in Markdown en verdwijnen bij het opslaan. Gebruik een scènescheiding voor witruimte.
- **Plakken** gaat altijd als platte tekst, zodat er geen vreemde lettertypes of kleuren in je manuscript komen.
- **Typ je verder na een vet of cursief woord,** dan loopt de opmaak door (zoals in Word). Ctrl+B of Ctrl+I zet hem weer uit.
- **De docx-export** gebruikt geen externe library: de app maakt het bestand zelf en pakt het in met de ingebouwde compressie van Chrome. Dat werkt dus ook offline.
- **Geen dagdoel, statistieken of meldingen.** Alleen het aantal woorden per hoofdstuk en in totaal, op het overzicht.

## Updates

Opnieuw installeren is nooit nodig. De app kijkt bij het opstarten en daarna elk uur of er een nieuwe versie is en haalt die op de achtergrond op. Staat er rechtsonder **Nieuwe versie klaar · klik om bij te werken**, klik dan: alles wordt eerst opgeslagen en de app start even opnieuw. Zelf kijken kan via **Meer > Zoek naar update**; daar staat ook welke versie je hebt.

---

## Voor wie aan de code werkt

Gewone HTML, CSS en JavaScript-modules, zonder build-stap. Alles wordt rechtstreeks door GitHub Pages geserveerd.

| Bestand | Wat |
|---|---|
| `js/markdown.js` | tekstmodel, Markdown heen en terug |
| `js/editor.js` | schrijfscherm met pagina's (CSS-kolommen, per pagina verschoven) |
| `js/richtext.js` | opmaak, sneltoetsen, plakken, selectiebalkje |
| `js/store.js` | het project in het geheugen en in IndexedDB |
| `js/folder.js` | de map: koppelen, veilig schrijven, back-ups |
| `js/snapshots.js` | automatische versies |
| `js/kantlijn.js` | hoofdstukken in de linkerkantlijn |
| `js/zoeken.js` | zoeken en vervangen |
| `js/claude.js` | Klaar voor Claude en de projectinstructies |
| `js/personages.js` | personages herkennen, koppelen en terugvinden |
| `js/instellingen.js` | avondstand, volledig scherm, typografie, versienummer |
| `js/docx.js`, `js/zip.js` | export en import van .docx |
| `test.html`, `js/test-page.js` | controlepagina voor de opslag |

**Na elke wijziging** het versienummer ophogen op twee plekken: `VERSIE` bovenin `sw.js` en `VERSIE` in `js/instellingen.js`. Anders blijft de oude versie in de cache.

**Tests** (headless Chromium via Playwright):

```
python3 -m http.server 8123
node tests/markdown.test.mjs        # 20.000 willekeurige teksten heen en terug
node tests/app.test.mjs             # bladeren, opmaak, opslag, herstel, export, import, offline
IMPORT_DOCX=/pad/naar/tekst.docx node tests/app.test.mjs   # ook de import met echte tekst
```

De tests gebruiken in plaats van Google Drive een interne map van de browser (`?testmap=opfs`); die werkt met precies dezelfde code.

Lettertype: Literata, SIL Open Font License (`fonts/OFL-Literata.txt`).
