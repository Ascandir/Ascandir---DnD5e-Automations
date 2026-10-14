/**
 * Ascandir - DnD5e Automations
 *
 * Verfolgt im Kampf die Reaktion jeder Kreatur:
 * - Nutzt eine Kreatur außerhalb ihres eigenen Zugs eine Aktivität, die eine Aktion,
 *   Bonusaktion oder Reaktion kostet (z. B. Gelegenheitsangriff, Schild, Höllischer Tadel),
 *   bekommt sie den Zustand „Reaktion verbraucht“. Der Name des Zustands zeigt die genutzte Fähigkeit.
 * - Optional zählt auch eine Reaktion, die im eigenen Zug genutzt wird.
 * - Zu Beginn ihres nächsten eigenen Zugs verliert die Kreatur den Zustand wieder.
 * - Endet der Kampf, wird der Zustand bei allen Teilnehmern entfernt.
 *
 * Technik:
 * - "dnd5e.postUseActivity" feuert auf dem Client, der die Aktivität nutzt (der Besitzer),
 *   dort wird der Zustand angelegt.
 * - Das Entfernen beim Zugwechsel erledigt der aktive Spielleiter über "updateCombat".
 */

const MODULE_ID = "ascandir-dnd5e-action-economy";
const STATUS_ID = "reactionUsed";
const STATUS_DOC_ID = "ascReactionUsed0"; // feste 16-stellige ID, damit es pro Kreatur nur einen Zustand gibt
const STATUS_IMG = `modules/${MODULE_ID}/icons/reaction-used.svg`;

/** Aktivierungsarten, die außerhalb des eigenen Zugs die Reaktion verbrauchen. */
const COUNTED_ACTIVATIONS = new Set(["action", "bonus", "reaction"]);

const SETTINGS = {
  TRACK: "trackWho",
  OWN_TURN: "reactionOnOwnTurn",
  SECOND_USE: "secondUse",
  HIDE_DEATH: "hideDeathSaves",
  DSN_GHOST: "dsnGhostDice"
};

/** Einstellungs-Schlüssel für „Fertigkeit verdeckt würfeln“. */
function skillSettingKey(skill) {
  return skill === "ste" ? "hideStealth" : `hideSkill-${skill}`;
}

/* -------------------------------------------- */
/*  Einstellungen & Zustand                     */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.TRACK, {
    name: "AAE.Settings.Track.Name",
    hint: "AAE.Settings.Track.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "players",
    choices: {
      players: "AAE.Settings.Track.Players",
      all: "AAE.Settings.Track.All"
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.OWN_TURN, {
    name: "AAE.Settings.OwnTurn.Name",
    hint: "AAE.Settings.OwnTurn.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SECOND_USE, {
    name: "AAE.Settings.SecondUse.Name",
    hint: "AAE.Settings.SecondUse.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "warn",
    choices: {
      warn: "AAE.Settings.SecondUse.Warn",
      block: "AAE.Settings.SecondUse.Block",
      off: "AAE.Settings.SecondUse.Off"
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_DEATH, {
    name: "AAE.Settings.HideDeath.Name",
    hint: "AAE.Settings.HideDeath.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false
  });

  // Eine Checkbox pro dnd5e-Fertigkeit (inkl. eigener Fertigkeiten aus CONFIG.DND5E.skills).
  // Heimlichkeit behält ihren alten Schlüssel, damit die bisherige Einstellung erhalten bleibt.
  for ( const skill of Object.keys(CONFIG.DND5E?.skills ?? {}) ) {
    game.settings.register(MODULE_ID, skillSettingKey(skill), {
      name: "AAE.Settings.HideSkill.Name",
      hint: "AAE.Settings.HideSkill.Hint",
      scope: "world",
      config: true,
      restricted: true,
      type: Boolean,
      default: false
    });
  }

  game.settings.register(MODULE_ID, SETTINGS.DSN_GHOST, {
    name: "AAE.Settings.DsnGhost.Name",
    hint: "AAE.Settings.DsnGhost.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  // dnd5e baut CONFIG.statusEffects erst bei "i18nInit" aus dieser Liste zusammen.
  if ( CONFIG.DND5E?.statusEffects ) {
    CONFIG.DND5E.statusEffects[STATUS_ID] = {
      name: "AAE.Status.Name",
      img: STATUS_IMG,
      order: 50
    };
  }
});

Hooks.once("setup", () => {
  // Fertigkeits-Checkboxen benennen und alphabetisch sortieren (Übersetzungen sind jetzt geladen).
  const entries = [];
  for ( const [skill, cfg] of Object.entries(CONFIG.DND5E?.skills ?? {}) ) {
    const id = `${MODULE_ID}.${skillSettingKey(skill)}`;
    const setting = game.settings.settings.get(id);
    if ( !setting ) continue;
    const label = game.i18n.localize(cfg.label ?? skill);
    setting.name = game.i18n.format("AAE.Settings.HideSkill.Name", { skill: label });
    setting.hint = game.i18n.format("AAE.Settings.HideSkill.Hint", { skill: label });
    entries.push([id, setting, label]);
  }
  entries.sort((a, b) => a[2].localeCompare(b[2], game.i18n.lang));
  const dsnId = `${MODULE_ID}.${SETTINGS.DSN_GHOST}`;
  const dsn = game.settings.settings.get(dsnId);
  for ( const [id] of entries ) game.settings.settings.delete(id);
  if ( dsn ) game.settings.settings.delete(dsnId);
  for ( const [id, setting] of entries ) game.settings.settings.set(id, setting);
  if ( dsn ) game.settings.settings.set(dsnId, dsn);

  // Feste Dokument-ID für unseren Zustand (dnd5e vergibt sonst eine eigene).
  const status = CONFIG.statusEffects?.[STATUS_ID];
  if ( status ) status._id = STATUS_DOC_ID;
});

Hooks.once("ready", () => {
  if ( game.system.id !== "dnd5e" ) {
    if ( game.user.isGM ) ui.notifications.warn(game.i18n.localize("AAE.Warnings.WrongSystem"));
    return;
  }
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("deleteCombat", onDeleteCombat);
  Hooks.on("deleteCombatant", onDeleteCombatant);

  // Verdeckte Würfe: vorher (damit der Dialog es schon anzeigt) und nach dem Dialog (damit es sicher gilt).
  Hooks.on("dnd5e.preRollDeathSaveV2", (config, dialog, message) => hideIf(SETTINGS.HIDE_DEATH, message));
  Hooks.on("dnd5e.postDeathSaveRollConfiguration", (rolls, config, dialog, message) => {
    hideIf(SETTINGS.HIDE_DEATH, message);
  });
  Hooks.on("dnd5e.preRollSkillV2", (config, dialog, message) => {
    if ( config.skill ) hideIf(skillSettingKey(config.skill), message);
  });
  Hooks.on("dnd5e.postSkillRollConfiguration", (rolls, config, dialog, message) => {
    if ( config.skill ) hideIf(skillSettingKey(config.skill), message);
  });

  ensureDsnGhostDice();
});

/* -------------------------------------------- */
/*  Verdeckte Würfe                             */
/* -------------------------------------------- */

/**
 * Würfelmodus „Blind“ (nur der Spielleiter sieht das Ergebnis) in der jeweiligen Foundry-Schreibweise.
 * @returns {string}
 */
function getBlindMode() {
  const modes = Object.keys(CONFIG.ChatMessage?.modes ?? {});
  return modes.find(m => m === "blind") ?? modes.find(m => m.includes("blind"))
    ?? CONST.DICE_ROLL_MODES?.BLIND ?? "blindroll";
}

/**
 * Dice So Nice: Damit verdeckte Würfe trotzdem als 3D-Würfel rollen (gesichtslose „Geisterwürfel“,
 * Ergebnis bleibt verborgen), muss in Dice So Nice „Geisterwürfel bei verdeckten Würfen“ aktiv sein.
 * Der Spielleiter-Client schaltet das bei Bedarf ein (sichtbar für alle Spieler).
 */
async function ensureDsnGhostDice() {
  if ( !game.user.isGM || (game.users.activeGM && !game.users.activeGM.isSelf) ) return;
  if ( !game.modules.get("dice-so-nice")?.active ) return;
  if ( !game.settings.get(MODULE_ID, SETTINGS.DSN_GHOST) ) return;

  const ghost = [...game.settings.settings.values()].find(s => (s.namespace === "dice-so-nice")
    && /ghost/i.test(s.key) && (s.scope === "world"));
  if ( !ghost ) {
    console.warn(`${MODULE_ID} | Dice So Nice: Einstellung für Geisterwürfel nicht gefunden.`);
    return;
  }

  const current = game.settings.get("dice-so-nice", ghost.key);
  const off = /disable|deaktiv|none|never|^0\b|^false/i;
  let target;
  if ( (ghost.type === Boolean) || (typeof current === "boolean") ) target = true;
  else if ( ghost.choices ) {
    const label = (k) => `${k} ${game.i18n.localize(String(ghost.choices[k] ?? ""))}`;
    // Steht schon auf einer aktiven Option (z. B. „nur für den Werfenden“), nicht überschreiben.
    if ( (current !== undefined) && !off.test(label(current)) ) return;
    const keys = Object.keys(ghost.choices);
    target = keys.find(k => /all|alle/i.test(label(k)) && !off.test(label(k)))
      ?? keys.filter(k => !off.test(label(k))).pop();
    if ( (target !== undefined) && (typeof current === "number") ) target = Number(target);
  }
  if ( (target === undefined) || (current === target) ) return;

  try {
    await game.settings.set("dice-so-nice", ghost.key, target);
    console.log(`${MODULE_ID} | Dice So Nice: Geisterwürfel für verdeckte Würfe aktiviert (${ghost.key} = ${target}).`);
  } catch(err) {
    console.error(`${MODULE_ID} | Dice So Nice: Geisterwürfel konnten nicht aktiviert werden`, err);
  }
}

/** Setzt den Wurf auf „Blind“, wenn die Einstellung aktiv ist. */
function hideIf(setting, message) {
  if ( !message || !game.settings.settings.has(`${MODULE_ID}.${setting}`) ) return;
  if ( !game.settings.get(MODULE_ID, setting) ) return;
  message.rollMode = getBlindMode();
}

/* -------------------------------------------- */
/*  Hilfsfunktionen                             */
/* -------------------------------------------- */

/**
 * Sucht einen laufenden Kampf, in dem die Kreatur mitkämpft.
 * @param {Actor} actor
 * @returns {{combat: Combat, combatant: Combatant}|null}
 */
function findCombat(actor) {
  if ( !actor ) return null;
  const candidates = [game.combat, ...game.combats].filter(c => c?.started);
  for ( const combat of candidates ) {
    const combatant = combat.combatants.find(c => c.actor?.uuid === actor.uuid);
    if ( combatant ) return { combat, combatant };
  }
  return null;
}

/** Ist die Kreatur gerade selbst am Zug? */
function isOwnTurn(combat, actor) {
  return combat.combatant?.actor?.uuid === actor.uuid;
}

/** Soll diese Kreatur laut Einstellung überwacht werden? */
function isTracked(actor) {
  if ( game.settings.get(MODULE_ID, SETTINGS.TRACK) === "all" ) return true;
  return actor.hasPlayerOwner;
}

/** Bestehende „Reaktion verbraucht“-Effekte einer Kreatur. */
function getReactionEffects(actor) {
  return actor?.effects.filter(e => e.statuses.has(STATUS_ID)) ?? [];
}

/**
 * Würde diese Nutzung die Reaktion verbrauchen?
 * @param {Activity} activity
 * @returns {{combat: Combat, combatant: Combatant}|null}  Kampfdaten, falls ja.
 */
function usesReaction(activity) {
  const actor = activity?.actor;
  if ( !actor || !isTracked(actor) ) return null;

  const type = activity.activation?.type;
  if ( !COUNTED_ACTIVATIONS.has(type) ) return null;

  const found = findCombat(actor);
  if ( !found ) return null;

  if ( isOwnTurn(found.combat, actor) ) {
    // Im eigenen Zug zählt nur eine echte Reaktion – und nur, wenn eingestellt.
    if ( (type !== "reaction") || !game.settings.get(MODULE_ID, SETTINGS.OWN_TURN) ) return null;
  }
  return found;
}

/**
 * Wer räumt auf? Der aktive Spielleiter – ist keiner da, der Nutzer, der die Änderung ausgelöst hat.
 * @param {string} userId
 */
function isResponsibleUser(userId) {
  const gm = game.users.activeGM;
  if ( gm ) return gm.isSelf;
  return userId === game.user.id;
}

/** Entfernt den Zustand von einer Kreatur. */
async function clearReaction(actor) {
  const effects = getReactionEffects(actor);
  if ( !effects.length || !actor.isOwner ) return;
  try {
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  } catch(err) {
    console.error(`${MODULE_ID} | Zustand konnte nicht entfernt werden`, err);
  }
}

/* -------------------------------------------- */
/*  Aktivitäten                                 */
/* -------------------------------------------- */

/**
 * Vor der Nutzung: Ist die Reaktion schon verbraucht, warnen oder blockieren.
 */
function onPreUseActivity(activity) {
  let mode = game.settings.get(MODULE_ID, SETTINGS.SECOND_USE);
  if ( mode === "off" ) return;
  if ( game.user.isGM ) mode = "warn"; // Der Spielleiter wird nie blockiert, nur gewarnt.
  if ( !usesReaction(activity) ) return;
  if ( !getReactionEffects(activity.actor).length ) return;

  const message = game.i18n.format(
    mode === "block" ? "AAE.Notifications.Blocked" : "AAE.Notifications.AlreadyUsed",
    { name: activity.actor.name }
  );
  if ( mode === "block" ) {
    ui.notifications.error(message);
    return false;
  }
  ui.notifications.warn(message);
}

/**
 * Nach der Nutzung: Zustand „Reaktion verbraucht“ mit der genutzten Fähigkeit setzen.
 */
async function onPostUseActivity(activity) {
  const found = usesReaction(activity);
  if ( !found ) return;

  const actor = activity.actor;
  if ( !actor.isOwner ) return;

  // Bereits verbraucht (z. B. trotz Warnung erneut genutzt) – nichts doppelt anlegen.
  if ( getReactionEffects(actor).length ) return;

  const status = CONFIG.statusEffects[STATUS_ID];
  if ( !status ) return;

  const item = activity.item;
  const usedName = item?.name ?? activity.name;
  const baseName = game.i18n.localize("AAE.Status.Name");
  const description = game.i18n.format("AAE.Status.Description", {
    actor: actor.name,
    used: usedName,
    round: found.combat.round
  });

  try {
    // Wie beim manuellen Anklicken im Token-HUD von Foundry erzeugen lassen,
    // damit alle v14-Felder (u. a. Symbol am Token) korrekt gesetzt sind.
    const ActiveEffect = getDocumentClass("ActiveEffect");
    const effect = await ActiveEffect.fromStatusEffect(STATUS_ID);
    const showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS;
    effect.updateSource({
      _id: STATUS_DOC_ID,
      name: `${baseName}: ${usedName}`,
      description: `<p>${description}</p>`,
      origin: item?.uuid ?? null,
      ...(showIcon !== undefined ? { showIcon } : {}),
      flags: {
        [MODULE_ID]: {
          combatId: found.combat.id,
          round: found.combat.round,
          itemUuid: item?.uuid ?? null,
          activityUuid: activity.uuid
        }
      }
    });
    await ActiveEffect.create(effect.toObject(), { parent: actor, keepId: true });
  } catch(err) {
    console.error(`${MODULE_ID} | Zustand konnte nicht gesetzt werden`, err);
  }
}

/* -------------------------------------------- */
/*  Kampfverlauf                                */
/* -------------------------------------------- */

/**
 * Zugwechsel: Wer jetzt dran ist, bekommt seine Reaktion zurück.
 */
function onUpdateCombat(combat, changed, options, userId) {
  if ( !(("turn" in changed) || ("round" in changed)) ) return;
  if ( !isResponsibleUser(userId) ) return;

  // Kampf zurückgesetzt (Runde 0): alle aufräumen.
  if ( !combat.started ) {
    clearCombat(combat);
    return;
  }

  const actor = combat.combatant?.actor;
  if ( actor ) clearReaction(actor);
}

/** Kampf beendet: allen Teilnehmern den Zustand entfernen. */
function onDeleteCombat(combat, options, userId) {
  if ( !isResponsibleUser(userId) ) return;
  clearCombat(combat);
}

/** Kreatur aus dem Kampf entfernt: Zustand entfernen, falls sie in keinem anderen Kampf steht. */
function onDeleteCombatant(combatant, options, userId) {
  if ( !isResponsibleUser(userId) ) return;
  const actor = combatant.actor;
  if ( !actor ) return;
  const stillFighting = game.combats.some(c => (c.id !== combatant.parent?.id) && c.started
    && c.combatants.some(o => o.actor?.uuid === actor.uuid));
  if ( !stillFighting ) clearReaction(actor);
}

function clearCombat(combat) {
  const seen = new Set();
  for ( const combatant of combat.combatants ) {
    const actor = combatant.actor;
    if ( !actor || seen.has(actor.uuid) ) continue;
    seen.add(actor.uuid);
    const stillFighting = game.combats.some(c => (c.id !== combat.id) && c.started
      && c.combatants.some(o => o.actor?.uuid === actor.uuid));
    if ( !stillFighting ) clearReaction(actor);
  }
}
