#!/usr/bin/env python3
"""Build the PET word bank from the official B1 list + KET/PET flashcard content.

Sources (all copied into ./sources):
  - Cambridge B1 Preliminary official vocabulary list (headwords, topics)
  - shelfom/cambridge-pet-flashcards (Chinese gloss, definition, example, UK audio)
  - shelfom/cambridge-ket-flashcards (same, for KET-tagged words)
  - ozbonus/cambridge-english-test-vocabulary (A2 Key headwords, for the KET tag)
  - maimemo 21-day PET core list (extra PET headwords + Chinese gloss)

Outputs:
  - data/vocab.json
  - data/build-stats.json
  - data/audio-manifest.json
  - data/needs-audio.json
"""
from __future__ import annotations

import csv
import json
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "sources"
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

THEME_IDS = [
    "daily", "food", "travel", "school", "health", "nature",
    "feelings", "tech", "sport", "city", "culture", "people",
]

TOPIC_TO_THEME = {
    "clothes-and-accessories": "daily",
    "colours": "daily",
    "communications-and-technology": "tech",
    "education": "school",
    "entertainment-and-media": "culture",
    "environment": "nature",
    "food-and-drink": "food",
    "health-medicine-and-exercise": "health",
    "hobbies-and-leisure": "sport",
    "house-and-home": "daily",
    "language": "school",
    "personal-feelings-opinions-and-experiences": "feelings",
    "places-buildings": "city",
    "places-countryside": "nature",
    "places-town-and-city": "city",
    "services": "city",
    "shopping": "food",
    "sport": "sport",
    "the-natural-world": "nature",
    "time": "daily",
    "travel-and-transport": "travel",
    "weather": "nature",
    "work-and-jobs": "school",
}

# Words that need a hand-written gloss / example because the flashcard sets miss them.
OVERRIDES = {
    "barbecue": ("烧烤；户外烧烤", "n./v.", "We had a barbecue in the garden on Sunday."),
    "café/cafe": ("咖啡馆", "n.", "We met at a small café near the station."),
    "centimetre (cm)": ("厘米", "n.", "The table is ninety centimetres long."),
    "doctor / Dr": ("医生；博士", "n.", "The doctor asked me to rest for two days."),
    "impressed (by/with)": ("印象深刻的", "adj.", "I was impressed by her clear presentation."),
    "made of/from/out of": ("由……制成", "phrase", "This desk is made of wood."),
    "ok / o.k. / okay": ("好的；可以", "adj./adv.", "Is it okay if I open the window?"),
    "photograph": ("照片；拍照", "n./v.", "She took a photograph of the old bridge."),
    "prefer": ("更喜欢", "v.", "I prefer tea to coffee in the morning."),
    "right-hand": ("右手的；右侧的", "adj.", "The keys are in the right-hand drawer."),
    "step forward/back(wards)/out": ("向前走；后退；走出", "phrase", "Please step forward when your name is called."),
    "step over/in/on/out of (sth)": ("跨过；踏入；踩到", "phrase", "Be careful not to step on the wet floor."),
    "suprising": ("令人惊讶的", "adj.", "The ending of the film was surprising."),
    "tooth/teeth": ("牙齿", "n.", "The dentist checked every tooth carefully."),
    "well-known": ("著名的", "adj.", "This well-known writer lives in our town."),
    "while, whilst": ("当……时；然而", "conj.", "I read while I waited for the train."),
    "yeah": ("是的", "adv.", "Yeah, I would love to join you."),
}

SYNONYMS = {
    "big": ["large", "huge"], "large": ["big", "huge"], "small": ["little", "tiny"],
    "happy": ["glad", "pleased"], "sad": ["unhappy", "upset"], "angry": ["mad", "furious"],
    "quick": ["fast", "rapid"], "fast": ["quick", "rapid"], "difficult": ["hard", "tough"],
    "easy": ["simple", "straightforward"], "important": ["significant", "essential"],
    "beautiful": ["pretty", "lovely"], "clever": ["smart", "bright"], "tired": ["exhausted", "sleepy"],
    "afraid": ["scared", "frightened"], "surprised": ["amazed", "astonished"],
    "interesting": ["fascinating", "engaging"], "boring": ["dull", "tiresome"],
    "cheap": ["inexpensive", "affordable"], "expensive": ["costly", "pricey"],
    "begin": ["start", "commence"], "finish": ["complete", "end"], "buy": ["purchase", "get"],
    "choose": ["select", "pick"], "help": ["assist", "support"], "need": ["require", "demand"],
    "show": ["display", "demonstrate"], "tell": ["inform", "explain"], "get": ["obtain", "receive"],
    "make": ["create", "produce"], "keep": ["retain", "maintain"], "change": ["alter", "modify"],
    "reduce": ["decrease", "cut"], "increase": ["rise", "grow"], "allow": ["permit", "let"],
    "stop": ["cease", "quit"], "huge": ["enormous", "massive"], "rich": ["wealthy", "well-off"],
    "poor": ["needy", "impoverished"], "strong": ["powerful", "tough"], "weak": ["fragile", "feeble"],
    "calm": ["peaceful", "relaxed"], "noisy": ["loud", "rowdy"], "polite": ["courteous", "respectful"],
    "rude": ["impolite", "offensive"], "honest": ["truthful", "sincere"], "generous": ["kind", "giving"],
    "confident": ["assured", "self-assured"], "nervous": ["anxious", "worried"],
    "disappointed": ["upset", "let down"], "satisfied": ["content", "pleased"],
    "famous": ["well-known", "celebrated"], "modern": ["contemporary", "up-to-date"],
    "necessary": ["essential", "vital"], "common": ["usual", "ordinary"], "rare": ["unusual", "scarce"],
    "safe": ["secure", "protected"], "dangerous": ["risky", "unsafe"], "useful": ["helpful", "practical"],
}

STOP_QUIZ = {
    "a/an", "the", "and", "or", "but", "if", "because", "so", "than", "that",
    "this", "these", "those", "it", "its", "he", "she", "they", "we", "you",
    "i", "me", "him", "her", "us", "them", "my", "your", "his", "our", "their",
    "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "will", "would", "can", "could", "may", "might",
    "must", "shall", "should", "not", "no", "yes", "of", "to", "in", "on",
    "at", "by", "for", "with", "from", "as", "about", "into", "over", "under",
}

PEOPLE_HINTS = {
    "family", "mother", "father", "parent", "brother", "sister", "son", "daughter",
    "baby", "child", "children", "husband", "wife", "marriage", "married", "marry",
    "wedding", "bride", "groom", "aunt", "uncle", "cousin", "grandmother",
    "grandfather", "grandparent", "nephew", "niece", "relative", "friend",
    "friendship", "neighbour", "teenager", "adult", "generation", "couple",
    "partner", "relationship", "guest", "host", "stranger", "twin",
}
FOOD_HINTS = {
    "food", "eat", "drink", "meal", "restaurant", "cafe", "café", "menu", "cook",
    "recipe", "fruit", "vegetable", "meat", "fish", "bread", "cake", "cheese",
    "coffee", "tea", "juice", "water", "snack", "breakfast", "lunch", "dinner",
}
NATURE_HINTS = {
    "animal", "plant", "tree", "flower", "bird", "insect", "weather", "rain",
    "snow", "wind", "sun", "moon", "forest", "mountain", "river", "sea", "ocean",
    "island", "beach", "environment", "pollution", "climate", "nature", "wild",
}
CITY_HINTS = {
    "city", "town", "street", "road", "building", "shop", "store", "market",
    "bank", "hospital", "library", "museum", "station", "airport", "park",
    "square", "bridge", "traffic", "transport", "bus", "train", "car",
}
TRAVEL_HINTS = {
    "travel", "trip", "journey", "holiday", "hotel", "ticket", "passport",
    "luggage", "flight", "plane", "airport", "train", "bus", "station",
    "country", "abroad", "tour", "visa", "map", "route",
}
SPORT_HINTS = {
    "sport", "game", "play", "team", "match", "ball", "football", "tennis",
    "swim", "run", "race", "gym", "exercise", "coach", "champion", "competition",
}
CULTURE_HINTS = {
    "art", "music", "film", "movie", "book", "story", "paint", "sing", "dance",
    "theatre", "concert", "museum", "culture", "tradition", "festival", "poem",
}
TECH_HINTS = {
    "computer", "phone", "internet", "online", "website", "email", "digital",
    "technology", "camera", "screen", "software", "network", "media", "radio",
}
SCHOOL_HINTS = {
    "school", "study", "learn", "teach", "student", "teacher", "exam", "test",
    "class", "lesson", "book", "write", "read", "university", "college", "job",
    "work", "office", "company", "business", "career", "interview",
}
HEALTH_HINTS = {
    "health", "doctor", "hospital", "ill", "sick", "pain", "medicine", "body",
    "head", "arm", "leg", "heart", "tooth", "dentist", "nurse", "exercise",
}
FEELING_HINTS = {
    "happy", "sad", "angry", "afraid", "feel", "feeling", "love", "hate",
    "worry", "nervous", "excited", "bored", "surprised", "proud", "jealous",
    "kind", "friendly", "polite", "rude", "confident", "shy",
}

HINT_MAP = {
    "people": PEOPLE_HINTS, "food": FOOD_HINTS, "nature": NATURE_HINTS,
    "city": CITY_HINTS, "travel": TRAVEL_HINTS, "sport": SPORT_HINTS,
    "culture": CULTURE_HINTS, "tech": TECH_HINTS, "school": SCHOOL_HINTS,
    "health": HEALTH_HINTS, "feelings": FEELING_HINTS,
}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text)).replace("’", "'").lower().strip()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"\s*,\s*", ",", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,;:")


def variants(text: str) -> list[str]:
    base = norm(text)
    out = {base}
    for part in re.split(r"[/,]", base):
        part = part.strip()
        if part:
            out.add(part)
            out.add(re.sub(r"^(a|an|the)\s+", "", part))
    # Strip a trailing "(sth/sb)" style marker that survived normalization.
    out |= {re.sub(r"\b(sth|sb)\b", "", x).strip() for x in list(out)}
    return [x for x in out if x]


def key_for(text: str) -> str:
    return norm(text)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().replace("'", "").replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "word"


def pos_short(value: str) -> str:
    value = (value or "").lower().strip()
    for prefix, short in (
        ("auxiliary", "aux."), ("modal", "modal v."), ("adjective", "adj."),
        ("adverb", "adv."), ("preposition", "prep."), ("conjunction", "conj."),
        ("pronoun", "pron."), ("determiner", "det."), ("exclamation", "int."),
        ("number", "num."), ("noun", "n."), ("verb", "v."), ("phrase", "phrase"),
    ):
        if value.startswith(prefix):
            return short
    mapping = {
        "noun": "n.", "verb": "v.", "adjective": "adj.", "adverb": "adv.",
        "preposition": "prep.", "conjunction": "conj.", "pronoun": "pron.",
        "determiner": "det.", "exclamation": "int.", "number": "num.",
        "auxiliary verb": "aux.", "modal verb": "modal v.", "phrase": "phrase",
    }
    return mapping.get(value, "")


def parse_maimemo(translation: str) -> tuple[str, str]:
    line = translation.replace("\\n", "\n").split("\n")[0].strip()
    pos = ""
    m = re.match(r"^((?:n|v|adj|adv|prep|conj|pron|num|art|aux|int|phr|na|vt|vi|a)\.)\s*", line)
    if m:
        pos = m.group(1).replace("na.", "n./adj.").replace("vt.", "v.").replace("vi.", "v.").replace("a.", "adj.")
        line = line[m.end():]
    senses = [s.strip(" ；;") for s in re.split(r"[；;]", line) if s.strip()]
    senses = [re.sub(r"（[^）]*）", "", s).strip() for s in senses]
    senses = [s for s in senses if s]
    return "；".join(senses[:3]), pos


def clean_example(text: str) -> str:
    text = (text or "").strip().replace("’", "'")
    text = re.sub(r"\s+", " ", text)
    return text


def load_course(path: Path, source_root: Path) -> tuple[dict, list[dict]]:
    entries = json.loads(path.read_text(encoding="utf-8"))["entries"]
    mapping = {}
    for entry in entries:
        for key in variants(entry.get("headword", "")) + [key_for(entry.get("slug", ""))]:
            if key and key not in mapping:
                mapping[key] = (entry, source_root)
    return mapping, entries


def main() -> None:
    official = json.loads((SRC / "pet-official-full.json").read_text(encoding="utf-8"))
    pet_map, pet_entries = load_course(SRC / "pet-course.json", Path("/tmp/pet-flash/public"))
    ket_map, ket_entries = load_course(SRC / "ket-course.json", Path("/tmp/ket-flash/public"))

    # ---- KET headwords (for exclusion tagging) ---------------------------------
    ket_words: set[str] = set()
    with (SRC / "ket-vocabulary.csv").open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            for key in variants(row.get("british", "")):
                ket_words.add(key)
                ket_words.add(key.replace("-", " "))

    def is_ket(word: str) -> bool:
        keys = set(variants(word))
        keys |= {k.replace("-", " ") for k in keys}
        if keys & ket_words:
            return True
        for key in list(keys):
            for suffix in ("s", "es", "ed", "ing", "ly", "er", "est"):
                if key.endswith(suffix) and len(key) - len(suffix) >= 3:
                    stem = key[: -len(suffix)]
                    if stem in ket_words:
                        return True
        return False

    # ---- course lookup ----------------------------------------------------------
    def find_course(word: str):
        for key in variants(word):
            if key in pet_map:
                return pet_map[key]
            if key in ket_map:
                return ket_map[key]
        return None

    # ---- Maimemo extras ---------------------------------------------------------
    maimemo: dict[str, tuple[str, str]] = {}
    with (SRC / "maimemo-pet21.csv").open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.reader(fh):
            if not row or not row[0].strip():
                continue
            word = row[0].strip()
            translation = row[1] if len(row) > 1 else ""
            zh, pos = parse_maimemo(translation)
            maimemo.setdefault(key_for(word), (word, zh, pos))
    maimemo = {k: {"word": v[0], "zh": v[1], "pos": v[2]} for k, v in maimemo.items()}

    # ---- records ----------------------------------------------------------------
    records: dict[str, dict] = {}
    topic_index: dict[str, set[str]] = defaultdict(set)
    for topic in official.get("topicLists", []):
        for term in topic.get("terms", []):
            for key in variants(term):
                topic_index[key].add(topic["id"])

    def add_record(word: str, official_entry: dict | None = None):
        key = key_for(word)
        if key in records:
            return
        course = find_course(word)
        if course:
            entry, source_root = course
            zh = "；".join(entry.get("chineseGlosses", [])[:3]).strip()
            pos = pos_short(entry.get("partOfSpeech", "")) or pos_short(entry.get("partOfSpeechOfficial", ""))
            definition = clean_example(entry.get("definition", ""))
            example = clean_example(entry.get("example", ""))
            audio_src = (source_root / entry["ukAudio"].lstrip("/")) if entry.get("ukAudio") else None
            slug = entry.get("slug") or slugify(word)
        else:
            extra = maimemo.get(key)
            zh = extra["zh"] if extra else ""
            pos = extra["pos"] if extra else ""
            definition = ""
            example = ""
            audio_src = None
            slug = slugify(word)
        if not zh:
            override = OVERRIDES.get(word) or OVERRIDES.get(word.lower())
            if override:
                zh, pos, example = override
                if not example:
                    example = ""
        if not zh:
            return
        if official_entry:
            pos = pos or pos_short(official_entry.get("partOfSpeechOfficial", ""))
        themes = set()
        for candidate in variants(word):
            for topic in topic_index.get(candidate, set()):
                themes.add(TOPIC_TO_THEME.get(topic, "daily"))
        records[key] = {
            "w": official_entry["headword"] if official_entry else word,
            "zh": zh,
            "pos": pos,
            "def": definition,
            "ex": example,
            "theme": "",  # assigned below
            "themes": sorted(themes),
            "ket": is_ket(word),
            "audioSource": str(audio_src) if audio_src and audio_src.exists() else "",
            "slug": slug,
        }

    for entry in official.get("entries", []):
        add_record(entry["headword"], entry)
    for key, item in maimemo.items():
        add_record(item["word"], None)

    # ---- WordNet semantic fallback themes --------------------------------------
    wn_themes = {}
    wn_path = DATA / "wordnet-themes.json"
    if wn_path.exists():
        wn_themes = json.loads(wn_path.read_text(encoding="utf-8"))

    # ---- assign themes (least populated among candidates) ----------------------
    counts = Counter()
    ordered = sorted(records.values(), key=lambda r: (len(r["themes"]), r["w"].lower()))
    for record in ordered:
        candidates = [t for t in record["themes"] if t in THEME_IDS]
        if not candidates:
            candidates = [t for t in wn_themes.get(record["w"], {}).get("themes", []) if t in THEME_IDS]
        if not candidates:
            lower = record["w"].lower()
            for theme, hints in HINT_MAP.items():
                if any(h in lower for h in hints):
                    candidates = [theme]
                    break
        if not candidates:
            candidates = THEME_IDS
        theme = min(candidates, key=lambda t: counts[t])
        record["theme"] = theme
        counts[theme] += 1

    # ---- audio manifest + copy --------------------------------------------------
    audio_dir = ROOT / "audio"
    audio_dir.mkdir(exist_ok=True)
    used_slugs = set()
    manifest = []
    needs_audio = []
    words = []
    for record in sorted(records.values(), key=lambda r: (r["theme"], r["w"].lower())):
        slug = slugify(record["slug"] or record["w"])
        base = slug
        i = 2
        while slug in used_slugs:
            slug = f"{base}-{i}"
            i += 1
        used_slugs.add(slug)
        dest = audio_dir / f"{slug}.mp3"
        audio = f"audio/{slug}.mp3"
        if record["audioSource"]:
            shutil.copyfile(record["audioSource"], dest)
            manifest.append({"word": record["w"], "slug": slug, "source": record["audioSource"]})
        elif dest.exists() and dest.stat().st_size > 1000:
            manifest.append({"word": record["w"], "slug": slug, "source": "existing"})
        else:
            needs_audio.append({"word": record["w"], "slug": slug})
        has_audio = dest.exists() and dest.stat().st_size > 1000
        ex_tokens = record["ex"].split() if record["ex"] else []
        words.append({
            "w": record["w"],
            "zh": record["zh"],
            "pos": record["pos"],
            "def": record["def"],
            "ex": record["ex"],
            "theme": record["theme"],
            "ket": record["ket"],
            "audio": audio if has_audio else "",
            "slug": slug,
            "quiz": bool(re.search(r"[A-Za-z]", record["w"])) and key_for(record["w"]) not in STOP_QUIZ and len(record["zh"]) > 0,
            "dictation": bool(re.fullmatch(r"[A-Za-z][A-Za-z' -]{2,24}", record["w"])) and " " not in record["w"].strip(),
            "sentence": 5 <= len(ex_tokens) <= 14 and bool(record["ex"]),
            "cloze": 5 <= len(ex_tokens) <= 16 and bool(record["ex"]),
            "syn": SYNONYMS.get(record["w"].lower(), []),
        })

    payload = {
        "meta": {
            "title": "PET 词汇星舰",
            "total": len(words),
            "petOnly": sum(1 for w in words if not w["ket"]),
            "ket": sum(1 for w in words if w["ket"]),
            "withExample": sum(1 for w in words if w["ex"]),
            "withAudio": sum(1 for w in words if w["audio"]),
            "themes": len(THEME_IDS),
        },
        "words": words,
    }
    (DATA / "vocab.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "audio-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "needs-audio.json").write_text(json.dumps(needs_audio, ensure_ascii=False, indent=1), encoding="utf-8")
    stats = {
        "total": len(words),
        "petOnly": payload["meta"]["petOnly"],
        "ket": payload["meta"]["ket"],
        "withExample": payload["meta"]["withExample"],
        "withAudio": payload["meta"]["withAudio"],
        "missingAudio": len(needs_audio),
        "themes": dict(Counter(w["theme"] for w in words)),
        "quiz": sum(1 for w in words if w["quiz"]),
        "dictation": sum(1 for w in words if w["dictation"]),
        "sentence": sum(1 for w in words if w["sentence"]),
        "cloze": sum(1 for w in words if w["cloze"]),
        "missingZh": [w["w"] for w in words if not w["zh"]][:20],
        "missingEx": [w["w"] for w in words if not w["ex"]][:40],
        "duplicates": [w for w, n in Counter(key_for(x["w"]) for x in words).items() if n > 1][:20],
    }
    (DATA / "build-stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
