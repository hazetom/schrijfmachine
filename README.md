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

Vraagt Chrome later opnieuw om toestemming (bijvoorbeeld na een herstart), dan staat er rechtsonder "klik om je map weer te koppelen". Eén klik en hij doet het weer. Tot die tijd wordt alles gewoon op de Chromebook bewaard.

Later een andere map kiezen kan via **Meer > Map**.

## Je bestaande tekst inlezen

1. Zet `Tekst.docx` ergens waar de Chromebook bij kan (bijvoorbeeld in je Drive-map).
2. Kies **Meer > Importeer tekst…** en selecteer het bestand.
3. Je krijgt een voorstel: welke regels een nieuw hoofdstuk beginnen ("Proloog", "Act 1 – De moeder") en welke een kopje zijn ("Santorini, Griekenland - 2003"). Pas aan wat niet klopt en klik **Importeer**.

Vet en cursief blijven behouden. Werkt ook met `.md` en `.txt`.

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
  schrijfmachine.json          volgorde, titels, verhaallijnen, status, scènedoelen
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
| Ctrl+Alt+N | Notities open/dicht |
| Ctrl+Alt+H | Hoofdstukken |
| Ctrl+S | Nu opslaan (gebeurt ook vanzelf) |
| Esc | Terug naar schrijven |

Selecteer je tekst, dan verschijnt een klein balkje met B, I, KOP en SCÈNE.

---

## Keuzes die ik zelf heb gemaakt

- **Bladeren:** PageDown/PageUp, klikken in de lege rand naast de tekst, de pijltjes onderin, of scrollen met het touchpad (één pagina per beweging). Typ of wis je over de rand van een pagina, dan slaat de app vanzelf om.
- **Verbleken:** alle alinea's vóór de alinea waar je cursor staat zijn iets lichter. Zet je de cursor terug in een oude alinea, dan wordt die weer donker.
- **Vergrendelen:** de knop **Vergrendel** zet alle eerdere hoofdstukken en de eerdere pagina's van dit hoofdstuk achter een waas. In **Hoofdstukken** kun je ook een eigen reeks kiezen ("Vergrendel 1 t/m 9") of één hoofdstuk apart. Een vergrendeld hoofdstuk kun je niet per ongeluk bewerken. Eén klik op **Ontgrendel** en alles is weer zichtbaar.
- **Verhaallijnen:** de kleurlabels van hoofdstukken komen uit Notities > Verhaallijnen. Je kunt er ook direct een maken vanuit een hoofdstuk ("Nieuwe verhaallijn…"). Kleuren: blauw, rood, oker, groen, pruim en grijs, allemaal gedempt.
- **Status:** Idee, Concept, Herschrijven, Klaar.
- **Volgorde:** slepen in de lijst, de knoppen Omhoog/Omlaag, of Alt+pijltje.
- **Bestandsnamen** van hoofdstukken krijgen de titel van het moment van aanmaken plus een korte code. Hernoem je een hoofdstuk, dan blijft de bestandsnaam gelijk (de nieuwe titel staat wel bovenin het bestand en in het projectbestand). Zo raakt er nooit een bestand zoek.
- **Lege alinea's** (twee keer Enter) bestaan niet in Markdown en verdwijnen bij het opslaan. Gebruik een scènescheiding voor witruimte.
- **Plakken** gaat altijd als platte tekst, zodat er geen vreemde lettertypes of kleuren in je manuscript komen.
- **Typ je verder na een vet of cursief woord,** dan loopt de opmaak door (zoals in Word). Ctrl+B of Ctrl+I zet hem weer uit.
- **De docx-export** gebruikt geen externe library: de app maakt het bestand zelf en pakt het in met de ingebouwde compressie van Chrome. Dat werkt dus ook offline.
- **Geen dagdoel, statistieken of meldingen.** Alleen het aantal woorden per hoofdstuk in het hoofdstukkenscherm.

## Updates

De app werkt offline via een service worker. Na een update op GitHub krijg je de nieuwe versie vanzelf: de eerste keer dat je de app opent wordt hij op de achtergrond binnengehaald, de keer daarna gebruik je hem. Je tekst merkt daar niets van.

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
| `js/docx.js`, `js/zip.js` | export en import van .docx |
| `test.html`, `js/test-page.js` | controlepagina voor de opslag |

**Na elke wijziging** het versienummer `VERSIE` bovenin `sw.js` ophogen, anders blijft de oude versie in de cache.

**Tests** (headless Chromium via Playwright):

```
python3 -m http.server 8123
node tests/markdown.test.mjs        # 20.000 willekeurige teksten heen en terug
node tests/app.test.mjs             # bladeren, opmaak, opslag, herstel, export, import, offline
IMPORT_DOCX=/pad/naar/tekst.docx node tests/app.test.mjs   # ook de import met echte tekst
```

De tests gebruiken in plaats van Google Drive een interne map van de browser (`?testmap=opfs`); die werkt met precies dezelfde code.

Lettertype: Literata, SIL Open Font License (`fonts/OFL-Literata.txt`).
