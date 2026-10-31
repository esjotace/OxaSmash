# Items

Generated from `src/sim/constants.js` (worded in `src/sim/describe.js`) by `tools/items_md.mjs` (`npm run items`); don't edit by hand.

Push is the launch speed: base + growth × the victim's damage %. Times are in seconds, distances
in pixels (a tile is 16).

## Rules

- **Light guns** only add damage: no push, no stun. **Heavy guns** push and stun. **Special guns** hit like heavy ones, with little ammo.
- Guns are held at the chest (light), waist (heavy) or shoulder (special): 0.56, 0.38 and 0.68 of the body's height.
- **Headshot**: the top 8 px of the body (less crouched). ×1.5 damage, and it always stuns (push 150 + 1.2×% for light guns).
- **Accuracy** (spread × this): crouched 0.15, standing still 0.4, moving 1.5 (+2°), in the air 1.8 (+3°).
- **Light melee** never launches (push capped at 160); **heavy melee** launches. Light weapons finish people off another way: thrown (hold the melee button), or with their quirk.
- Out of ammo for good, a tap of the trigger just clicks (keep the gun if you like); hold it 0.4 s and let go to throw the gun: 6 damage, push 180 + 1.6×%.
- **Cover**: crouched right beside low cover you hold your gun up over it and fire from there (not the big guns: see below). Cover has 40 health per tile of width; bullets, thrown things and melee hits wear it down, explosions 2× as much. Broken, it's gone for the match.
- **Bodies bump**: you can't walk through someone, unless you keep walking into them for 0.4 s (then you slip past); a dash goes straight through.
- **Combos**: a jab, heavy or shot pressed mid-swing is remembered for 0.2 s and comes out as soon as it can; a heavy or a shot cuts a jab's recovery short (a shot also a heavy's that hit). a melee hit that lands lets you cut that swing short with a jump or a dash, gives back your air jump, and makes your next dash free (within 1.5 s); a swing that hits recovers in 50% of the time. Within one combo, the same attack again pushes and stuns 15% less each time (down to 40%).
- **DI**: launched (push 150 or more), the direction you hold (crouch for down, up for up) bends your flight by up to 15°.
- **Breaker**: frozen by a special stun (the keyboard's big phrase, the lamp's doom), press block to break free before the launch, for 50% of the stamina bar; anyone close is pushed back.
- **Style meter** (under your damage %): full, it reloads your gun for free (a full magazine; not special guns). It fills 12% for a melee hit (30% if it lands within 0.75 s of one of your shots hitting), 30% for a parry, 20% for dodging a hit, 25% for a headshot (then not again for 5 s: the bar's outline greys and fills back in white), 30% for catching your thrown gun.
- **Thrown light guns** that hit an enemy bounce back to you: press pick up as one reaches you to catch it (empty) for style. Otherwise thrown guns fall to the floor; an empty gun there vanishes after 10 s.
- **Spare magazines are yours**, kept from gun to gun; a gun brings only the rounds in its magazine (one picked up off the floor has what it was dropped with).
- **Ammo chests** (on the outermost spawn points): press pick up beside one to fill your gun, specials too (no gun: a pistol); then it's shut for 25 s.
- **Grenades**: carry 2, thrown in the order you got them. Hold to cook and aim; let go to throw. Picking one up with both slots full replaces the next one; the mouse wheel (or pick up with nothing in reach) swaps their order.
- **Dodge**: F, for 50% of the stamina bar (it refills from empty in 2.5 s): a 380 px/s shove the way you hold (backwards if nothing), for the first 0.14 s bullets, melee and explosions miss you (not spikes, crushers or the storm).
- **Controls**: left click shoots (the gun slot: a gun or the trident; fists with nothing there), right click swings the melee weapon, F dodges, the mouse wheel picks the next grenade. The weapon used last is in your hand, the other on your back.
- **Stamina** also pays for each shot fired crouched (0.1 of the bar; with less, crouching stops steadying your aim) and for attacking on the run (fists 0.15, light 0.25, heavy 0.5; with less, you stop to attack).
- **Glue** floors: you move at 40% speed and can't jump or dash off them; walk off.
- **Barrels** explode: radius 72, 15 damage, push 300 + 4.5×%.

## Guns

| Gun | Class | Damage | Push | Shots/s | Auto | Ammo | Reload | Spread | Range | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **9mm** | light | 3 | none | 6.3 | no | 12 × 2 | 1.1 | 2° | 600 | — |
| **Revolver** | heavy | 8 | 150 + 1.6×% | 2.2 | no | 6 × 2 | 1.4 | 2° | 700 | — |
| **SMG** | light | 1.5 | none | 14.3 | yes | 30 × 2 | 1.3 | 6° | 450 | — |
| **Assault Rifle** | light | 2.5 | none | 9.1 | yes | 24 × 2 | 1.5 | 2.5° | 750 | — |
| **Minigun** | light | 1.4 | none | 20 | yes | 80 × 2 | 2.5 | 7° | 550 | you move at 45% speed while firing; thrown, it doesn't come back; too big to fire from behind cover |
| **Shotgun** | heavy | 2.2 | 220 + 1.2×% | 1.4 | no | 6 × 2 | 1.6 | 14° | 220 | 7 pellets per shot; the same spread however you stand; pushes only when more than 50% of a shot's pellets hit the same person |
| **The Snoozer** | special | 4 | none | 0.9 | no | 1 × 1 | 2 | 0° | 1400 | puts whoever it hits to sleep for 3 s (mashing moves wakes them after 2 s; any hit wakes them); no spare magazine; too big to fire from behind cover; special: the style meter doesn't reload it; ammo chests do |
| **Sniper** | special | 20 | 260 + 2.5×% | 0.9 | no | 4 × 2 | 2 | 0° | 1400 | too big to fire from behind cover; special: the style meter doesn't reload it; ammo chests do |
| **Rocket Launcher** | special | 0 | none | 1 | no | 1 × 2 | 1.8 | 0° | 900 | explodes: radius 72, 14 damage, push 360 + 4×%; too big to fire from behind cover; special: the style meter doesn't reload it; ammo chests do |
| **Star Blaster** | heavy | 6 | 200 + 2×% | 2.9 | no | 10 × 2 | 1.5 | 1° | 900 | glances off walls 2×, each bounce ×2 speed, size, damage and push |
| **Bow** | light | 9 | 230 + 2.6×% | 4 | no | 6 × 2 | 1.2 | 0.5° | 900 | hold to draw (full in 0.7 s): a longer draw flies faster and hits harder; drawn past 80% it pushes; arrows that hit a wall stick in it: a foothold for 8 s |
| **Card Thrower** | light | 2 | none | 8.3 | no | 13 × 2 | 1.2 | 3° | 500 | goes through people |
| **Golden Gun** | special | 18 | 460 + 6×% | 1.3 | no | 3 × 1 | 1 | 0° | 1000 | no spare magazine; special: the style meter doesn't reload it; ammo chests do |
| **Railgun** | special | 16 | 300 + 3.2×% | 1.7 | no | 2 × 2 | 2.2 | 0° | 1200 | hold 0.8 s to charge; only a full charge fires: a beam through walls and everyone in its path; too big to fire from behind cover; special: the style meter doesn't reload it; ammo chests do |
| **Fire Staff** | light | 0.4 | none | 20 | yes | 60 × 2 | 2 | 14° | 95 | 2 pellets per shot; the same spread however you stand; goes through people; sets you on fire for 2 s |
| **Make It Rain** | light | 1.5 | none | 12.5 | yes | 40 × 2 | 2 | 6° | 550 | each shot is money: coin 45% (1.5), bill 35% (1), goldcoin 15% (4), diamond 5% (6, push 150 + 1.2×%); thrown, it doesn't come back |
| **Jackpot** | special | 0 | none | 1 | no | 1 × 2 | 1.8 | 0° | 900 | a money bag that bursts (radius 64, push 240 + 1.5×%, no damage) into 14 pieces of money; they lie around 8 s and heal whoever grabs them by their shot damage; too big to fire from behind cover; special: the style meter doesn't reload it; ammo chests do |
| **Slime Launcher** | heavy | 3 | 140 + 1.2×% | 2 | no | 4 × 2 | 1.6 | 2° | 1500 | lobbed slime hops 2 times; each landing leaves glue (40 px, 6 s); too big to fire from behind cover |
| **Spore Sprayer** | light | 0.5 | none | 11.1 | yes | 40 × 2 | 1.8 | 10° | 140 | the same spread however you stand; about 1 spore in 3 leaves a poison patch (radius 40, 4 s, 3%/s); thrown, it doesn't come back; too big to fire from behind cover |

## Melee

Each weapon has a **heavy** (the melee button: these numbers) and a **jab** (its own button: L, or C), a quick straight poke that never launches. Holding the melee button is the weapon's special. Speed is wind-up / hitting / recovery. Arc is degrees each side of the aim.

| Weapon | Class | Damage | Push | Reach | Arc | Speed | Jab | Quirks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Fists** | — | 8 | 200 + 4×% | 14 | — | 0.06 / 0.10 / 0.22 | 4 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.10 | always there |
| **Otaku Katana** | light | 7 | 200 + 2.5×% | 31.2 | 90° | 0.05 / 0.10 / 0.16 | 5 dmg, push 90 + 0.5×%, 0.04 / 0.07 / 0.10 | swing into bullets to send them back (×1.5 damage); its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; swings the instant you click; keep holding through the swing to throw it after |
| **Bolívar's Sword** | heavy | 10 | 220 + 4.2×% | 25.4 | 70° | 0.08 / 0.10 / 0.24 | 5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | — |
| **La Chola** | heavy | 13 | 320 + 5×% | 12.1 | 80° | 0.16 / 0.12 / 0.34 | 6.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.25 s to wind up, let go to throw it (gone for good): 9 damage, push 220 + 3×% |
| **Knife** | light | 6 | 190 + 2.3×% | 15.8 | 70° | 0.05 / 0.08 / 0.14 | 4 dmg, push 70 + 0.4×%, 0.04 / 0.07 / 0.10 | its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to throw one in an arc (you keep yours; the next throw is ready 2.5 s later): 6 damage, push 250 + 3×%; from behind: ×2 damage and a push of 220 + 2.5×% (thrown too) |
| **Machete** | light | 8 | 200 + 2.5×% | 25.4 | 100° | 0.06 / 0.10 / 0.16 | 6 dmg, push 90 + 0.5×%, 0.04 / 0.07 / 0.10 | its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; every 3rd hit in a row (each within 0.8 s) launches: push 280 + 4×% |
| **Nodachi** | light | 9 | 210 + 2.6×% | 39.3 | 75° | 0.09 / 0.12 / 0.20 | 7 dmg, push 100 + 0.5×%, 0.04 / 0.07 / 0.10 | its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.4 s to charge, let go to dash forward and slash: launches with push 300 + 4.2×% (it can't be thrown) |
| **Trident** | heavy | 8 | 250 + 3.6×% | 40 | thrust | 0.08 / 0.10 / 0.22 | 4 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | a straight thrust, no arc; hold to throw it on its chain (reach 230): a catch takes 6, is stunned and reeled to melee range (stunned 0.45 s more); a miss roots you until it's reeled back |
| **Shovel** | heavy | 9 | 240 + 4×% | 19.4 | 70° | 0.10 / 0.10 / 0.28 | 4.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | swings from below to above; launches straight up |
| **Oooga Booga** | heavy | 7 | 200 + 3×% | 25.8 | 80° | 0.14 / 0.10 / 0.30 | 5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold to wind up (full in 1.2 s): the longer, the harder (90%: 9 damage, push 300 + 5×%; full: 11, push 340 + 5.8×% at 45°, a critical); you walk slower as it winds up (10% when full); launches flat and far |
| **Cleaver** | heavy | 15 | 200 + 3.2×% | 14.6 | 70° | 0.10 / 0.08 / 0.30 | 7.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.35 s to throw one in an arc (you keep yours; the next throw is ready 2.5 s later): 9 damage, push 200 + 2.5×%; leaves them bleeding: 10 more over 5 s (a new cut starts it over; thrown too) |
| **War Hammer** | heavy | 14 | 340 + 5.5×% | 22.1 | 90° | 0.22 / 0.12 / 0.40 | 7 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | — |
| **Bone Axe** | heavy | 11 | 260 + 4.5×% | 24.9 | 75° | 0.12 / 0.10 / 0.30 | 5.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | goes through blocks |
| **Keyboard** | light | 20 | none | 20.1 | 65° | 0.05 / 0.08 / 0.16 | 4 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.10 | hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; each hit is a word; the word sets the share of damage and launch (5%: the full phrase freezes them, then the full launch); thrown, it types a keyboard smash |
| **THE WARNING** | heavy | 10 | 240 + 4×% | 35.5 | 75° | 0.14 / 0.12 / 0.34 | 5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.5 s for a powered swing: 12 damage, push 340 + 5.2×%, and everyone within 64 px of where it lands (you too) gets a random effect for 8 s: haste, iron, feather, jinx, slip, burn, homing |
| **Frying Pan** | heavy | 8 | 170 + 2.4×% | 19.6 | 80° | 0.10 / 0.10 / 0.26 | 6 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.45 s for a powered swing: 9 damage, push 220 + 3.6×%, stuns 0.25 s longer; blocking with it also stops bullets from the front |
| **Ham Leg** | heavy | 9 | 210 + 3.3×% | 18.2 | 75° | 0.12 / 0.10 / 0.30 | 7 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.5 s for a powered swing: 10 damage, push 250 + 4.2×%, and you take a bite (heals 5%; eaten after 5) |
| **Wet Fish** | light | 6 | 200 + 2.4×% | 12.4 | 90° | 0.05 / 0.10 / 0.14 | 4 dmg, push 110 + 0.6×%, 0.04 / 0.07 / 0.10 | its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; their floor is ice for 2.5 s (thrown too) |
| **Yoink Pliers** | light | 5 | 180 + 2.2×% | 13.6 | 70° | 0.06 / 0.10 / 0.16 | 3 dmg, push 80 + 0.4×%, 0.04 / 0.07 / 0.10 | its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; a hit takes their weapon (the one in hand first) and drops it behind you |
| **Anvil** | heavy | 0 | none | 21.9 | thrust | 0 / 0 / 0 | 6 dmg, push 140 + 1×%, 0.04 / 0.07 / 0.14 | too heavy to swing: attacking throws it in a high arc (it lands as a pickup): 16 damage, push 380 + 5×%; you move at 70% speed carrying it |
| **Halberd** | heavy | 11 | 300 + 4.6×% | 33.4 | 110° | 0.14 / 0.20 / 0.40 | 6 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | — |
| **Morning Star** | heavy | 11 | 280 + 4.6×% | 25.9 | 85° | 0.16 / 0.12 / 0.34 | 5.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | hold 0.3 s to spin it round you: the ball hits for 6, push 240 + 3.4×% (each person every 0.4 s); you move at 50% speed |
| **Bone Scythe** | heavy | 11 | 260 + 4.4×% | 25.8 | 180° | 0.16 / 0.18 / 0.34 | 5.5 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | a full circle: it hits behind you too |
| **Carrot** | heavy | 8 | 200 + 3×% | 26 | thrust | 0.07 / 0.10 / 0.22 | 4 dmg, push 120 + 1×%, 0.04 / 0.07 / 0.14 | a straight thrust, no arc; hold 0.5 s to take a bite: you run 35% faster for 6 s; 2 bites (the first leaves it rotten) |
| **Paint Roller** | light | 5 | 190 + 2.3×% | 14.8 | 80° | 0.07 / 0.12 / 0.16 | 3 dmg, push 80 + 0.4×%, 0.04 / 0.07 / 0.10 | swings from below to above; its heavy pushes moderately (a light weapon: quick, and light on stamina); hold 0.3 s to wind up, let go to throw it (it lands as a pickup to go get back): 5 damage, push 250 + 3×%; a swing on the ground paints 56 px of floor in front of you for 10 s: anyone else on it moves at 55% speed |

## Grenades

| Grenade | Fuse | Effect |
| --- | --- | --- |
| **Frag** | 2.2 | explodes: radius 84, 12 damage, push 440 + 4.5×% |
| **Fire** | 1.8 | explodes: radius 64, 16 damage, push 200 + 2×%; sets you on fire for 3 s (4%/s, no stun) |
| **Smoke** | 1.6 | a cloud, radius 80, for 9 s: nobody sees into it |
| **Poison** | 1.6 | a cloud, radius 70, for 8 s: 3%/s to anyone inside, no stun |
| **Drowsy Gas** | 1.6 | a cloud, radius 70, for 6 s: anyone inside goes drowsy (30% slower; asleep after 3 s unless they take damage or shake it off with jerky moves: turns, jumps, dashes, taps down; the same move again in a row counts for less) |
| **Shaken Soda** | 3 | shake it (hold) up to 3 s: it bursts on the first thing it touches, from radius 40, 3 damage, push 160 + 1.5×% (no shaking) to radius 80, 18 damage, push 440 + 4.5×% (fully shaken, which is also when it bursts in your hand) |
| **Polymorph Potion** | 1.4 | everyone within 64 px (you too) turns into a random animal for up to 3 s: they can walk and jump, nothing else; any damage, any status or a KO turns them back |
| **Warp** | 1.4 | teleports you to where it goes off; hit someone on the way and you swap places |
| **Sticky C4** | you choose | sticks to the first wall, floor or person it touches; press the grenade button again to set it off: radius 76, 14 damage, push 420 + 4.5×% |
| **Money Grenade** | 2 | explodes: radius 76, 10 damage, push 380 + 4×%; showers 10 pieces of money that lie around 8 s and heal whoever grabs them |
| **Black Hole** | 1.6 | no damage: for 3.5 s it pulls everyone within 110 px toward its middle (up to 1900 px/s), where you float |
| **Banner** | plants on landing | plants itself where it first lands on a floor: that stretch of the stage (its section on a random stage, or 288 px) turns melee only, in your colour: shots and thrown things (not thrown melee weapons) vanish entering it, and guns don't fire inside it. Spend 30 s in there and you gain a life; step out of it for more than 3 s and it fades away. A new banner replaces it |

## Items

Picked up like weapons; they turn up among the pickups.

| Item | Effect |
| --- | --- |
| **Apple** | eaten on the spot: heals 10% |
| **Drumstick** | eaten on the spot: heals 25% |
| **Health Spray** | eaten on the spot: heals 50% |
| **Key** | held up for everyone to see; touch the locked chest with it to open it: one of Golden Gun, Railgun, Jackpot, Rocket Launcher, Shotgun, Make It Rain, War Hammer, Frying Pan, Halberd; a big hit (push over 260) or a KO makes you drop it |
| **Haste Rune** | for 15 s: you run 40% faster (one rune at a time) |
| **Iron Rune** | for 15 s: you take 60% of the push (one rune at a time) |
| **Feather Rune** | for 15 s: 2 more air jumps (one rune at a time) |
| **Mirror Rune** | for 15 s: bullets that hit you fly back at the shooter, until they add up to 50% damage (the one that goes past it too) (one rune at a time) |
| **Genie Lamp** | rubbed for 1.5 s, then a wish: a legendary weapon (33%), a full heal (33%), a jinx (33%: 10 s shrunk, taking ×1.3 the push), or doom (1%: frozen, shaking, then launched off the stage) |
| **Crystal Ball** | for 8 s your shots and thrown weapons home in on the nearest enemy, but hit for 50% of their damage |
| **Ring of Cat** | takes both grenade slots (a grenade picked up replaces it): 7 times, the grenade button turns you into a random cat, and back; a cat runs 2× as fast, jumps and dashes; any attack, 10% of damage, any status (drowsy and asleep: it lies down) or a KO turns you back |
