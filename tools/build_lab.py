#!/usr/bin/env python3
"""Build data.js for the two-guide Balmora lab.

Inputs:  source/tarvis79.txt, source/karpah.txt (verbatim GameFAQs text)
         tools/entities.json (NPC + cell names from Morrowind.esm, see esm_entities.py)
Output:  data.js  (window.LAB = {...})

The idea being tested: neither guide knows about the other. Both get tagged
against the game's own names, links fall out of shared tags, and forks are
defined once on the game (not on either guide) and then each guide is
checked for which branch it takes.
"""

import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source")

# ---------------------------------------------------------------- text utils


def reflow(block):
    """Hard-wrapped guide text -> list of paragraphs."""
    paras = []
    for chunk in re.split(r"\n\s*\n", block):
        lines = [l.rstrip() for l in chunk.strip("\n").split("\n") if l.strip()]
        if not lines:
            continue
        out, cur = [], []
        for l in lines:
            s = l.strip()
            if re.match(r"^(-|\*|\d+\.)\s", s) and cur:
                out.append(" ".join(cur))
                cur = []
            cur.append(s)
        out.append(" ".join(cur))
        paras.extend(re.sub(r"\s{2,}", " ", p) for p in out)
    return paras


def sentence_at(text, idx):
    start = max(text.rfind(". ", 0, idx), text.rfind("\n\n", 0, idx), text.rfind("! ", 0, idx))
    start = 0 if start < 0 else start + 2
    end = len(text)
    for sep in (". ", ".\n", "! ", "? "):
        e = text.find(sep, idx)
        if e != -1:
            end = min(end, e + 1)
    return re.sub(r"^\d+\)\s+", "", re.sub(r"\s+", " ", text[start:end]).strip())


def norm_quest(q):
    q = q.lower().replace("fighter's", "fighters").replace("mage's", "mages").replace("thieve's", "thieves")
    q = re.sub(r"\s*-\s*", " - ", q, count=1)
    part = q.split(" - ", 1)[-1]
    part = re.sub(r"^the\s+", "", part)
    return re.sub(r"[^a-z0-9 ]", "", part).strip()


# ---------------------------------------------------------------- tarvis79


def parse_tarvis():
    t = open(os.path.join(SRC, "tarvis79.txt"), encoding="utf-8").read()
    a = [m.start() for m in re.finditer(r"\{WLK005\}", t)][1]
    b = t.index("Hla Oad & Wilderness", a)
    b = t.rfind("o====", a, b)
    s = t[a:b]
    heads = list(re.finditer(r"\n([^\n]+)\no={20,}o\n", s))
    units = []
    for i, m in enumerate(heads):
        body = s[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(s)]
        meta, rest = {}, []
        for chunk in re.split(r"\n\s*\n", body):
            mm = re.match(r"\s*\*\*\*([A-Za-z ]+)\*\*\*\n(.*)", chunk, re.S)
            if mm:
                key = mm.group(1).strip().lower().rstrip("s")
                meta[key] = [l.strip() for l in mm.group(2).split("\n") if l.strip()]
            else:
                rest.append(chunk)
        steps, stop = [], None
        for p in reflow("\n\n".join(rest)):
            n = re.match(r"^(\d+)\)\s+", p)
            if n:
                stop = stop or int(n.group(1))
                p = p[n.end():]
            steps.append(p)
        units.append({
            "id": f"t{i + 1:02d}",
            "guide": "tarvis",
            "title": m.group(1).strip(),
            "group": f"Stop {stop}" if stop else "",
            "stop": stop,
            "quests": meta.get("quest", []),
            "factions": meta.get("faction", []),
            "npcsListed": meta.get("npc", []),
            "loot": meta.get("notable loot", [])[:8],
            "steps": steps,
        })
    return t, units


# ---------------------------------------------------------------- Karpah

KARPAH_SECTIONS = {
    # section: (faction, downstream?)
    "4.2": ("Main Quest", False),
    "7.1": ("Fighters Guild", False),
    "7.3": ("Fighters Guild", False),
    "8.1": ("Mages Guild", False),
    "8.2": ("Mages Guild", False),
    "8.4": ("Mages Guild", False),
    "9.1": ("Thieves Guild", False),
    "10.1": ("Morag Tong", False),
    "11.1": ("House Hlaalu", False),
    "7.6": ("Fighters Guild", True),
    "7.7": ("Fighters Guild", True),
    "9.4": ("Thieves Guild", True),
}


def karpah_section(k, n):
    occ = [m.start() for m in re.finditer(re.escape(f"[{n}]"), k)]
    p = occ[-1]
    title = k[p:k.index("\n", p)].split("]", 1)[1].strip()
    nx = re.search(r"\n[ \t]*(?:-{3}=\*=|=-=\+=)[^\n]*\n[^\n]*\[\d+\.\d+(?:\.\d+)?\]", k[p + 10:])
    body = k[k.index("\n", p):p + 10 + (nx.start() if nx else 40000)]
    body = re.sub(r"^\s*(-{3}=\*=[^\n]*|=-=\+=[^\n]*)\n", "", body.strip("\n"))
    return title, body


def parse_karpah():
    k = open(os.path.join(SRC, "karpah.txt"), encoding="utf-8").read()
    units = []
    for n, (faction, downstream) in KARPAH_SECTIONS.items():
        title, body = karpah_section(k, n)
        parts = re.split(r"\n-{6,} (.+?) -{3,}\n", "\n" + body)
        intro = reflow(re.sub(r"[-=*+]{20,}", "", parts[0]))
        for j in range(1, len(parts), 2):
            qt = parts[j].strip()
            if qt.lower().startswith("ranking"):
                continue
            paras = reflow(re.sub(r"(?m)^[ \t]*[-=*+]{20,}[ \t]*$", "", parts[j + 1]))
            rep = ""
            if paras and paras[0].lower().startswith(("faction reputation", "house reputation")):
                rep = paras.pop(0)
            steps = (intro if j == 1 else []) + paras
            units.append({
                "id": f"k{n}-{j // 2 + 1}",
                "guide": "karpah",
                "title": qt.split(" - ", 1)[-1] if " - " in qt else qt,
                "fullTitle": qt,
                "group": f"[{n}] {title}",
                "section": n,
                "faction": faction,
                "giver": title.split(" - ", 1)[1] if " - " in title else "",
                "downstream": downstream,
                "rep": rep,
                "quests": [qt] if " - " in qt else [],
                "steps": steps,
            })
    return k, units


# ---------------------------------------------------------------- tagging


def build_dictionary():
    ent = json.load(open(os.path.join(ROOT, "tools", "entities.json")))
    words = set()
    if os.path.exists("/usr/share/dict/words"):
        words = {w.strip().lower() for w in open("/usr/share/dict/words")}
    names = {}
    for full in ent["npcs"]:
        toks = full.split()
        if len(toks) == 1 and (len(full) < 4 or full.lower() in words):
            continue
        if all(t.lower() in words for t in toks):
            continue
        names[full] = full
    # Unique first/last tokens become aliases ("Habasi" -> "Sugar-Lips Habasi").
    tok_count = {}
    for full in names:
        toks = full.split()
        if len(toks) > 1:
            for tk in {toks[0], toks[-1]}:
                tok_count[tk] = tok_count.get(tk, 0) + 1
    aliases = {}
    for full in list(names):
        toks = full.split()
        if len(toks) > 1:
            for tk in {toks[0], toks[-1]}:
                if tok_count[tk] == 1 and len(tk) >= 5 and tk.lower() not in words and tk not in names:
                    aliases[tk] = full
    places = {}
    for c in ent["cells"]:
        if c.startswith("Balmora, "):
            short = c.split(", ", 1)[1]
            if " " not in short and short.lower() in words:
                continue
            places[short] = c
    return names, aliases, places


def tag_units(units, names, aliases, places):
    lex = sorted(list(names) + list(aliases), key=len, reverse=True)
    pat = re.compile(r"(?<![\w'-])(" + "|".join(re.escape(x) for x in lex) + r")(?![\w-])")
    ppat = re.compile("|".join(re.escape(x) for x in sorted(places, key=len, reverse=True)))
    for u in units:
        text = " ".join([u["title"]] + u.get("npcsListed", []) + u["steps"])
        found = {}
        for m in pat.finditer(text):
            full = names.get(m.group(1)) or aliases.get(m.group(1))
            found[full] = found.get(full, 0) + 1
        u["npcs"] = sorted(found, key=lambda x: -found[x])
        u["places"] = sorted({m.group(0) for m in ppat.finditer(u["title"] + " " + " ".join(u["steps"]))})
        u["questKeys"] = sorted({norm_quest(q) for q in u["quests"]})


def link(tarvis, karpah):
    allu = tarvis + karpah
    df = {}
    for u in allu:
        for e in set(u["npcs"]) | set("@" + p for p in u["places"]):
            df[e] = df.get(e, 0) + 1
    N = len(allu)
    idf = {e: math.log(N / d) for e, d in df.items()}
    links = []
    for a in tarvis:
        ea = set(a["npcs"]) | set("@" + p for p in a["places"])
        for b in karpah:
            eb = set(b["npcs"]) | set("@" + p for p in b["places"])
            shared = ea & eb
            sq = set(a["questKeys"]) & set(b["questKeys"])
            giver = b.get("giver") in a["npcs"][:3]
            score = sum(idf[e] for e in shared) + 4.0 * len(sq) + (2.5 if giver else 0)
            if score >= 3.0:
                links.append({
                    "a": a["id"], "b": b["id"], "score": round(score, 2),
                    "via": sorted((e.lstrip("@") for e in shared), key=lambda e: (-idf.get(e, idf.get("@" + e, 0)), e))[:5],
                    "sameQuest": sorted(sq),
                    "giver": b.get("giver") if giver else "",
                })
    return links, idf


# ---------------------------------------------------------------- forks
# Defined once, on the game. Each guide is then *checked* for which branch it walks.

FORKS = [
    {
        "id": "guild-war",
        "title": "The Guild War",
        "question": "Percius's coup, or Sjoring's purge?",
        "why": ("Balmora lets you join the Fighters Guild and the Thieves Guild in the same afternoon. "
                "Way downstream, the Fighters Guild's Master turns out to be in bed with the Camonna Tong, "
                "and how you finish that guild decides which of these people you end up killing."),
        "decideAt": "Fighters Guild endgame: Percius Mercius (Ald'ruhn) or Sjoring Hard-Heart (Vivec)",
        "anchor": ["Eydis Fire-Eye", "Sugar-Lips Habasi"],
        "saveName": "BALMORA - before the Guild War",
        "branches": [
            {
                "id": "percius", "label": "Percius's coup",
                "cost": "Kill Eydis Fire-Eye, Lorbumol gro-Aglakh, then Sjoring Hard-Heart.",
                "keeps": "The Thieves Guild survives. You can master both guilds.",
                "casualties": ["Eydis Fire-Eye", "Lorbumol gro-Aglakh", "Sjoring Hard-Heart"],
                "evidence": r"Sjoring's Supporters|Kill Hard-Heart",
                "quote": r"report to Percius to be named Master of the Fighters Guild|I'll take this option first",
            },
            {
                "id": "sjoring", "label": "Sjoring's purge",
                "cost": "Kill Big Helende, Sugar-Lips Habasi, Aengoth the Jeweler, then Gentleman Jim Stacey.",
                "keeps": "That's the Thieves Guild's leadership. Your thief career goes with them.",
                "casualties": ["Big Helende", "Sugar-Lips Habasi", "Aengoth", "Gentleman Jim Stacey"],
                "evidence": r"Heads of the Thieves Guild|Kill the Master Thief",
                "quote": r"my character is currently in the Thieves Guild",
            },
        ],
    },
    {
        "id": "great-house",
        "title": "One House Only",
        "question": "Hlaalu, Redoran, or Telvanni?",
        "why": ("Nileno Dorvayn will sign you up for House Hlaalu right here in Balmora. "
                "Join any Great House and the other two close their doors for the rest of the game."),
        "decideAt": "The moment you say yes to any House recruiter",
        "anchor": ["Nileno Dorvayn"],
        "saveName": "BALMORA - before choosing a House",
        "branches": [
            {"id": "hlaalu", "label": "House Hlaalu", "cost": "Balmora's merchant-politicians. Stronghold: Rethan Manor.",
             "gatekeeper": "Nileno Dorvayn", "house": "Hlaalu"},
            {"id": "redoran", "label": "House Redoran", "cost": "Ald'ruhn's honor-bound warrior nobles. Stronghold: Indarys Manor.",
             "gatekeeper": "Neminda", "house": "Redoran"},
            {"id": "telvanni", "label": "House Telvanni", "cost": "Mushroom-tower wizards of the east. Stronghold: Tel Uvirith.",
             "gatekeeper": "Llunela Hleran", "house": "Telvanni"},
        ],
    },
]

NEG = re.compile(r"\b(don't|do not|decline|never|avoid|refuse|won't)\b", re.I)


def paragraph_at(text, idx):
    s = text.rfind("\n\n", 0, idx)
    e = text.find("\n\n", idx)
    para = " ".join(l.strip() for l in text[s + 2 if s >= 0 else 0: e if e >= 0 else len(text)].split("\n") if l.strip())
    # Landed on a quest header ("------ Fighters Guild - Kill Hard-Heart ------")? Use the write-up under it.
    hops = 0
    while e >= 0 and hops < 3 and (re.match(r"^-{6,}", para) or re.match(r"^(Faction|House) Reputation", para)):
        s, e = e, text.find("\n\n", e + 2)
        para = " ".join(l.strip() for l in text[s + 2: e if e >= 0 else len(text)].split("\n") if l.strip())
        hops += 1
    return para


def flatten(text):
    """Unwrap hard line breaks but keep paragraph breaks, so phrases split across lines still match."""
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    return re.sub(r"[ \t]{2,}", " ", text)


def chapter_finder(raw):
    """Name the chapter a position falls in: tarvis79's {WLK###} sections or Karpah's [n.n] headers."""
    toc = {i: t.strip() for t, i in re.findall(r"\n([^\n{]+?)\s*\{(WLK\d{3})\}", raw[:20000])}
    marks = re.compile(r"\{(WLK\d{3})\}|\[(\d+\.\d+)\]\s+([^\[\]]+?)\s(?:-{3}|=-=)")

    def at(flat, idx):
        last = None
        for last in marks.finditer(flat, 0, idx):
            pass
        if not last:
            return ""
        return toc.get(last.group(1), "") if last.group(1) else last.group(3).strip()
    return at


def stance(raw, fork, karpah_units):
    """For one guide's full text, classify each branch: takes / documents / avoids / silent."""
    at = chapter_finder(raw)
    full = flatten(raw)
    res = {}
    for br in fork["branches"]:
        pos, neg, quote, note, peeks, where = 0, 0, "", "", [], ""
        if "house" in br:
            for m in re.finditer(r"\bjoin\w*\b[^.]{0,40}?House\s+" + br["house"], full):
                sent = sentence_at(full, m.start())
                if NEG.search(full[max(0, m.start() - 40): m.start()]) or NEG.search(sent.split("House " + br["house"])[0]):
                    neg += 1
                    quote = quote or sent
                else:
                    pos += 1
                    quote = sent if not quote or neg else quote
                    where = where or at(full, m.start())
            hdr = len(re.findall(r"\n-{6,} House " + br["house"] + r" - ", full))
            if hdr:
                pos += hdr
                note = f"Walks through {hdr} House {br['house']} quests."
        else:
            qm = re.search(br["quote"], full)
            if qm:
                quote = sentence_at(full, qm.start())
                peeks.append(paragraph_at(full, qm.start()))
            for m in re.finditer(br["evidence"], full):
                pos += 1
                where = where or at(full, m.start())
                para = paragraph_at(full, m.start())
                if len(peeks) < 2 and len(para) > 160 and not para.startswith("***") and para not in peeks:
                    peeks.append(para)
        res[br["id"]] = {"pos": pos, "neg": neg, "quote": quote, "note": note, "peeks": peeks, "where": where}
    takers = [b for b, r in res.items() if r["pos"] and not r["neg"]]
    out = {}
    for b, r in res.items():
        if r["neg"] and not (r["pos"] > r["neg"]):
            st = "avoids"
        elif b in takers and len(takers) == 1:
            st = "takes"
        elif b in takers:
            st = "documents"
        else:
            st = "silent"
        out[b] = {"status": st, "quote": r["quote"][:320], "note": r["note"], "peeks": r["peeks"], "where": r["where"]}
    return out


# ---------------------------------------------------------------- main


def main():
    tfull, tarvis = parse_tarvis()
    kfull, karpah = parse_karpah()
    names, aliases, places = build_dictionary()
    tag_units(tarvis + karpah, names, aliases, places)
    links, idf = link(tarvis, karpah)

    forks = []
    for f in FORKS:
        f = dict(f)
        f["stances"] = {"tarvis": stance(tfull, f, karpah), "karpah": stance(kfull, f, karpah)}
        forks.append(f)

    for u in tarvis + karpah:
        u.pop("npcsListed", None)

    lab = {
        "guides": {
            "tarvis": {
                "name": "tarvis79", "author": "Travis Whitsitt",
                "title": "Beating Morrowind in ______ Easy Steps!",
                "shape": "by location", "color": "violet",
                "url": "https://gamefaqs.gamespot.com/pc/913818-the-elder-scrolls-iii-morrowind/faqs/71172",
                "license": "Author permits posting, mirroring and quoting; credit appreciated.",
                "slice": "Walkthrough: Balmora & Wilderness {WLK005}",
                "units": tarvis,
            },
            "karpah": {
                "name": "Karpah", "author": "Rebecca Skinner",
                "title": "Morrowind GOTY Full FAQ/Walkthrough v0.9",
                "shape": "by faction", "color": "teal",
                "url": "https://gamefaqs.gamespot.com/pc/913818-the-elder-scrolls-iii-morrowind/faqs/33672",
                "license": "Personal use only: read, print, share unaltered. No reposting. Keep this lab local.",
                "slice": "Quest-givers based in Balmora (plus three downstream chapters for the Guild War)",
                "units": karpah,
            },
        },
        "links": links,
        "forks": forks,
        "spine": {"npcs": len(names), "aliases": len(aliases), "source": "Morrowind.esm (NPC_ + CELL records)"},
    }
    out = os.path.join(ROOT, "data.js")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_lab.py — do not edit by hand.\nwindow.LAB = ")
        json.dump(lab, fh, ensure_ascii=False, indent=1)
        fh.write(";\n")

    print(f"tarvis: {len(tarvis)} stops   karpah: {len(karpah)} quests   links: {len(links)}")
    print(f"dictionary: {len(names)} names + {len(aliases)} aliases + {len(places)} Balmora places")
    for f in forks:
        print(f"\nFORK {f['title']}")
        for g, st in f["stances"].items():
            print("  ", g, {b: s["status"] for b, s in st.items()})
            for b, s in st.items():
                if s["quote"]:
                    print("      ", b, "->", s["quote"][:150])


if __name__ == "__main__":
    main()
