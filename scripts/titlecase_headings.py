#!/usr/bin/env python3
"""
One-time mechanical pass: convert static heading text (<h1>-<h6>) to Title Case
across the app. Run once, review the diff, then delete this script (or keep it
for future audits).

Rules:
- Small words (articles, short prepositions/conjunctions) stay lowercase unless
  they're the first or last word.
- Words containing JSX interpolation ({...}) or template literals (${...}) are
  left untouched, as are words that are already all-caps (acronyms like TREC,
  API, PDF) or mixed-case brand-style tokens.
- Words with an apostrophe (you're, don't) are title-cased on the part before
  the apostrophe only (You're, Don't).
- Punctuation-only trailing/leading characters are preserved.
- Only single-line `<hN ...>TEXT</hN>` patterns with pure static text (no
  leading `{`) are touched — multi-line / fully-dynamic headings are skipped
  and left for manual review.
"""
import re
import glob
import sys

SMALL_WORDS = {
    "a", "an", "the", "and", "or", "but", "nor", "for", "so", "yet",
    "as", "at", "by", "in", "into", "of", "on", "onto", "per", "to",
    "up", "via", "vs", "with", "from", "over", "off",
}

# Multi-letter tokens that are acronyms/initialisms/brand tokens and must never
# be re-cased even if they appear lowercase or mixed-case in source.
KNOWN_ACRONYMS = {
    "pdf": "PDF", "pdfs": "PDFs", "trec": "TREC", "api": "API",
    "faq": "FAQ", "faqs": "FAQs", "url": "URL", "id": "ID", "ids": "IDs",
    "crm": "CRM", "css": "CSS", "html": "HTML", "seo": "SEO",
    "ar": "AR", "ap": "AP", "io": "IO",
}

# Brand / product names with non-standard internal capitalization that a
# naive title-caser would otherwise mangle.
BRAND_NAMES = {
    "realtyline": "RealtyLine",
}

# Whole hyphenated tokens with a non-standard lowercase-first convention
# already established in this codebase (matches e-mail/e-commerce style).
BRAND_HYPHEN_TOKENS = {
    "e-blast": "e-Blast",
}

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\u2019-]*")


def titlecase_word(word: str, is_first: bool, is_last: bool) -> str:
    lower = word.lower()
    core = lower.split("'")[0].split("\u2019")[0]

    if lower in BRAND_NAMES:
        return BRAND_NAMES[lower]

    if lower in BRAND_HYPHEN_TOKENS:
        return BRAND_HYPHEN_TOKENS[lower]

    # Hyphenated compounds: title-case each side independently (e.g.
    # "deal-prep" -> "Deal-Prep"), except when a side is a known acronym.
    if "-" in word:
        parts = word.split("-")
        new_parts = []
        for part in parts:
            part_lower = part.lower()
            if part_lower in KNOWN_ACRONYMS:
                new_parts.append(KNOWN_ACRONYMS[part_lower])
            elif part:
                new_parts.append(part[:1].upper() + part[1:].lower())
            else:
                new_parts.append(part)
        return "-".join(new_parts)

    if core in KNOWN_ACRONYMS:
        return KNOWN_ACRONYMS[core]

    if core in SMALL_WORDS and not is_first and not is_last:
        return lower
    # Preserve acronyms (already all upper in original) - handled by caller
    # Capitalize first letter, keep rest as-is after apostrophe split
    if "'" in word or "\u2019" in word:
        sep = "'" if "'" in word else "\u2019"
        head, _, tail = word.partition(sep)
        return head[:1].upper() + head[1:].lower() + sep + tail.lower()
    return word[:1].upper() + word[1:].lower()


def titlecase_text(text: str) -> str:
    # Skip if it contains JSX/template interpolation - leave untouched entirely
    if "{" in text or "${" in text:
        return text

    words = []
    tokens = re.split(r"(\s+)", text)
    # Find indices of actual word tokens (not whitespace/punctuation-only)
    word_token_indices = [i for i, t in enumerate(tokens) if WORD_RE.search(t)]
    if not word_token_indices:
        return text
    first_idx, last_idx = word_token_indices[0], word_token_indices[-1]

    out = []
    for i, tok in enumerate(tokens):
        m = WORD_RE.search(tok)
        if not m:
            out.append(tok)
            continue
        word = m.group(0)
        prefix = tok[: m.start()]
        suffix = tok[m.end():]
        # Never touch HTML entities: &amp; &rsquo; &apos; &nbsp; etc. - the
        # word run is immediately preceded by '&' with no space, and the
        # char right after the word is ';'.
        if prefix.endswith("&") and suffix.startswith(";"):
            new_word = word
        # Preserve existing all-caps acronyms (2+ letters, all upper already)
        elif word.isupper() and len(word) > 1:
            new_word = word
        else:
            is_first = i == first_idx
            is_last = i == last_idx
            new_word = titlecase_word(word, is_first, is_last)
        out.append(prefix + new_word + suffix)
    return "".join(out)


HEADING_RE = re.compile(r"(<h[1-6][^>]*>)([^<{][^<]*)(</h[1-6]>)")


def process_file(path: str) -> tuple[int, list[str]]:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    changes = []
    count = 0

    def repl(m: re.Match) -> str:
        nonlocal count
        open_tag, text, close_tag = m.group(1), m.group(2), m.group(3)
        new_text = titlecase_text(text)
        if new_text != text:
            count += 1
            changes.append(f"  {text!r} -> {new_text!r}")
        return open_tag + new_text + close_tag

    new_content = HEADING_RE.sub(repl, content)
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
    return count, changes


def main():
    dry_run = "--dry-run" in sys.argv
    files = sorted(
        set(glob.glob("app/**/*.tsx", recursive=True) + glob.glob("components/**/*.tsx", recursive=True))
    )
    total = 0
    for f in files:
        if "node_modules" in f:
            continue
        if dry_run:
            with open(f, encoding="utf-8") as fh:
                content = fh.read()
            local_changes = []
            local_count = 0

            def repl(m: re.Match) -> str:
                nonlocal local_count
                text = m.group(2)
                new_text = titlecase_text(text)
                if new_text != text:
                    local_count += 1
                    local_changes.append(f"  {text!r} -> {new_text!r}")
                return m.group(0)

            HEADING_RE.sub(repl, content)
            if local_count:
                print(f"{f} ({local_count})")
                for c in local_changes:
                    print(c)
                total += local_count
        else:
            count, changes = process_file(f)
            if count:
                print(f"{f} ({count})")
                for c in changes:
                    print(c)
                total += count
    print(f"\nTOTAL: {total} heading strings changed")


if __name__ == "__main__":
    main()
