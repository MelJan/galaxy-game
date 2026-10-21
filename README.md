# Galaxy Game

Vertikaler Arcade-Space-Shooter im Retro-Pixel-Look auf echtem 3D-Hintergrund. Three.js, Vite, TypeScript.

```bash
npm install
npm run dev        # http://localhost:5180  (Sprite-Vorschau: /sprites.html)
npm run build      # Typecheck + Produktions-Build nach dist/
```

**Schwierigkeitsgrade** (Auswahl auf dem Titelbildschirm, wird gespeichert; Werte in `src/game/Difficulty.ts`):

| Stufe | Gegner-Leben | Schusstempo | Punkte |
|---|---|---|---|
| Sehr leicht | ×0,5 | ×0,8 | ×0,5 |
| Leicht | ×1 | ×1 | ×1 |
| Normal | ×2 | ×1,1 | ×1,5 |
| Schwer | ×3 | ×1,2 | ×2 |
| Unmöglich | ×5 | ×1,3 | ×3 |

**Speichern:** 10 Slots, automatisch benannt (Sektor, Welle bzw. Boss, Schwierigkeit, Zeitstempel). Speichern in der Werft
(Knopf „SPEICHERN“) oder in der Pause (P, dann S). Mitten in einer Welle gespeichert, geht es beim Laden am Anfang dieser
Welle weiter. Laden über „SPIEL LADEN“ auf dem Titelbildschirm, Entf löscht einen Slot. Gespeichert im `localStorage`.

**Durchgespielt:** Nach dem letzten Endgegner beginnt Sektor 1 auf dem nächsten Schwierigkeitsgrad – Upgrades, Gold und
Score bleiben. Auf Unmöglich steigen danach die Stufen (Gegner werden weiter zäher und schießen schneller).

**Steuerung:** WASD / Pfeiltasten bewegen · Leertaste schießen · P / Esc Pause · Enter Neustart nach Game Over · Esc dort zurück zur Stufenwahl
G Grafikmodus (smooth / retro) · M Musik an/aus · N Ton an/aus

**Zum Testen** (URL-Parameter, kombinierbar, siehe `src/dev/flags.ts`):
`?wave=12` startet bei Welle 12 · `?boss=2` direkt beim 2. Endgegner (1–9, Zwischenboss mitgezählt) · `?god` unverwundbar · `?bosshp=0.2` Boss mit 20 % Lebenspunkten ·
`?shop&gold=500` öffnet gleich die Werft mit 500 Gold · `?diff=0`–`4` wählt die Stufe. Jeder dieser Schalter überspringt den Titelbildschirm.
Im Dev-Server ist das laufende Spiel als `window.__game` erreichbar (für automatisierte Tests).

## Spielablauf

Acht Sektoren mit eigenen Gegnern, Nebelfarben, Musik und Endgegner. Danach beginnt eine neue, härtere Stufe.

| Sektor | Gegner | Endgegner |
|---|---|---|
| 1 · Imperiale Grenze (Wellen 1–10) | Drohnen, Jäger, Kreuzer | **Mutterschiff** (Teile zerstören): 3 Kanonen mit Sinuswellen und 8 Begleitdrohnen, dann liegt der Fusionskern frei |
| 2 · Der Schwarm (Wellen 11–18) | Schwärmer (verfolgen dich), Speier (Säure), Brüter (brüten aus, zerplatzen) | **Schwarmkönigin** (Timing): gepanzert und regenerierend, nur verwundbar, wenn sie brüllend die Kiefer aufreißt. Legt Eier, aus denen Brüter schlüpfen. Tentakel lassen sich Glied für Glied abschießen; sind beide ab, ist sie erschöpft |
| 3 · Die Aufgestiegenen (Wellen 19–26) | Phasengleiter (Warp), Wächter (Energieschild, Zielsuch-Kugeln), Lanzenträger (Laser) | **Kristallarche** (Muster-Rätsel): 4 Runenkristalle leuchten in einer Folge auf. In derselben Reihenfolge treffen (je ~3 Treffer), dann fällt der Schild für ein paar Sekunden. Fehler werden bestraft, jede Runde wird die Folge länger |
| 4 · Der Schleim (Wellen 27–34) | Tropfen (prallen an Wänden ab, zerplatzen), Schleimer (Wurfgeschosse), Amöben (nur der Zellkern ist verwundbar) | **Urschleim** (Teilung): hüpft durch die Arena und teilt sich bei jedem Tod in zwei kleinere, bis zu 15 Blobs. Alle müssen weg |
| 5 · Terranische Miliz (Wellen 35–42) | Abfangjäger (Überflug, Feuerstöße), Raketenfregatten (Lenkraketen), Bergbaudrohnen (werfen Felsen), Felsbrocken | Zwischenboss **Stahlrakete** nach Welle 4: erst kalte Booster-Triebwerke zerstören, dann nach der Stufentrennung die Triebwerke der Oberstufe, während sie nach dem Sturzflug abkühlt. Endboss **Asteroidenfestung**: rotierender Asteroid, der Reaktor ist nur vorne verwundbar, Traktorstrahl zieht das Schiff heran |
| 6 · Kristallwesen (Wellen 43–50) | Splitter (Zickzack), Prismen (werfen Treffer zurück), Kristallknospen (platzen in Splitterringe) | **Kristallschwarm**: drei gegenläufige Splitter-Ringe schützen den Kern. Lücke schießen und den Kern treffen, bevor die Splitter nachwachsen. Die Ringe pulsieren nach außen |
| 7 · Der Ereignishorizont (Wellen 51–58) | Gravitationsminen (ziehen an, platzen in Ringe), Leerenaugen (Laser folgt dem Spieler), Schattenjäger (getarnt) | **Singularität**: Schwarzes Loch krümmt alle Geschosse, zieht an und verschluckt Schüsse. Vier kreisende Generatoren mit gekrümmten Schüssen treffen (jeder verstärkt den Sog), dann schrumpft der instabile Kern mit jedem Treffer |
| 8 · Die kosmische Tiefe (Wellen 59–66) | Sternquallen (elektrischer Puls), Anglerfische (lauern und schnellen zu), Sternigel (Stachelring beim Tod) | **Leviathan**: Sternenwurm schlängelt durchs ganze Bild. Vier Kiemen öffnen sich in einer Welle – nur offen verwundbar, jede kostet ihn Schwanzsegmente. Danach ist der Kopf offen, Sturzangriffe auf den Spieler |

**Sound:** Jede Fraktion klingt anders – Metall (Imperium), Fleisch (Schwarm), Kristall (Aufgestiegene) – bei Treffern,
Explosionen und Schüssen. Effekte variieren bei jedem Abspielen leicht. Musik je Sektor und eigener Track je Endgegner
(`src/audio/music.ts`).

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
- `src/ui/` – HUD und Werft

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
