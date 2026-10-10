# Mark & Recall

*An Omni Guide to Morrowind.*

A Morrowind walkthrough tracker that reads more than one guide at once, lines
them up against the game itself, and flags the big choices while you can still
make a hard save. Named for the spells: mark the spot before a decision, recall
to it when you want to try the other road.

## Experiment 01: Two Guides Walk Into Balmora

A proof of concept: load two walkthroughs
that know nothing about each other, line them up automatically, and flag the
choices with real consequences while the player is still upstream of them.

- **tarvis79** goes through Balmora by location (17 stops from `{WLK005}`).
- **Karpah** goes through it by faction (44 quests from the Balmora quest-givers'
  chapters, plus three later chapters that resolve the Guild War).

## Open it

Double-click `index.html`. Progress, playthroughs and forks are saved in that
browser's localStorage.

A fresh clone has no guide text, game textures or `data.js` (see "What's not in
git"), so run the four rebuild steps below once first.

## What it proves

1. **Alignment comes from the game, not the guides.** Both guides are tagged
   against NPC and place names read straight out of `Morrowind.esm`
   (`tools/esm_entities.py`). Links are scored by shared names, with rare names
   weighted higher, an exact quest-title match adding 4, and visiting the
   quest-giver adding 2.5. Nothing is hand-mapped.
2. **Forks are defined once, on the game.** `FORKS` in `tools/build_lab.py`
   describes the Guild War and the Great House choice. Each guide's full text is
   then checked for which road it takes. The checker found, on its own, that
   tarvis79 takes Percius's route and never mentions Sjoring's, and that he joins
   Telvanni after turning down Hlaalu and Redoran.
3. **Forking a playthrough** copies your progress into a branch that has made the
   choice. NPCs who die on your road get a ☠, and NPCs who might die get a ☠?.
4. **The Timeline tab** draws both guides as written: one strip per guide in its
   own reading order, each piece as wide as the guide's write-up of it, with
   lines joining pieces about the same people and places (crossings are the
   same ground in a different order). Fork gates, where each fork is decided, a
   "you are here" pin on both strips, a guide filter, zoom (buttons, pinch or
   ⌘/Ctrl-scroll, with every quest named from 2× up) and a table view.

## Rebuild

```bash
python3 tools/fetch_guides.py   # guide text -> source/ (pinned Wayback snapshots)
python3 tools/esm_entities.py   # names from Morrowind.esm -> tools/entities.json
python3 tools/make_textures.py  # game textures -> textures/
python3 tools/build_lab.py      # everything above -> data.js
```

The texture and ESM scripts read from your own Morrowind install. They expect
this repo to sit inside your Morrowind folder (next to `extracted/` and
`morrowmods/`); otherwise set `MORROWIND_DIR` to that folder. Builds are deterministic, so rerunning
gives the same `data.js`.

## What's not in git

- `source/`: the guide text. Karpah's guide is personal-use only, so neither
  guide is committed (tarvis79's could be, but one rule is simpler).
- `data.js`: generated, and it embeds both guides' text.
- `tools/entities.json`: generated from `Morrowind.esm`.
- `textures/`, except `pinchy-field.jpg`: Bethesda's art, rebuilt from your install.

So the repo itself is safe to share, but a page built from it is not: don't host
the built lab anywhere public.

## Textures

`textures/` holds Morrowind's own art, converted from your install
(`extracted/Data Files/Textures`) and the Intelligent Textures upscales:

| File | From | Used for |
|---|---|---|
| `parchment.jpg` | `Tx_menubook` (the journal), fine grain only, made seamless | cards, notes, footer |
| `scroll-v.webp` / `scroll-h.webp` | `scroll.dds` (the reading scroll), upright and sideways | fork cards and the masthead (CSS `border-image`, so the rolled ends never stretch) |
| `fiber.jpg` | `Tx_parchment_03` | the page backdrop |
| `trim.png` | `menu_head_block_middle` (the bronze menu title bar) | the sticky bar's edge and the chapter dividers |

They are Bethesda's art, which is one more reason this lab stays local.
`tools/make_textures.py` rebuilds all of them.

Pinchy appears twice. `pinchy.svg` is a hand-drawn ink-and-watercolor version
of her in the purple velvet hat (gold band, buckle, glowing sky-blue gem, all
matching `make_wizard_hat.py`); she sits on the masthead scroll and in the
"nothing matched" spots. `textures/pinchy-field.jpg` is cropped from
`morrowmods/PetMudcrab/docs/pinchy.png` for the footer portrait.

## Sources and licensing

- tarvis79 (Travis Whitsitt): https://gamefaqs.gamespot.com/pc/913818-the-elder-scrolls-iii-morrowind/faqs/71172.
  The author permits posting, mirroring and quoting, and appreciates credit.
- Karpah (Rebecca Skinner): https://gamefaqs.gamespot.com/pc/913818-the-elder-scrolls-iii-morrowind/faqs/33672.
  **Personal use only, no reposting.** Keep the built lab local. Don't publish
  it or share it as a hosted page.

GameFAQs blocks scripted downloads, so `tools/fetch_guides.py` reads Wayback
Machine snapshots of those pages.
