# Prontera Online

A complete browser-based 2D MMORPG inspired by classic Ragnarok Online.
**Phaser 3** client, **Node.js + Express + Socket.io** authoritative server. No build step, no art files:
all pixel art and sound effects are generated in code at startup.

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Requires Node 18+. Open the page in two browser tabs (or on a phone/tablet on the same Wi-Fi at
`http://<your-computer-ip>:3000`) to see multiplayer in action. Use a different character name in each tab.

Options: `PORT=8080 npm start` to change the port, `ALLOW_CHEATS=1 npm start` to enable testing commands (see below).

## How to play

| Action | Control |
|---|---|
| Move | Click / tap the ground (hold to keep walking), or **WASD / arrow keys** |
| Attack | Click a monster (auto-attacks and chases). **Tab** targets the nearest monster |
| Skills & items | Hotbar **1-9** (also **F1-F9**). Right-click a slot to clear it |
| Assign a hotkey | Hover a skill or inventory item, then **Shift + 1-9** |
| Talk to NPC | Click the NPC (yellow **!** = quest available, green **?** = ready to turn in) |
| Windows | **C** character, **I** inventory, **E** equipment, **K** skills, **P** party, **L** quests, **M** sound |
| Chat | **Enter**. `/g msg` global, `/p msg` party, `/l msg` local, `/w name msg` whisper, `/invite name`, `/leave`, `/who` |
| Select a player | Click them (heal/buff skills use the selected ally; target panel has an *Invite* button) |

**Getting started:** create a character (new name = new character, the password protects it) -> allocate your
8 free stat points (**C**) and your first skill point (**K**) -> talk to the **Guard Captain** in Prontera ->
leave through the east gate to **Prontera Field** -> kill Porings -> return for your reward.
Level 10+ players can use the **Warper** to reach the **Sunken Crypt** (boss: Baphomet Jr., bring a party).

## Features (mapped to the brief)

* **Characters:** name + class (Swordsman, Mage, Archer, Acolyte, Merchant, Thief), six stats (STR AGI VIT INT DEX LUK),
  EXP and levels up to 60, 4 stat points + 1 skill point per level.
* **Skills:** 5 per class (30 total) with levels, prerequisites ("skill tree"), cooldowns, SP costs, buffs, AoE, heals,
  poison, slow, steal, hide, passives.
* **Combat:** real-time server-side combat, auto-attack + skills, monster AI (patrol, aggro, A* chase, leash/return,
  boss slam), floating damage numbers, HP/SP bars, crits/misses, projectiles and spell effects.
* **World:** 3 maps (Prontera town, Prontera Field, Sunken Crypt dungeon), glowing portals, 8 NPCs
  (2 shops, healer, warper, 3 quest givers, ...), day/night cycle (10 real minutes per day; the dungeon is always dark).
* **Economy:** inventory (50 slots), consumables, 3 weapon tiers per class weapon, armor, accessories, equipment slots,
  buy/sell, Zeny, monster drops (auto-looted), Merchant discount/overcharge skills.
* **Quests:** 6 quests in two chains (talk -> kill -> return) with EXP / Zeny / item rewards and an on-screen tracker.
* **Multiplayer:** WebSockets via Socket.io, other players visible, local / global / party / whisper chat with
  chat bubbles, parties (up to 6, shared EXP with +15% bonus per member, HP bars, party chat).
* **UI:** Ragnarok-style draggable windows, minimap, hotbar, target panel, responsive layout, touch support (tablet/phone).
* **Extras:** animated walk/attack/cast frames, procedural SFX + background music per map, persistent characters.

## Project structure

```
prontera-online/
├── package.json
├── shared/
│   └── data.js          # ALL game data: classes, skills, items, monsters, maps, NPCs, quests, stat formulas.
│                        # Loaded by both server (require) and client (<script>). Edit this to rebalance.
├── server/
│   ├── index.js         # Express + Socket.io bootstrap, login, input validation, rate limiting
│   ├── world.js         # Authoritative simulation: 20 Hz tick, movement, monster AI, snapshots, parties, chat
│   ├── combat.js        # Damage formulas, kills/drops/EXP sharing, auto-attack, all skill effects
│   ├── actions.js       # NPC dialogs, shops, quests, inventory, equipment, stat & skill points
│   ├── player.js        # Player model: creation, derived stats, inventory helpers, level-ups
│   ├── nav.js           # Tile collision, wall sliding, A* pathfinding
│   ├── store.js         # JSON-file persistence  (server/data/characters.json)
│   └── data/            # created at runtime
└── public/
    ├── index.html       # page shell + all window containers
    ├── css/style.css    # Ragnarok-style UI theme
    └── js/
        ├── sprites.js   # procedural pixel art: characters, monsters, tiles, item icons
        ├── sound.js     # WebAudio SFX + generative music
        ├── state.js     # shared client state + Socket.io wrapper
        ├── ui.js        # DOM windows, hotbar, chat, shops, quests, party, minimap
        ├── game.js      # Phaser scene: rendering, input, effects, camera
        └── main.js      # login screen + wiring of server events
```

## How multiplayer works

The server owns the truth. Clients send *intent* (`moveTo`, `input`, `target`, `skill`, `use`, `buy`, `chat`, ...);
the server validates everything (range, cooldowns, SP, inventory, prices, levels, class restrictions), simulates at
20 Hz and sends each player a 10 Hz `snap` of the entities near them, plus one-shot effect events (damage numbers,
projectiles, rings). Private state (`self`) is sent only when it changes. The client interpolates between snapshots.

Camera is a smooth-follow top-down view (chosen over isometric for performance and simpler tile maps).

## Customising

* **Add a monster:** add an entry to `MONSTERS` in `shared/data.js`, draw it in `MON` in `public/js/sprites.js`,
  and list it in a map's `mobs`.
* **Add an item / quest / NPC / skill:** add an entry in `shared/data.js`; skills use the generic `kind` handlers
  in `server/combat.js` (`hit`, `aoe`, `buff`, `heal`, `taunt`, `steal`, `hide`, `passive`).
* **Add a map:** add to `MAPS` (+ portals) and a generator branch in `getMap()`; maps are seeded so client and server agree.
* **Use real art:** replace `Sprites.build()` with `this.load.spritesheet(...)` calls using the same texture keys.
* **Testing commands** (only with `ALLOW_CHEATS=1`): `/level 30`, `/zeny 5000`, `/warp field|dungeon|prontera`.
* **Reset all characters:** stop the server and delete `server/data/characters.json`.

## Known limitations (this is a prototype)

* Characters are stored in a JSON file with salted-scrypt password hashes: fine for friends and LAN, swap
  `server/store.js` for a real database before a public deployment (and put the server behind HTTPS).
* One server process, one world instance per map; interest filtering is distance-based, not a spatial grid. Comfortable for
  dozens of players; for hundreds, add spatial hashing and delta-compressed snapshots.
* Loot is auto-picked-up by the killer; there is no player trading or PvP.
* Item icons are pixel art drawn in code; skill icons are emoji (swap them in `GD.SKILLS` for custom art).
