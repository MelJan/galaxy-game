import { SECTORS } from '../game/Waves';
import { getLang, t } from '../i18n';
import type { StoryStep } from './Story';

/** Story-Tafeln je Sprache: die englische Fassung ist eigens formuliert (Witze lassen sich nicht wörtlich übersetzen). */
const say = (de: string, en: string) => (getLang() === 'en' ? en : de);

/** Dauer der Szenen in Sekunden (die Bewegungen dazu stehen in Session.playScene). */
export const SCENE_TIME = { launch: 4.8, depart: 3.2, land: 4.5 } as const;

/** Mitwirkende im Abspann: Aufgabe und Namen (Aufgaben werden mit t() übersetzt). Hier ergänzen oder ändern. */
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
      title: say('DIE ERDE.', 'THE EARTH.'),
      text: say('EIN KLEINER BLAUER PLANET AM RAND DER GALAXIS. IM GALAKTISCHEN REISEKATALOG STEHT ER UNTER "SONSTIGES". DIE ERDLINGE HALTEN DAS FÜR EINE AUSZEICHNUNG.', 'A SMALL BLUE PLANET AT THE EDGE OF THE GALAXY. THE GALACTIC TRAVEL CATALOGUE LISTS IT UNDER "MISCELLANEOUS". EARTHLINGS CONSIDER THIS AN HONOUR.'),
    },
    {
      kind: 'text',
      title: say('DANN KAM DAS SIGNAL.', 'THEN CAME THE SIGNAL.'),
      text: say('EIN DRÖHNEN AUS DEM ZENTRUM DER GALAXIS. ES KLANG WIE EIN STAUBSAUGER, DER GERADE EINE GABEL GEFUNDEN HAT. NUR EBEN ÜBERALL GLEICHZEITIG.', 'A DRONING FROM THE CENTRE OF THE GALAXY. IT SOUNDED LIKE A VACUUM CLEANER THAT HAS JUST FOUND A FORK. ONLY EVERYWHERE AT ONCE.'),
    },
    {
      kind: 'text',
      title: say('ALLE WURDEN WACH.', 'EVERYONE WOKE UP.'),
      text: say('DAS IMPERIUM SCHLOSS SEINE GRENZE AB. DIE SCHWÄRME SCHWÄRMTEN. DER URALTE SCHLEIM KROCH ZUM ERSTEN MAL SEIT 400 MILLIONEN JAHREN LOS - UND WAR ENTSPRECHEND SCHLECHT GELAUNT.', 'THE EMPIRE CLOSED ITS BORDER. THE SWARMS SWARMED. THE ANCIENT SLIME STARTED CRAWLING FOR THE FIRST TIME IN 400 MILLION YEARS - AND WAS IN A CORRESPONDINGLY BAD MOOD.'),
    },
    {
      kind: 'text',
      title: say('SCHULD IST DER WELTENBRECHER.', 'IT IS ALL THE WORLDBREAKER\'S FAULT.'),
      text: say('EINE RIESIGE MASCHINE AM ENDE DER STERNENFLOTTEN. SEINE BEDIENUNGSANLEITUNG HAT 9000 SEITEN. NIEMAND HAT SIE GELESEN. DESHALB WEISS AUCH NIEMAND, WO MAN IHN AUSSCHALTET.', 'A HUGE MACHINE BEYOND THE STAR FLEETS. ITS USER MANUAL HAS 9000 PAGES. NOBODY HAS READ IT, WHICH IS WHY NOBODY KNOWS HOW TO SWITCH IT OFF.'),
    },
    duo
      ? {
          kind: 'text',
          title: say('DER PLAN: HINFLIEGEN, AUSSCHALTEN.', 'THE PLAN: FLY THERE, SWITCH IT OFF.'),
          text: say(
            'DIE ERDE HAT DAFÜR GENAU ZWEI SCHIFFE. JEDES HAT ZWEI KANONEN, EINEN GETRÄNKEHALTER - UND EINEN VON EUCH.',
            'EARTH HAS EXACTLY TWO SHIPS FOR THE JOB. EACH HAS TWO CANNONS, A CUP HOLDER - AND ONE OF YOU.',
          ),
        }
      : {
          kind: 'text',
          title: say('DER PLAN: HINFLIEGEN, AUSSCHALTEN.', 'THE PLAN: FLY THERE, SWITCH IT OFF.'),
          text: say(
            'DIE ERDE HAT DAFÜR GENAU EIN SCHIFF. ES HAT ZWEI KANONEN, EINEN GETRÄNKEHALTER - UND DICH.',
            'EARTH HAS EXACTLY ONE SHIP FOR THE JOB. IT HAS TWO CANNONS, A CUP HOLDER - AND YOU.',
          ),
        },
    {
      kind: 'text',
      title: say('ZEHN SEKTOREN BIS ZUM ZIEL.', 'TEN SECTORS TO GO.'),
      text: say(
        `UNTERWEGS GIBT ES EINE WERFT. DORT ${duo ? 'KÖNNT IHR EURE SCHIFFE' : 'KANNST DU DEIN SCHIFF'} VERBESSERN. DEN GETRÄNKEHALTER LEIDER NICHT, DER IST SCHON PERFEKT.`,
        `THERE IS A SHIPYARD ALONG THE WAY WHERE YOU CAN UPGRADE YOUR ${duo ? 'SHIPS' : 'SHIP'}. NOT THE CUP HOLDER, THOUGH. IT IS ALREADY PERFECT.`,
      ),
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
      title: say('DER WELTENBRECHER IST AUS.', 'THE WORLDBREAKER IS OFF.'),
      text: say('ES STELLTE SICH HERAUS: ES GAB DOCH EINEN AUSSCHALTER. ER WAR HINTEN LINKS, UNTER EINEM SCHILD MIT DER AUFSCHRIFT "BITTE NICHT DRÜCKEN".', 'TURNS OUT THERE WAS AN OFF SWITCH AFTER ALL. BACK LEFT, UNDER A SIGN SAYING "PLEASE DO NOT PRESS".'),
    },
    {
      kind: 'text',
      title: say('STILLE.', 'SILENCE.'),
      text: say('DIE SCHWÄRME FLIEGEN NACH HAUSE, DER SCHLEIM LEGT SICH WIEDER HIN, UND DIE KRISTALLE SUMMEN NUR NOCH LEISE VOR SICH HIN. VERMUTLICH EIN SCHLAGER.', 'THE SWARMS FLY HOME, THE SLIME LIES BACK DOWN, AND THE CRYSTALS JUST HUM QUIETLY TO THEMSELVES. PROBABLY A POWER BALLAD.'),
    },
    { kind: 'scene', scene: 'land', time: SCENE_TIME.land },
    {
      kind: 'text',
      scene: 'landed',
      title: say('WILLKOMMEN ZU HAUSE.', 'WELCOME HOME.'),
      text: say('DIE ERDLINGE HABEN VON ALLEDEM ÜBRIGENS NICHTS MITBEKOMMEN. SIE WAREN MIT DEM WETTER BESCHÄFTIGT.', 'THE EARTHLINGS, BY THE WAY, NOTICED NONE OF THIS. THEY WERE BUSY DISCUSSING THE WEATHER.'),
    },
    { kind: 'roll', html: creditsHtml(info.players) },
    {
      kind: 'text',
      title: duo ? say('DANKE FÜRS SPIELEN, IHR BEIDEN!', 'THANKS FOR PLAYING, BOTH OF YOU!') : say('DANKE FÜRS SPIELEN!', 'THANKS FOR PLAYING!'),
      text: `SCORE ${String(info.score).padStart(7, '0')} · ${info.difficulty}`,
    },
    {
      kind: 'text',
      title: say('ENDE?', 'THE END?'),
      text: say('AM NÄCHSTEN MORGEN KAM EIN NEUES SIGNAL. ES WAR LAUTER. UND ES KLANG IRGENDWIE BELEIDIGT.', 'THE NEXT MORNING A NEW SIGNAL ARRIVED. IT WAS LOUDER. AND IT SOUNDED SOMEHOW OFFENDED.'),
    },
    { kind: 'scene', scene: 'depart', time: SCENE_TIME.depart },
  ];
}

function creditsHtml(players: number): string {
  const block = (head: string, lines: string[]) => `<h3>${t(head)}</h3>${lines.map((l) => `<p>${l}</p>`).join('')}`;
  const villains = SECTORS.map((s) => {
    const bosses = [...(s.midBosses ?? []).map((m) => m.name), s.bossName].map((n) => t(n)).join(' · ');
    return `<p><span class="dim">${t(s.subtitle)}</span><br />${bosses}</p>`;
  }).join('');
  return [
    '<div class="big">GALAXY<br />GAME</div>',
    ...CREW.map(([head, names]) => block(head, names.map((n) => t(n)))),
    `<h3>${t('IN DEN ROLLEN DER BÖSEWICHTE')}</h3>${villains}`,
    block('VERWENDETE SOFTWARE', [
      `THREE.JS<br /><span class="dim">${t('MIT-LIZENZ')}</span>`,
      `${t('PRESS START 2P VON CODEMAN38')}<br /><span class="dim">SIL OPEN FONT LICENSE 1.1</span>`,
      t('ENTWICKELT MIT VITE UND TYPESCRIPT'),
    ]),
    block('GERETTET VON', [t(players === 2 ? 'SPIELER 1 UND SPIELER 2' : 'DIR')]),
    `<p>© 2026 JAN MELCHIOR<br /><span class="dim">${t('KOPIEREN UND VERÄNDERN ERLAUBT, NICHT KOMMERZIELL')}</span></p>`,
    `<p class="dim">${t('BEI DER HERSTELLUNG DIESES SPIELS WURDE KEIN SCHLEIM VERLETZT.')}<br />${t('NUR SEHR VIEL ANDERER.')}</p>`,
  ].join('');
}
