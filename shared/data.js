/* ============================================================================
 * shared/data.js
 * All static game data + pure helper functions.
 * Loaded by the Node server via require() AND by the browser via <script>.
 * Tweak numbers here to rebalance the game; nothing else needs to change.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TILE = 32;
  const MAX_LV = 60;
  const STATS = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
  const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, BUILD: 4, FLOOR: 5, WALL: 6, DECOR: 7 };
  const SOLID = [0, 0, 1, 1, 1, 0, 1, 1]; // indexed by tile type
  const EL = { fire: '#ff7a33', cold: '#7fd6ff', wind: '#fff06a', holy: '#fff6b0', poison: '#9be34f', none: '#ffffff' };

  /* ------------------------------------------------------------------ CLASSES */
  const CLASSES = {
    swordsman: { name: 'Swordsman', weapon: 'sword', range: 46, aspd: 1000, hp: 1.35, sp: 0.8, basic: 'phys',
      base: { str: 6, agi: 3, vit: 5, int: 1, dex: 3, luk: 1 },
      skills: ['bash', 'provoke', 'endure', 'magnum', 'swordmastery'],
      blurb: 'Tough front-liner. Hits hard, takes hits harder.' },
    mage: { name: 'Mage', weapon: 'rod', range: 190, aspd: 1300, hp: 0.9, sp: 1.6, basic: 'magic',
      base: { str: 1, agi: 2, vit: 3, int: 7, dex: 4, luk: 1 },
      skills: ['firebolt', 'coldbolt', 'lightning', 'thunderstorm', 'sprec'],
      blurb: 'Fragile but devastating elemental spells.' },
    archer: { name: 'Archer', weapon: 'bow', range: 240, aspd: 1050, hp: 0.95, sp: 1.0, basic: 'phys',
      base: { str: 2, agi: 4, vit: 2, int: 1, dex: 7, luk: 2 },
      skills: ['strafe', 'shower', 'owl', 'vulture', 'focus'],
      blurb: 'Deadly from afar. Scales with DEX.' },
    acolyte: { name: 'Acolyte', weapon: 'mace', range: 46, aspd: 1200, hp: 1.1, sp: 1.3, basic: 'phys',
      base: { str: 2, agi: 2, vit: 4, int: 5, dex: 3, luk: 2 },
      skills: ['heal', 'blessing', 'incagi', 'holylight', 'divprot'],
      blurb: 'Healer and buffer. Every party wants one.' },
    merchant: { name: 'Merchant', weapon: 'axe', range: 46, aspd: 1100, hp: 1.2, sp: 0.9, basic: 'phys',
      base: { str: 5, agi: 2, vit: 4, int: 1, dex: 3, luk: 5 },
      skills: ['mammonite', 'discount', 'overcharge', 'loud', 'cartrev'],
      blurb: 'Fights with coin and axe. Gets better shop prices.' },
    thief: { name: 'Thief', weapon: 'knife', range: 46, aspd: 850, hp: 1.0, sp: 0.9, basic: 'phys',
      base: { str: 3, agi: 6, vit: 2, int: 1, dex: 4, luk: 3 },
      skills: ['doubleatk', 'envenom', 'steal', 'hiding', 'dodge'],
      blurb: 'Fast and sneaky. Steals items from monsters.' },
  };

  /* ------------------------------------------------------------------- SKILLS
   * kind: hit | aoe | buff | heal | taunt | steal | hide | passive
   * target: enemy | ally | self.   sp/mult/dur/radius/hits are functions of skill level.
   * req: prerequisite skills (the "skill tree").                                  */
  const SKILLS = {
    // ---- Swordsman
    bash: { cls: 'swordsman', name: 'Bash', icon: '💥', max: 5, kind: 'hit', target: 'enemy', range: 54, cd: 1200,
      sp: l => 6 + l * 2, mult: l => 1.3 + l * 0.3, desc: 'A heavy blow against one enemy.' },
    provoke: { cls: 'swordsman', name: 'Provoke', icon: '😠', max: 5, kind: 'taunt', target: 'self', cd: 6000,
      sp: l => 6 + l * 2, radius: l => 110 + l * 28, desc: 'Enrages nearby monsters so they come for you.' },
    endure: { cls: 'swordsman', name: 'Endure', icon: '🛡️', max: 5, kind: 'buff', target: 'self', cd: 15000,
      sp: l => 10 + l * 2, dur: l => 12000 + l * 6000, mods: l => ({ red: 0.1 + l * 0.05 }),
      note: l => `Damage taken -${10 + l * 5}%`, desc: 'Steel yourself against incoming damage.' },
    magnum: { cls: 'swordsman', name: 'Magnum Break', icon: '🔥', max: 5, kind: 'aoe', target: 'self', center: 'self', el: 'fire',
      cd: 3000, sp: l => 14 + l * 3, radius: l => 80 + l * 14, mult: l => 0.9 + l * 0.3, req: { bash: 2 },
      desc: 'A fiery explosion that burns everything around you.' },
    swordmastery: { cls: 'swordsman', name: 'Sword Mastery', icon: '⚔️', max: 5, kind: 'passive',
      note: l => `ATK +${l * 4}`, desc: 'Permanently raises your attack.' },
    // ---- Mage
    firebolt: { cls: 'mage', name: 'Fire Bolt', icon: '🔥', max: 5, kind: 'hit', magic: true, el: 'fire', target: 'enemy', range: 260,
      cd: 900, sp: l => 8 + l * 2, mult: l => 0.8 + l * 0.22, hits: l => 1 + Math.floor(l / 2), desc: 'Hurls bolts of fire.' },
    coldbolt: { cls: 'mage', name: 'Cold Bolt', icon: '❄️', max: 5, kind: 'hit', magic: true, el: 'cold', target: 'enemy', range: 260,
      cd: 900, sp: l => 8 + l * 2, mult: l => 0.75 + l * 0.2, hits: l => 1 + Math.floor(l / 2),
      slow: { ms: 3500, f: 0.5 }, desc: 'Icy bolts that also slow the target.' },
    lightning: { cls: 'mage', name: 'Lightning Bolt', icon: '⚡', max: 5, kind: 'hit', magic: true, el: 'wind', target: 'enemy', range: 260,
      cd: 1000, sp: l => 9 + l * 2, mult: l => 0.85 + l * 0.24, hits: l => 1 + Math.floor(l / 2), desc: 'Calls down lightning.' },
    thunderstorm: { cls: 'mage', name: 'Thunder Storm', icon: '🌩️', max: 5, kind: 'aoe', magic: true, el: 'wind', target: 'enemy',
      center: 'target', range: 280, cd: 4500, sp: l => 22 + l * 4, radius: l => 70 + l * 8, mult: l => 0.7 + l * 0.22,
      hits: () => 2, req: { lightning: 2 }, desc: 'A storm strikes the area around the target.' },
    sprec: { cls: 'mage', name: 'SP Recovery', icon: '💧', max: 5, kind: 'passive', note: l => `SP regen +${l * 2} per tick`,
      desc: 'Regenerate SP faster.' },
    // ---- Archer
    strafe: { cls: 'archer', name: 'Double Strafe', icon: '🏹', max: 5, kind: 'hit', ranged: true, proj: 'arrow', target: 'enemy',
      range: 290, cd: 1100, sp: l => 8 + l * 2, mult: l => 0.75 + l * 0.15, hits: () => 2, desc: 'Fires two arrows in quick succession.' },
    shower: { cls: 'archer', name: 'Arrow Shower', icon: '🌧️', max: 5, kind: 'aoe', ranged: true, target: 'enemy', center: 'target',
      range: 290, cd: 3000, sp: l => 14 + l * 3, radius: l => 70 + l * 8, mult: l => 0.8 + l * 0.18, req: { strafe: 2 },
      fx: 'arrows', desc: 'Rains arrows on an area.' },
    owl: { cls: 'archer', name: "Owl's Eye", icon: '🦉', max: 5, kind: 'passive', note: l => `DEX +${l}`, desc: 'Sharpens your aim.' },
    vulture: { cls: 'archer', name: "Vulture's Eye", icon: '🦅', max: 5, kind: 'passive', req: { owl: 3 },
      note: l => `Range +${l * 20}px, HIT +${l * 3}`, desc: 'Extends bow range and accuracy.' },
    focus: { cls: 'archer', name: 'Concentration', icon: '🎯', max: 5, kind: 'buff', target: 'self', cd: 30000,
      sp: l => 20 + l * 3, dur: l => 40000 + l * 10000, mods: l => ({ stats: { agi: l * 2, dex: l * 2 }, aspd: 1 - l * 0.03 }),
      note: l => `AGI/DEX +${l * 2}, attack speed +${l * 3}%`, desc: 'Focus your mind: faster and more accurate.' },
    // ---- Acolyte
    heal: { cls: 'acolyte', name: 'Heal', icon: '💚', max: 5, kind: 'heal', target: 'ally', range: 230, cd: 900,
      sp: l => 10 + l * 3, heal: l => 0.5 + l * 0.35, desc: 'Restores HP to yourself or the selected ally.' },
    blessing: { cls: 'acolyte', name: 'Blessing', icon: '✨', max: 5, kind: 'buff', target: 'ally', range: 230, cd: 3000,
      sp: l => 14 + l * 2, dur: l => 60000 + l * 30000, mods: l => ({ stats: { str: l + 1, dex: l + 1, int: l + 1 } }),
      note: l => `STR/DEX/INT +${l + 1}`, desc: 'Bless yourself or an ally.' },
    incagi: { cls: 'acolyte', name: 'Increase AGI', icon: '💨', max: 5, kind: 'buff', target: 'ally', range: 230, cd: 3000,
      sp: l => 16 + l * 2, dur: l => 60000 + l * 20000, mods: l => ({ stats: { agi: l + 2 }, spd: 1.08 + l * 0.03 }),
      req: { blessing: 1 }, note: l => `AGI +${l + 2}, move speed +${8 + l * 3}%`, desc: 'Quickens yourself or an ally.' },
    holylight: { cls: 'acolyte', name: 'Holy Light', icon: '🌟', max: 5, kind: 'hit', magic: true, el: 'holy', target: 'enemy', range: 250,
      cd: 1300, sp: l => 10 + l * 2, mult: l => 1.2 + l * 0.28, req: { heal: 2 }, desc: 'A beam of holy energy.' },
    divprot: { cls: 'acolyte', name: 'Divine Protection', icon: '🙏', max: 5, kind: 'passive',
      note: l => `DEF +${l * 3}, Max HP +${l * 20}`, desc: 'A permanent holy ward.' },
    // ---- Merchant
    mammonite: { cls: 'merchant', name: 'Mammonite', icon: '🪙', max: 5, kind: 'hit', target: 'enemy', range: 54, cd: 1300,
      sp: l => 5 + l, zeny: l => 10 + l * 10, mult: l => 1.5 + l * 0.35, desc: 'Smash with a fistful of coins (costs Zeny).' },
    discount: { cls: 'merchant', name: 'Discount', icon: '🏷️', max: 5, kind: 'passive', note: l => `Buy prices -${l * 2}%`,
      desc: 'Cheaper shopping.' },
    overcharge: { cls: 'merchant', name: 'Overcharge', icon: '💰', max: 5, kind: 'passive', req: { discount: 2 },
      note: l => `Sell prices +${l * 2}%`, desc: 'Better selling prices.' },
    loud: { cls: 'merchant', name: 'Loud Exclamation', icon: '📢', max: 5, kind: 'buff', target: 'self', cd: 20000,
      sp: l => 12 + l * 2, dur: l => 40000 + l * 10000, mods: l => ({ stats: { str: 2 + l * 2 } }), note: l => `STR +${2 + l * 2}`,
      desc: 'A mighty shout boosts your strength.' },
    cartrev: { cls: 'merchant', name: 'Cart Revolution', icon: '🛒', max: 5, kind: 'aoe', target: 'self', center: 'self', cd: 3000,
      sp: l => 12 + l * 3, radius: l => 70 + l * 10, mult: l => 1.0 + l * 0.25, req: { mammonite: 3 },
      desc: 'Spin your cart into nearby enemies.' },
    // ---- Thief
    doubleatk: { cls: 'thief', name: 'Double Attack', icon: '🗡️', max: 5, kind: 'passive', note: l => `${l * 8}% chance to hit twice`,
      desc: 'Basic attacks sometimes strike twice.' },
    envenom: { cls: 'thief', name: 'Envenom', icon: '☠️', max: 5, kind: 'hit', el: 'poison', target: 'enemy', range: 54, cd: 1100,
      sp: l => 8 + l * 2, mult: l => 1.2 + l * 0.2, poison: { ms: l => 5000 + l * 1500 }, desc: 'A poisoned strike that keeps hurting.' },
    steal: { cls: 'thief', name: 'Steal', icon: '🤏', max: 5, kind: 'steal', target: 'enemy', range: 54, cd: 2000, sp: () => 8,
      chance: l => 0.25 + l * 0.1, desc: 'Try to steal an item from a monster (once each).' },
    hiding: { cls: 'thief', name: 'Hiding', icon: '👻', max: 5, kind: 'hide', target: 'self', cd: 4000, sp: () => 10,
      dur: l => 15000 + l * 8000, desc: 'Vanish from monsters. Attacking reveals you.' },
    dodge: { cls: 'thief', name: 'Improve Dodge', icon: '🌀', max: 5, kind: 'passive', note: l => `FLEE +${l * 4}`, desc: 'Easier to evade.' },
  };

  function skillInfo(s, l) {
    const a = [];
    if (s.mult) a.push(`Damage ${Math.round(s.mult(l) * 100)}%` + (s.hits ? ` x${s.hits(l)}` : ''));
    if (s.heal) a.push('Heals ~' + Math.round(s.heal(l) * 100) + '% power');
    if (s.radius) a.push(`Radius ${(s.radius(l) / TILE).toFixed(1)} tiles`);
    if (s.dur) a.push(`Lasts ${Math.round(s.dur(l) / 1000)}s`);
    if (s.chance) a.push(`Success ${Math.round(s.chance(l) * 100)}%+`);
    if (s.note) a.push(s.note(l));
    if (s.kind !== 'passive') { a.push(`SP ${s.sp(l)}`); a.push(`Cooldown ${s.cd / 1000}s`); }
    if (s.zeny) a.push(`${s.zeny(l)}z`);
    return a.join(', ');
  }

  /* -------------------------------------------------------------------- ITEMS */
  const ITEMS = {
    red: { name: 'Red Potion', type: 'use', heal: 55, price: 50, sell: 20, icon: 'potion', col: '#e53935', desc: 'Restores about 55 HP.' },
    orange: { name: 'Orange Potion', type: 'use', heal: 160, price: 180, sell: 80, icon: 'potion', col: '#ff9800', desc: 'Restores about 160 HP.' },
    yellow: { name: 'Yellow Potion', type: 'use', heal: 380, price: 500, sell: 220, icon: 'potion', col: '#fdd835', desc: 'Restores about 380 HP.' },
    blue: { name: 'Blue Potion', type: 'use', sp: 70, price: 300, sell: 120, icon: 'potion', col: '#1e88e5', desc: 'Restores about 70 SP.' },
    flywing: { name: 'Fly Wing', type: 'use', tele: 'rand', price: 60, sell: 25, icon: 'wing', col: '#e3f2fd', desc: 'Teleports you to a random spot on this map.' },
    butterfly: { name: 'Butterfly Wing', type: 'use', tele: 'town', price: 200, sell: 90, icon: 'wing', col: '#ffcc80', desc: 'Returns you to Prontera.' },
    jellopy: { name: 'Jellopy', type: 'etc', sell: 6, icon: 'blob', col: '#ffb3c6', desc: 'Squishy goo.' },
    fluff: { name: 'Fluff', type: 'etc', sell: 7, icon: 'blob', col: '#f5f5f5', desc: 'Soft fluff.' },
    feather: { name: 'Feather', type: 'etc', sell: 9, icon: 'wing', col: '#cfd8dc', desc: 'A light feather.' },
    sticky: { name: 'Sticky Mucus', type: 'etc', sell: 12, icon: 'blob', col: '#aed581', desc: 'Very sticky.' },
    clover: { name: 'Clover', type: 'etc', sell: 14, icon: 'blob', col: '#66bb6a', desc: 'A lucky leaf.' },
    grasshopper: { name: "Grasshopper's Leg", type: 'etc', sell: 16, icon: 'blob', col: '#8bc34a', desc: 'Springy.' },
    wolfclaw: { name: 'Wolf Claw', type: 'etc', sell: 55, icon: 'blob', col: '#bcaaa4', desc: 'Sharp and curved.' },
    bandage: { name: 'Rotten Bandage', type: 'etc', sell: 35, icon: 'blob', col: '#d7ccc8', desc: 'Smells awful.' },
    bone: { name: 'Skel-Bone', type: 'etc', sell: 48, icon: 'blob', col: '#eeeeee', desc: 'A brittle bone.' },
    batwing: { name: 'Bat Wing', type: 'etc', sell: 40, icon: 'wing', col: '#7e57c2', desc: 'Leathery wing.' },
    evilhorn: { name: 'Evil Horn', type: 'etc', sell: 700, icon: 'blob', col: '#6a1b9a', desc: 'A trophy from a demon.' },
    // armor & accessories
    cotton: { name: 'Cotton Shirt', type: 'equip', slot: 'armor', def: 4, mdef: 0, lv: 1, price: 80, sell: 30, icon: 'armor', col: '#bdbdbd', desc: 'DEF 4' },
    padded: { name: 'Padded Armor', type: 'equip', slot: 'armor', def: 9, mdef: 2, lv: 8, price: 700, sell: 280, icon: 'armor', col: '#8d6e63', desc: 'DEF 9' },
    chain: { name: 'Chain Mail', type: 'equip', slot: 'armor', def: 16, mdef: 3, lv: 18, price: 3200, sell: 1300, icon: 'armor', col: '#90a4ae', desc: 'DEF 16' },
    plate: { name: 'Plate Armor', type: 'equip', slot: 'armor', def: 26, mdef: 5, lv: 30, price: 9000, sell: 3600, icon: 'armor', col: '#cfd8dc', desc: 'DEF 26' },
    clip: { name: 'Clip', type: 'equip', slot: 'acc', bonus: { agi: 1 }, lv: 1, price: 600, sell: 240, icon: 'ring', col: '#ffd54f', desc: 'AGI +1' },
    glove: { name: 'Glove', type: 'equip', slot: 'acc', bonus: { dex: 3 }, lv: 10, price: 2000, sell: 800, icon: 'ring', col: '#a1887f', desc: 'DEX +3' },
    rosary: { name: 'Rosary', type: 'equip', slot: 'acc', bonus: { luk: 3, int: 1 }, lv: 15, price: 3500, sell: 1400, icon: 'ring', col: '#ce93d8', desc: 'LUK +3, INT +1' },
    ring_might: { name: 'Ring of Might', type: 'equip', slot: 'acc', bonus: { str: 4, vit: 2 }, lv: 20, price: 8000, sell: 3000, icon: 'ring', col: '#ef5350', desc: 'STR +4, VIT +2' },
  };
  // Weapons are generated: 3 tiers for each weapon type.
  const WEAPONS = { sword: ['Sword', 'Falchion', 'Claymore'], rod: ['Rod', 'Wand', 'Staff'], bow: ['Bow', 'Composite Bow', 'Great Bow'],
    mace: ['Club', 'Mace', 'Morning Star'], axe: ['Axe', 'Battle Axe', 'War Axe'], knife: ['Knife', 'Main Gauche', 'Gladius'] };
  const TIERS = [{ atk: 18, lv: 1, price: 100, sell: 40 }, { atk: 38, lv: 10, price: 1000, sell: 400 }, { atk: 66, lv: 22, price: 5000, sell: 2000 }];
  for (const wt in WEAPONS) WEAPONS[wt].forEach((nm, i) => {
    const t = TIERS[i], rod = wt === 'rod';
    ITEMS[wt + i] = { name: nm, type: 'equip', slot: 'weapon', wtype: wt, lv: t.lv, price: t.price, sell: t.sell, icon: wt, col: '#cfd8dc',
      atk: rod ? 6 + i * 4 : t.atk, matk: rod ? Math.round(t.atk * 1.15) : 0, desc: rod ? `MATK ${Math.round(t.atk * 1.15)}` : `ATK ${t.atk}` };
  });
  const SHOP_EQUIP = ['sword0', 'sword1', 'rod0', 'rod1', 'bow0', 'bow1', 'mace0', 'mace1', 'axe0', 'axe1', 'knife0', 'knife1', 'cotton', 'padded', 'clip', 'glove'];

  /* ----------------------------------------------------------------- MONSTERS */
  const M = (o) => Object.assign({ aggro: 0, range: 36, aspd: 1800, sight: 150, resp: 9000, size: 28, zeny: [2, 8], drops: [] }, o);
  const MONSTERS = {
    poring: M({ name: 'Poring', lv: 1, hp: 60, atk: [5, 9], def: 0, exp: 9, spd: 46, size: 26, zeny: [2, 8],
      drops: [['jellopy', .65], ['red', .08], ['sticky', .05], ['clip', .003]] }),
    fabre: M({ name: 'Fabre', lv: 2, hp: 85, atk: [7, 12], def: 1, exp: 13, spd: 42, size: 28, zeny: [3, 10],
      drops: [['fluff', .6], ['red', .06], ['feather', .05]] }),
    lunatic: M({ name: 'Lunatic', lv: 3, hp: 110, atk: [9, 15], def: 2, exp: 18, spd: 56, size: 26, zeny: [4, 12],
      drops: [['clover', .5], ['fluff', .3], ['red', .08], ['rosary', .002]] }),
    rocker: M({ name: 'Rocker', lv: 5, hp: 190, atk: [13, 22], def: 4, exp: 34, spd: 60, size: 30, zeny: [6, 16],
      drops: [['grasshopper', .5], ['orange', .05], ['feather', .1]] }),
    wolf: M({ name: 'Wolf', lv: 8, hp: 360, atk: [22, 34], def: 7, exp: 78, spd: 82, aggro: 1, sight: 210, range: 40, aspd: 1500, size: 36,
      zeny: [10, 30], drops: [['wolfclaw', .45], ['orange', .1], ['sword1', .008], ['bow1', .008]] }),
    zombie: M({ name: 'Zombie', lv: 11, hp: 720, atk: [38, 56], def: 10, exp: 170, spd: 36, aggro: 1, sight: 170, aspd: 2000, size: 36,
      zeny: [20, 50], drops: [['bandage', .5], ['yellow', .06], ['padded', .03], ['mace1', .01]] }),
    skeleton: M({ name: 'Skeleton', lv: 13, hp: 820, atk: [46, 66], def: 14, exp: 210, spd: 62, aggro: 1, sight: 180, aspd: 1500, size: 36,
      zeny: [25, 60], drops: [['bone', .5], ['orange', .1], ['axe1', .01], ['glove', .01]] }),
    familiar: M({ name: 'Familiar', lv: 12, hp: 520, atk: [34, 48], def: 6, exp: 160, spd: 94, aggro: 1, sight: 220, aspd: 1200, size: 28,
      zeny: [15, 40], drops: [['batwing', .5], ['blue', .08], ['knife1', .01], ['rod1', .01]] }),
    baphomet: M({ name: 'Baphomet Jr.', lv: 25, hp: 9000, atk: [95, 140], def: 28, exp: 2600, spd: 72, aggro: 1, sight: 260, range: 58, aspd: 1300,
      size: 48, boss: true, resp: 180000, zeny: [1500, 2500], aoe: { every: 6000, radius: 100, mult: 1.5 },
      drops: [['evilhorn', 1], ['yellow', .8], ['ring_might', .25], ['plate', .15], ['rosary', .3], ['sword2', .04], ['rod2', .04],
        ['bow2', .04], ['mace2', .04], ['axe2', .04], ['knife2', .04]] }),
  };

  /* --------------------------------------------------------------------- MAPS */
  const MAPS = {
    prontera: { name: 'Prontera', w: 44, h: 32, kind: 'town', seed: 11, spawn: [22, 19],
      portals: [{ r: [42, 14, 2, 4], to: 'field', at: [4, 20] }], mobs: [] },
    field: { name: 'Prontera Field', w: 64, h: 42, kind: 'field', seed: 42, spawn: [4, 20],
      portals: [{ r: [0, 18, 2, 4], to: 'prontera', at: [40, 15] }, { r: [60, 2, 3, 3], to: 'dungeon', at: [6, 37] }],
      mobs: [{ m: 'poring', n: 16 }, { m: 'fabre', n: 12 }, { m: 'lunatic', n: 10 }, { m: 'rocker', n: 8, minX: 16 }, { m: 'wolf', n: 5, minX: 30 }] },
    dungeon: { name: 'Sunken Crypt', w: 56, h: 44, kind: 'dungeon', seed: 7, spawn: [6, 37],
      portals: [{ r: [3, 40, 3, 2], to: 'field', at: [57, 5] }],
      mobs: [{ m: 'zombie', n: 12 }, { m: 'skeleton', n: 12 }, { m: 'familiar', n: 10 }, { m: 'baphomet', n: 1, boss: true }] },
  };

  /* --------------------------------------------------------------------- NPCS */
  const NPCS = {
    dealer: { name: 'Tool Dealer', map: 'prontera', t: [18, 12], look: 'merchant', kind: 'shop', shop: ['red', 'orange', 'yellow', 'blue', 'flywing', 'butterfly'],
      say: 'Potions and wings! Everything an adventurer needs.' },
    smith: { name: 'Blacksmith', map: 'prontera', t: [25, 12], look: 'swordsman', kind: 'shop', shop: 'equip', say: 'Fine steel at fair prices.' },
    captain: { name: 'Guard Captain', map: 'prontera', t: [18, 19], look: 'swordsman', kind: 'quest', quests: ['q_poring', 'q_fabre'],
      say: 'The fields are crawling with pests. Can you lend a hand?' },
    warper: { name: 'Warper', map: 'prontera', t: [25, 19], look: 'mage', kind: 'warp', say: 'Where would you like to go?',
      dests: [{ map: 'prontera', cost: 0 }, { map: 'field', cost: 0 }, { map: 'dungeon', cost: 150 }] },
    sister: { name: 'Sister Mary', map: 'prontera', t: [21, 12], look: 'acolyte', kind: 'heal', say: 'May the light restore you, child.' },
    ranger: { name: 'Ranger Ivy', map: 'field', t: [7, 18], look: 'archer', kind: 'quest', quests: ['q_lunatic', 'q_wolf'],
      say: 'These woods are not what they used to be.' },
    peddler: { name: 'Peddler', map: 'field', t: [7, 22], look: 'merchant', kind: 'shop', shop: ['red', 'orange', 'blue', 'flywing', 'butterfly'],
      say: 'Fresh stock, straight from town!' },
    adventurer: { name: 'Wounded Adventurer', map: 'dungeon', t: [9, 36], look: 'thief', kind: 'quest', quests: ['q_skel', 'q_boss'],
      say: 'Ugh... the crypt is cursed. Please, clear it out.' },
  };

  /* ------------------------------------------------------------------- QUESTS */
  const QUESTS = {
    q_poring: { name: 'Poring Problem', giver: 'captain', minLv: 1, goal: { mob: 'poring', n: 5 },
      text: 'Porings are swarming the fields east of town. Defeat 5 of them.', done: 'Well done! Here is your reward.',
      reward: { exp: 40, zeny: 200, items: [['red', 3]] } },
    q_fabre: { name: 'Fabre Fluff', giver: 'captain', minLv: 2, prereq: 'q_poring', goal: { mob: 'fabre', n: 8 },
      text: 'Fabres are eating the farmers\' crops. Defeat 8 of them.', done: 'The farmers will sleep easier tonight.',
      reward: { exp: 120, zeny: 500, items: [['orange', 3]] } },
    q_lunatic: { name: 'Lunatic Leapers', giver: 'ranger', minLv: 3, goal: { mob: 'lunatic', n: 10 },
      text: 'Lunatics keep spooking my game. Hunt 10 of them.', done: 'Quiet at last. Take this.',
      reward: { exp: 300, zeny: 800, items: [['clip', 1]] } },
    q_wolf: { name: 'Wolf Pack', giver: 'ranger', minLv: 6, prereq: 'q_lunatic', goal: { mob: 'wolf', n: 4 },
      text: 'A wolf pack hunts the road. Defeat 4 wolves.', done: 'The road is safe again. You have earned this.',
      reward: { exp: 700, zeny: 1500, items: [['glove', 1]] } },
    q_skel: { name: 'Restless Bones', giver: 'adventurer', minLv: 10, goal: { mob: 'skeleton', n: 10 },
      text: 'Skeletons rise every night in this crypt. Destroy 10 of them.', done: 'You saved my life. Take what I have.',
      reward: { exp: 2500, zeny: 3000, items: [['yellow', 5]] } },
    q_boss: { name: 'The Demon Below', giver: 'adventurer', minLv: 18, prereq: 'q_skel', goal: { mob: 'baphomet', n: 1 },
      text: 'A little demon rules this crypt. Defeat Baphomet Jr. (bring friends!).', done: 'Impossible... you did it! Legends will be told.',
      reward: { exp: 6000, zeny: 10000, items: [['ring_might', 1]] } },
  };

  /* ------------------------------------------------------------------ HELPERS */
  const expNext = lv => Math.floor(25 * Math.pow(lv, 1.8) + 25);
  const skillLv = (p, id) => (p.skills && p.skills[id]) || 0;

  /** Derive all combat stats from a character (or monster-like) record. */
  function derive(p, now) {
    const C = CLASSES[p.cls], sk = id => skillLv(p, id), s = Object.assign({}, p.stats);
    let atkB = 0, matkB = 0, def = 0, mdef = 0, spd = 1, red = 0, aspdM = 1, flee = 0, hitB = 0, rangeB = 0, hpB = 0;
    for (const slot of ['weapon', 'armor', 'acc']) {
      const it = ITEMS[p.eq && p.eq[slot]]; if (!it) continue;
      atkB += it.atk || 0; matkB += it.matk || 0; def += it.def || 0; mdef += it.mdef || 0;
      if (it.bonus) for (const k in it.bonus) s[k] += it.bonus[k];
    }
    for (const k in (p.buffs || {})) {
      const b = p.buffs[k]; if (now && b.until <= now) continue;
      if (b.stats) for (const st in b.stats) s[st] += b.stats[st];
      if (b.spd) spd *= b.spd; if (b.red) red += b.red; if (b.aspd) aspdM *= b.aspd;
    }
    s.dex += sk('owl'); atkB += sk('swordmastery') * 4; def += sk('divprot') * 3; hpB += sk('divprot') * 20;
    flee += sk('dodge') * 4; hitB += sk('vulture') * 3; rangeB += sk('vulture') * 20;
    const lv = p.lv, phys = C.weapon === 'bow' ? s.dex * 2 + s.str * 0.5 : s.str * 2 + s.dex * 0.5;
    return {
      s, maxHp: Math.floor((40 + lv * 9 + s.vit * 8) * C.hp * (1 + s.vit / 150)) + hpB, maxSp: Math.floor((15 + lv * 4 + s.int * 3) * C.sp),
      atk: Math.floor(lv + phys + atkB), matk: Math.floor(lv + s.int * 2.2 + s.dex / 3 + matkB),
      def: Math.floor(s.vit * 0.8 + def), mdef: Math.floor(s.int * 0.3 + s.vit * 0.2 + mdef),
      hit: lv + s.dex + 20 + hitB, flee: lv + s.agi + 10 + flee, crit: Math.min(60, 1 + s.luk * 0.35 + (p.cls === 'thief' ? 4 : 0)),
      aspd: Math.max(280, Math.round((C.aspd - s.agi * 8 - s.dex * 2) * aspdM)), spd: Math.round(138 * spd), red: Math.min(0.75, red), range: C.range + rangeB,
    };
  }

  /** Shop prices, modified by the Merchant passives. */
  const buyPrice = (p, it) => Math.max(1, Math.ceil(it.price * (1 - 0.02 * skillLv(p, 'discount'))));
  const sellPrice = (p, it) => Math.floor(it.sell * (1 + 0.02 * skillLv(p, 'overcharge')));

  /** Can this class use this equipment item? */
  const canEquip = (cls, it) => !!it && it.type === 'equip' && (it.slot !== 'weapon' || it.wtype === CLASSES[cls].weapon);

  /* ------------------------------------------------------------- MAP BUILDING
   * Maps are generated from a seed, so the client and server always agree. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const mapCache = {};
  function getMap(id) {
    if (mapCache[id]) return mapCache[id];
    const def = MAPS[id], W = def.w, H = def.h, R = rng(def.seed), tiles = new Uint8Array(W * H);
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.WALL : tiles[y * W + x];
    const rect = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t); };
    const border = t => { for (let x = 0; x < W; x++) { set(x, 0, t); set(x, H - 1, t); } for (let y = 0; y < H; y++) { set(0, y, t); set(W - 1, y, t); } };
    const rooms = [], buildings = [];
    let floor = T.GRASS;

    if (def.kind === 'town') {
      rect(0, 0, W, H, T.GRASS); border(T.TREE);
      rect(1, 14, W - 1, 4, T.PATH); rect(20, 7, 4, H - 8, T.PATH); rect(15, 11, 14, 10, T.PATH); rect(21, 15, 2, 2, T.DECOR);
      [[12, 1, 20, 6], [3, 3, 7, 6], [34, 3, 7, 6], [3, 21, 8, 6], [33, 21, 8, 6], [12, 23, 6, 5], [26, 23, 6, 5]]
        .forEach(b => { rect(b[0], b[1], b[2], b[3], T.BUILD); buildings.push(b); });
      for (let i = 0; i < W * H * 0.05; i++) { const x = (R() * W) | 0, y = (R() * H) | 0; if (get(x, y) === T.GRASS) set(x, y, T.TREE); }
      floor = T.PATH;
    } else if (def.kind === 'field') {
      rect(0, 0, W, H, T.GRASS);
      for (let i = 0; i < 6; i++) {            // ponds
        const cx = 8 + R() * (W - 16), cy = 6 + R() * (H - 12), rx = 2.5 + R() * 3, ry = 2 + R() * 2;
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) set(x, y, T.WATER);
      }
      for (let i = 0; i < 18; i++) {           // forest clumps
        const cx = (R() * W) | 0, cy = (R() * H) | 0, n = 10 + ((R() * 10) | 0);
        for (let k = 0; k < n; k++) { const x = cx + Math.round((R() - .5) * 9), y = cy + Math.round((R() - .5) * 7); if (get(x, y) === T.GRASS) set(x, y, T.TREE); }
      }
      border(T.TREE);
      const pts = [[1, 20], [18, 20], [28, 13], [46, 13], [58, 4], [60, 3]];   // the main dirt road
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let s = 0; s <= len; s++) rect(Math.round(ax + (bx - ax) * s / len) - 1, Math.round(ay + (by - ay) * s / len) - 1, 3, 3, T.PATH);
      }
      floor = T.GRASS;
    } else {                                    // dungeon: rooms + corridors (always connected)
      rect(0, 0, W, H, T.WALL); floor = T.FLOOR;
      rooms.push({ x: 2, y: 33, w: 11, h: 9 });
      for (let g = 0; rooms.length < 11 && g < 500; g++) {
        const last = rooms.length === 10;
        const w = last ? 9 + ((R() * 3) | 0) : 5 + ((R() * 6) | 0), h = last ? 8 + ((R() * 3) | 0) : 5 + ((R() * 5) | 0);
        const x = 2 + ((R() * (W - w - 4)) | 0), y = 2 + ((R() * (H - h - 4)) | 0);
        if (rooms.every(r => x > r.x + r.w + 2 || x + w + 2 < r.x || y > r.y + r.h + 2 || y + h + 2 < r.y)) rooms.push({ x, y, w, h });
      }
      const cen = r => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
      const link = (a, b) => {
        const [ax, ay] = cen(a), [bx, by] = cen(b);
        rect(Math.min(ax, bx), ay, Math.abs(bx - ax) + 2, 2, T.FLOOR); rect(bx, Math.min(ay, by), 2, Math.abs(by - ay) + 2, T.FLOOR);
      };
      rooms.forEach(r => rect(r.x, r.y, r.w, r.h, T.FLOOR));
      rooms.forEach((r, i) => { if (i) link(rooms[i - 1], r); if (i > 1 && i % 3 === 0) link(rooms[i - 2], r); });
      rooms.forEach((r, i) => { if (i && r.w >= 8 && r.h >= 7) { set(r.x + 2, r.y + 2, T.DECOR); set(r.x + r.w - 3, r.y + 2, T.DECOR); set(r.x + 2, r.y + r.h - 3, T.DECOR); set(r.x + r.w - 3, r.y + r.h - 3, T.DECOR); } });
    }
    // Keep portals, arrival points and NPC spots walkable.
    for (const p of def.portals) rect(p.r[0], p.r[1], p.r[2], p.r[3], floor === T.GRASS ? T.PATH : floor);
    for (const mid in MAPS) for (const p of MAPS[mid].portals) if (p.to === id) rect(p.at[0] - 2, p.at[1] - 2, 5, 5, floor);
    for (const nid in NPCS) { const n = NPCS[nid]; if (n.map === id) rect(n.t[0] - 1, n.t[1] - 1, 3, 3, floor); }
    return (mapCache[id] = { id, def, w: W, h: H, tiles, rooms, buildings });
  }

  const solidAt = (g, tx, ty) => tx < 0 || ty < 0 || tx >= g.w || ty >= g.h || SOLID[g.tiles[ty * g.w + tx]] === 1;

  return { TILE, MAX_LV, STATS, T, SOLID, EL, CLASSES, SKILLS, ITEMS, WEAPONS, SHOP_EQUIP, MONSTERS, MAPS, NPCS, QUESTS,
    expNext, skillLv, skillInfo, derive, canEquip, buyPrice, sellPrice, rng, getMap, solidAt };
});
