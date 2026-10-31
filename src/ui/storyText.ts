import { SECTORS } from '../game/Waves';
import type { StoryStep } from './Story';

/** Dauer der Szenen in Sekunden (die Bewegungen dazu stehen in Session.playScene). */
export const SCENE_TIME = { launch: 4.8, depart: 3.2, land: 4.5 } as const;

/** Mitwirkende im Abspann: Aufgabe und Namen. Hier ergänzen oder ändern. */
const CREW: [string, string[]][] = [
  ['IDEE UND SPIELDESIGN', ['JAN MELCHIOR']],
  ['PROGRAMMIERUNG', ['JAN MELCHIOR', 'MIT CLAUDE (ANTHROPIC)']],
  ['GRAFIK, SOUND UND MUSIK', ['KOMPLETT IM CODE ERZEUGT', 'PIXEL FÜR PIXEL, PIEP FÜR PIEP']],
  ['GETRÄNKEHALTER', ['SERIENAUSSTATTUNG']],
];

/** Vorspann: Wie alles anfing. Im Zweispieler-Modus sprechen die Tafeln beide an. */
export function introSteps(players: number): StoryStep[] {
  const duo = players === 2;
  return [
    {
      kind: 'text',
      scene: 'parked',
      title: 'DIE ERDE.',
      text: 'EIN KLEINER BLAUER PLANET AM RAND DER GALAXIS. IM GALAKTISCHEN REISEKATALOG STEHT ER UNTER "SONSTIGES". DIE ERDLINGE HALTEN DAS FÜR EINE AUSZEICHNUNG.',
    },
    {
      kind: 'text',
      title: 'DANN KAM DAS SIGNAL.',
      text: 'EIN DRÖHNEN AUS DEM ZENTRUM DER GALAXIS. ES KLANG WIE EIN STAUBSAUGER, DER GERADE EINE GABEL GEFUNDEN HAT. NUR EBEN ÜBERALL GLEICHZEITIG.',
    },
    {
      kind: 'text',
      title: 'ALLE WURDEN WACH.',
      text: 'DAS IMPERIUM SCHLOSS SEINE GRENZE AB. DIE SCHWÄRME SCHWÄRMTEN. DER URALTE SCHLEIM KROCH ZUM ERSTEN MAL SEIT 400 MILLIONEN JAHREN LOS - UND WAR ENTSPRECHEND SCHLECHT GELAUNT.',
    },
    {
      kind: 'text',
      title: 'SCHULD IST DER WELTENBRECHER.',
      text: 'EINE RIESIGE MASCHINE AM ENDE DER STERNENFLOTTEN. SEINE BEDIENUNGSANLEITUNG HAT 9000 SEITEN. NIEMAND HAT SIE GELESEN. DESHALB WEISS AUCH NIEMAND, WO MAN IHN AUSSCHALTET.',
    },
    duo
      ? {
          kind: 'text',
          title: 'DER PLAN: HINFLIEGEN, AUSSCHALTEN.',
          text: 'DIE ERDE HAT DAFÜR GENAU ZWEI SCHIFFE. JEDES HAT ZWEI KANONEN, EINEN GETRÄNKEHALTER - UND EINEN VON EUCH.',
        }
      : {
          kind: 'text',
          title: 'DER PLAN: HINFLIEGEN, AUSSCHALTEN.',
          text: 'DIE ERDE HAT DAFÜR GENAU EIN SCHIFF. ES HAT ZWEI KANONEN, EINEN GETRÄNKEHALTER - UND DICH.',
        },
    {
      kind: 'text',
      title: 'ZEHN SEKTOREN BIS ZUM ZIEL.',
      text: `UNTERWEGS GIBT ES EINE WERFT. DORT ${duo ? 'KÖNNT IHR EURE SCHIFFE' : 'KANNST DU DEIN SCHIFF'} VERBESSERN. DEN GETRÄNKEHALTER LEIDER NICHT, DER IST SCHON PERFEKT.`,
    },
    { kind: 'scene', scene: 'launch', time: SCENE_TIME.launch },
  ];
}

/** Abspann nach dem Weltenbrecher: Epilog, Landung auf der Erde, rollende Credits, Dank, Ausblick, neuer Start. */
export function outroSteps(info: { players: number; score: number; difficulty: string }): StoryStep[] {
  const duo = info.players === 2;
  return [
    {
      kind: 'text',
      scene: 'space',
      title: 'DER WELTENBRECHER IST AUS.',
      text: 'ES STELLTE SICH HERAUS: ES GAB DOCH EINEN AUSSCHALTER. ER WAR HINTEN LINKS, UNTER EINEM SCHILD MIT DER AUFSCHRIFT "BITTE NICHT DRÜCKEN".',
    },
    {
      kind: 'text',
      title: 'STILLE.',
      text: 'DIE SCHWÄRME FLIEGEN NACH HAUSE, DER SCHLEIM LEGT SICH WIEDER HIN, UND DIE KRISTALLE SUMMEN NUR NOCH LEISE VOR SICH HIN. VERMUTLICH EIN SCHLAGER.',
    },
    { kind: 'scene', scene: 'land', time: SCENE_TIME.land },
    {
      kind: 'text',
      scene: 'landed',
      title: 'WILLKOMMEN ZU HAUSE.',
      text: 'DIE ERDLINGE HABEN VON ALLEDEM ÜBRIGENS NICHTS MITBEKOMMEN. SIE WAREN MIT DEM WETTER BESCHÄFTIGT.',
    },
    { kind: 'roll', html: creditsHtml(info.players) },
    {
      kind: 'text',
      title: duo ? 'DANKE FÜRS SPIELEN, IHR BEIDEN!' : 'DANKE FÜRS SPIELEN!',
      text: `SCORE ${String(info.score).padStart(7, '0')} · ${info.difficulty}`,
    },
    {
      kind: 'text',
      title: 'ENDE?',
      text: 'AM NÄCHSTEN MORGEN KAM EIN NEUES SIGNAL. ES WAR LAUTER. UND ES KLANG IRGENDWIE BELEIDIGT.',
    },
    { kind: 'scene', scene: 'depart', time: SCENE_TIME.depart },
  ];
}

function creditsHtml(players: number): string {
  const block = (head: string, lines: string[]) => `<h3>${head}</h3>${lines.map((l) => `<p>${l}</p>`).join('')}`;
  const villains = SECTORS.map((s) => {
    const bosses = [...(s.midBosses ?? []).map((m) => m.name), s.bossName].join(' · ');
    return `<p><span class="dim">${s.subtitle}</span><br />${bosses}</p>`;
  }).join('');
  return [
    '<div class="big">GALAXY<br />GAME</div>',
    ...CREW.map(([head, names]) => block(head, names)),
    `<h3>IN DEN ROLLEN DER BÖSEWICHTE</h3>${villains}`,
    block('VERWENDETE SOFTWARE', [
      'THREE.JS<br /><span class="dim">MIT-LIZENZ</span>',
      'PRESS START 2P VON CODEMAN38<br /><span class="dim">SIL OPEN FONT LICENSE 1.1</span>',
      'ENTWICKELT MIT VITE UND TYPESCRIPT',
    ]),
    block('GERETTET VON', [players === 2 ? 'SPIELER 1 UND SPIELER 2' : 'DIR']),
    '<p>© 2026 JAN MELCHIOR<br /><span class="dim">KOPIEREN UND VERÄNDERN ERLAUBT, NICHT KOMMERZIELL</span></p>',
    '<p class="dim">BEI DER HERSTELLUNG DIESES SPIELS WURDE KEIN SCHLEIM VERLETZT.<br />NUR SEHR VIEL ANDERER.</p>',
  ].join('');
}
