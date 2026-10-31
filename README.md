# Galaxy Game

Vertikaler Arcade-Space-Shooter im Retro-Pixel-Look auf echtem 3D-Hintergrund. Three.js, Vite, TypeScript.

```bash
npm install
npm run dev        # http://localhost:5180  (Sprite-Vorschau: /sprites.html)
npm run build      # Lizenzhinweise sammeln, Typecheck, Produktions-Build nach dist/
npm test           # automatische Tests (Spielstände, Migrationen)
npm run itch       # Build und ZIP für den Upload auf itch.io: release/galaxy-game-itch.zip
```

**Veröffentlichen** (der Build nutzt relative Pfade und läuft in jedem Unterordner; Test-Schalter sind dort aus):
- **itch.io:** `npm run itch`, dann im Dashboard „Create new project“ → Kind of project: *HTML* → ZIP hochladen →
  „This file will be played in the browser“ anhaken → Viewport z. B. 1280 × 720, „Fullscreen button“ einschalten.
- **GitHub Pages:** Repo auf GitHub anlegen und pushen, dann unter Settings → Pages → Source „GitHub Actions“ wählen.
  Danach veröffentlicht `.github/workflows/pages.yml` bei jedem Push auf `master` (Tests, Build, Upload) unter
  `https://<name>.github.io/<repo>/`.

**Schwierigkeitsgrade** (Auswahl auf dem Titelbildschirm, wird gespeichert; Werte in `src/game/Difficulty.ts`):

| Stufe | Gegner-Leben | Schusstempo | Boss-Angriffe | Punkte | Besonderheiten |
|---|---|---|---|---|---|
| Sehr leicht | ×0,04 (ein Treffer genügt; Bosse ×0,1) | ×0,65 | ×0,5 | ×0,5 | Für Kinder: 60 % der Gegner, die seltener schießen und langsamer fliegen, +3 Hülle, Bosse steigen flacher an (`bossRamp`), längere Vorwarnungen und Countdowns |
| Leicht | ×1 | ×1 | ×1 | ×1 | |
| Normal | ×2 | ×1,1 | ×1,05 | ×1,5 | |
| Schwer | ×3 | ×1,2 | ×1,15 | ×2 | |
| Unmöglich | ×5 | ×1,3 | ×1,3 | ×3 | |

**Speichern:** 10 Slots, automatisch benannt (Sektor, Welle bzw. Boss, Schwierigkeit, Zeitstempel). Speichern in der Werft
(Knopf „SPEICHERN“) oder in der Pause (P, dann S). Mitten in einer Welle gespeichert, geht es beim Laden am Anfang dieser
Welle weiter. Laden über „SPIEL LADEN“ auf dem Titelbildschirm, Entf löscht einen Slot.
Spielstände speichern nur stabile IDs (Sektor, Welle im Sektor, Boss, Schwierigkeit, Upgrades) und haben eine
Formatversion mit Migration (`src/game/SaveGame.ts`, Regeln im Kopfkommentar, Tests in `SaveGame.test.ts`).
Aller Speicherzugriff läuft über `src/core/storage.ts` (heute `localStorage`, später austauschbar).

**Lizenz des Spiels:** © 2026 Jan Melchior. Freigegeben unter der
[PolyForm Noncommercial License 1.0.0](LICENSE.md): Spielen, kopieren, weitergeben und verändern ist erlaubt, solange es
nicht kommerziell ist. Wer eine Kopie oder veränderte Fassung weitergibt, muss den Lizenztext und den Copyright-Hinweis
(„Required Notice“ in `LICENSE.md`) mitgeben. Geld damit verdienen ist nicht erlaubt.

**Fremde Lizenzen:** Grafik, Sound und Musik sind im Code erzeugt. Fremde Bestandteile: three.js (MIT) und die Schrift
Press Start 2P (SIL Open Font License 1.1, lokal über `@fontsource` eingebunden). `npm run build` schreibt die
Lizenztexte nach `licenses/THIRD_PARTY_NOTICES.txt` und legt `LICENSE.md` als `licenses/LICENSE.txt` daneben; im Spiel stehen beide unter „CREDITS“.

**Durchgespielt:** Nach dem letzten Endgegner beginnt Sektor 1 auf dem nächsten Schwierigkeitsgrad – Upgrades, Gold und
Score bleiben. Auf Unmöglich steigen danach die Stufen (Gegner werden weiter zäher und schießen schneller).

**Controller:** Xbox-artige Controller (XInput/Standard-Belegung, z. B. per Bluetooth) – Stick oder Steuerkreuz bewegt,
A/X/RB/RT feuern, Start pausiert; in Menüs Steuerkreuz + A (bestätigen), B (zurück), X (Slot löschen), Y (in der Pause speichern).
Nicht erkannte Controller werden über eine Rückfall-Belegung unterstützt. Browser melden Controller erst nach einem Tastendruck.

**Zwei Spieler (Koop):** Auf dem Titelbildschirm mit links/rechts wählen. Ohne Controller: Spieler 1 WASD + Leertaste,
Spieler 2 Pfeiltasten + Enter. Mit einem Controller: Spieler 1 Tastatur, Spieler 2 Controller. Mit zwei Controllern: je einer.
Eigene Hülle und Power-ups pro Spieler, gemeinsames Gold, Score und Werft-Upgrades. Abgeschossene kehren nach 10 Sekunden
mit halber Hülle zurück, Game Over erst, wenn beide unten sind. `?players=2` startet zum Testen direkt im Koop.

**Steuerung:** WASD / Pfeiltasten bewegen · Leertaste schießen · P / Esc Pause · Enter Neustart nach Game Over · Esc dort zurück zur Stufenwahl
G Grafikmodus (smooth / retro) · M Musik an/aus · N Ton an/aus

**Zum Testen** (URL-Parameter, kombinierbar, siehe `src/dev/flags.ts`; wirken nur im Dev-Server, nicht im fertigen Build):
`?wave=12` startet bei Welle 12 · `?boss=2` direkt beim 2. Endgegner (1–15, Zwischenbosse mitgezählt; vorher öffnet die Werft mit dem Gold, das man bis dahin ungefähr hätte) · `?god` unverwundbar · `?bosshp=0.2` Boss mit 20 % Lebenspunkten ·
`?shop&gold=500` öffnet gleich die Werft mit 500 Gold · `?diff=0`–`4` wählt die Stufe · `?bot` bzw. `?bot=0.4` Autopilot (Können 0–1; mit `?god` zählt er Treffer statt Schaden und kauft selbst ein) · `?turbo=8` Zeitraffer. Jeder dieser Schalter überspringt den Titelbildschirm.

**Balancing der Endgegner:** `src/game/BossTuning.ts` (Lebenspunkte und Angriffstempo je Boss, steigend entlang der Kampagne) und `bossFire` je Schwierigkeitsgrad in `src/game/Difficulty.ts`.
Im Dev-Server ist das laufende Spiel als `window.__game` erreichbar (für automatisierte Tests).

## Spielablauf

Zehn Sektoren mit eigenen Gegnern, Nebelfarben, Musik und Endgegner. Danach beginnt eine neue, härtere Stufe.

**Sprache:** Deutsch oder Englisch, umschaltbar im Titel (letzter Eintrag oder Taste L); beim ersten Start nach
Browsersprache. Deutsch steht im Code, `t()` aus `src/i18n` holt die englische Fassung aus `src/i18n/en.ts`
(Schlüssel = deutscher Text, Ziffern als `#`). Feste Texte in `index.html` tragen `data-i18n`. Die Story ist je Sprache
eigens formuliert (`src/ui/storyText.ts`). Ein Test (`src/i18n/i18n.test.ts`) meldet fehlende Übersetzungen.

**Highscores:** je Schwierigkeitsgrad im Browser gespeichert (`src/game/Highscores.ts`), angezeigt im Titel und bei
Game Over. Ein Durchlauf zählt für die Stufe, auf der er begonnen hat, auch wenn er nach dem Durchspielen weiterläuft.

**Vorspann und Abspann:** Nach der Wahl der Schwierigkeit erzählt der Vorspann die Geschichte, während das Schiff auf
der Erde steht, dann folgen Countdown und Start. Nach dem Weltenbrecher kommen Epilog, Landung auf der Erde, rollende
Credits und ein neuer Start. Enter/Antippen blättert weiter, Esc/„Überspringen“ überspringt. Texte und Mitwirkende
stehen in `src/ui/storyText.ts`, die Bewegungen in `Session.playScene`.

| Sektor | Gegner | Endgegner |
|---|---|---|
| 1 · Imperiale Grenze (Wellen 1–10) | Drohnen, Jäger, Kreuzer | **Mutterschiff** (Teile zerstören): 3 Kanonen mit Sinuswellen und 8 Begleitdrohnen, dann liegt der Fusionskern frei |
| 2 · Der Schwarm (Wellen 11–18) | Schwärmer (verfolgen dich), Speier (Säure), Brüter (brüten aus, zerplatzen) | **Schwarmkönigin** (Timing): gepanzert und regenerierend, nur verwundbar, wenn sie brüllend die Kiefer aufreißt. Legt Eier, aus denen Brüter schlüpfen. Tentakel lassen sich Glied für Glied abschießen; sind beide ab, ist sie erschöpft |
| 3 · Die Aufgestiegenen (Wellen 19–26) | Phasengleiter (Warp), Wächter (Energieschild, Zielsuch-Kugeln), Lanzenträger (Laser) | **Kristallarche** (Muster-Rätsel): 4 Runenkristalle leuchten in einer Folge auf. In derselben Reihenfolge treffen (je ~3 Treffer), dann fällt der Schild für ein paar Sekunden. Fehler werden bestraft, jede Runde wird die Folge länger |
| 4 · Der Schleim (Wellen 27–34) | Tropfen (prallen an Wänden ab, zerplatzen), Schleimer (Wurfgeschosse), Amöben (nur der Zellkern ist verwundbar) | **Urschleim** (Teilung): hüpft durch die Arena und teilt sich bei jedem Tod in zwei kleinere, bis zu 15 Blobs. Alle müssen weg |
| 5 · Gürtel-Miliz (Wellen 35–42) | Abfangjäger (Überflug, Feuerstöße), Raketenfregatten (Lenkraketen), Bergbaudrohnen (werfen Felsen), Felsbrocken | Zwischenboss **Stahlrakete** nach Welle 4: erst kalte Booster-Triebwerke zerstören, dann nach der Stufentrennung die Triebwerke der Oberstufe, während sie nach dem Sturzflug abkühlt. Endboss **Asteroidenfestung**: rotierender Asteroid, der Reaktor ist nur vorne verwundbar, Traktorstrahl zieht das Schiff heran |
| 6 · Kristallwesen (Wellen 43–50) | Splitter (Zickzack), Prismen (werfen Treffer zurück), Kristallknospen (platzen in Splitterringe) | **Kristallschwarm**: drei gegenläufige Splitter-Ringe schützen den Kern. Lücke schießen und den Kern treffen, bevor die Splitter nachwachsen. Die Ringe pulsieren nach außen |
| 7 · Der Ereignishorizont (Wellen 51–58) | Gravitationsminen (ziehen an, platzen in Ringe), Leerenaugen (Laser folgt dem Spieler), Schattenjäger (getarnt) | **Singularität**: Schwarzes Loch krümmt alle Geschosse, zieht an und verschluckt Schüsse. Vier kreisende Generatoren mit gekrümmten Schüssen treffen (jeder verstärkt den Sog), dann schrumpft der instabile Kern mit jedem Treffer |
| 8 · Die kosmische Tiefe (Wellen 59–66) | Sternquallen (elektrischer Puls), Anglerfische (lauern und schnellen zu), Sternigel (Stachelring beim Tod) | **Leviathan**: Sternenwurm schlängelt durchs ganze Bild. Vier Kiemen öffnen sich in einer Welle – nur offen verwundbar, jede kostet ihn Schwanzsegmente. Danach ist der Kopf offen, Sturzangriffe auf den Spieler |
| 9 · Orbitalfriedhof (Wellen 67–74) | Satelliten (roter Laser nach unten), Weltraumschrott, Funkbaken (werfen Schrott) | Nach Welle 3 **Sternencabrio**: Cabrio mit Alien am Steuer fährt Runden – nur der Akku im Heck ist verwundbar, also wenn es wegfährt; hupt und rast auf den Spieler zu, dreht Donuts, ab 50 % Turbo. Nach Welle 6 **Kosmograd**: drehende Modulstation, Module feuern, wenn sie nach unten zeigen; abgeschossene Module taumeln als Trümmer herab, die Station dreht immer schneller, zuletzt öffnet sich der Kern. Endgegner **Station Unitas**: Gittermast mit vier drehenden Solarsegeln – breitseitig werfen sie Schüsse zurück, nur hochkant kommt man zu den Modulen dahinter; ein Roboterarm greift nach dem Spieler und lässt sich zeitweise abschießen |
| 10 · Die Sternenflotten (Wellen 75–82) | Gabelflügler (weichen ruckartig aus), Kanonenboote, dazu Gleiter und Abfangjäger | Nach Welle 3 **Rebellenstaffel**: vier Asse weichen Schüssen aus; die letzten zwei stürzen sich auf den Spieler. Nach Welle 6 **Forschungskreuzer Odysseus**: Schildring mit wandernder Lücke – nur durch die Lücke verwundbar; springt, fegt mit einem Lichtstrahl, Torpedos teilen sich. Endgegner **Weltenbrecher**: 45-Sekunden-Countdown, in dem alle sechs Energieleiter fallen müssen – sonst feuert ein Strahl über fast die ganze Breite (nur am Rand sicher) und zwei Leiter wachsen nach; danach birst die Linse |

**Sound:** Jede Fraktion klingt anders – Metall (Imperium), Fleisch (Schwarm), Kristall (Aufgestiegene) – bei Treffern,
Explosionen und Schüssen. Effekte variieren bei jedem Abspielen leicht. Musik je Sektor und eigener Track je Endgegner
(`src/audio/music.ts`). Der Arrangeur (`src/audio/arranger.ts`) spielt jedes Stück als Folge von Abschnitten
(Intro, Thema, Gegenstimme, B-Teil mit umgestellten Akkorden, Improvisation, Breakdown, Aufbau, Finale einen Ganzton höher)
mit generierten Melodievarianten, Fills und Filterfahrten. Zwischen den Wellen wird es ruhiger, bei vielen Gegnern dichter.

**Werft:** öffnet nach jedem Endgegner und nach jeder 5. Welle (außer direkt vor einem Boss). Gold gegen dauerhafte
Upgrades bis zum Game Over: Feuerrate, Kanonen (3 Stufen bis zur Dauerstreuung), Durchschlag, Panzerung, Reparatur,
Schildgenerator, Magnet, Verstärker (längere Power-ups), Triebwerk, Begleitdrohnen. Definitionen in `src/game/Upgrades.ts`.

**Power-ups:** Reparatur (+1 Hülle), Schild (3 Treffer), Fächerschuss, Dauerlaser, Zielsuch-Raketen, Begleiter.
Sie kommen nach jeder geschafften Welle, von stärkeren Gegnern und von zerstörten Boss-Schwachpunkten.

## Aufbau

- `src/Game.ts` – Renderer (niedrige interne Auflösung, pixelgenau hochskaliert), Kamera, Bloom, Spielschleife
- `src/config.ts` – Spielfeld, Auflösung, Kamera und Balancing-Werte
- `src/gfx/` – Pixel-Art-Werkzeuge, Sprite-Daten als Zeichenraster, Pixel-Painter für große Sprites (Mutterschiff), Shader-Bausteine
- `src/world/` – Parallax-Hintergrund: Nebel, Sternschichten, Pixel-Planeten (Shader), Asteroiden
- `src/entities/` – Spielerschiff, Gegner mit Flugmustern, Projektile, Gold-Münzen, Power-ups
- `src/entities/bosses/` – Endgegner auf gemeinsamer Basis (`BossBase`: Einflug, Hüllenmaske, Treffer, Laser, Todessequenz)
- `src/game/` – Spieldurchlauf (Kollisionen, Punkte, Hülle), Sektoren und Wellen, Zusatzwaffen
- `src/audio/` – Effekte und Chiptune-Musik, komplett per Web Audio synthetisiert
- `src/fx/` – Partikel, Explosionen, Laserstrahlen
- `src/ui/` – HUD, Werft, Titel, Vorspann und Abspann

Gameplay läuft auf der Ebene z = 0, der Hintergrund liegt in echter 3D-Tiefe dahinter.
Ein Bildschirm-Pixel entspricht auf der Spielebene genau `PIXEL` Welt-Einheiten, Sprites rasten darauf ein.
Sprites werden in `src/gfx/sprites.ts` als Zeichenraster gezeichnet (Schiffe: nur linke Hälfte, wird gespiegelt).

## Roadmap

1. ✅ Schiff, Steuerung, Schießen, Parallax-Hintergrund
2. ✅ Gegnerwellen, Kollisionen, Explosionen, Sound
3. ✅ Drei Sektoren mit je eigenem Endgegner, Power-ups inkl. Laser, Raketen, Begleiter
4. ✅ Gold, Werft und dauerhafte Upgrades
5. Schwierigkeitsskalierung als Endlosschleife
6. Polish: Explosionen, Sound, Screenshake
