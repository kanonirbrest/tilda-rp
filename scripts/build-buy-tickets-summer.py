#!/usr/bin/env python3
"""
Собирает public/buy-tickets-summer/ из buy-tickets:
те же блоки календаря, но заголовки Июнь/Июль/Август и дни 1..N для 2026.
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "public/buy-tickets"
DST_DIR = ROOT / "public/buy-tickets-summer"

MONTHS = [
    {
        "scroll_rec": "1960995161",
        "genitive": "июня",
        "days": 30,
        "id_base": 1773600000000000000,
    },
    {
        "scroll_rec": "1960923641",
        "genitive": "июля",
        "days": 31,
        "id_base": 1773600000000000100,
    },
    {
        "scroll_rec": "1961209921",
        "genitive": "августа",
        "days": 31,
        "id_base": 1773600000000000200,
    },
]

TITLE_MAP = (("Март", "Июнь"), ("Апрель", "Июль"), ("Май", "Август"))
DAY_ELEM_RE = re.compile(
    r'<div class="t396__elem tn-elem[^>]*data-elem-type="vector"[^>]*>.*?</div>\s*</div>',
    re.DOTALL,
)
ELEM_ID_RE = re.compile(r'data-elem-id="(\d+)"')
REC_ELEM_CSS_RE = re.compile(
    r"#rec(?P<rec>\d+) [^{]*\[data-elem-id=\"(?P<eid>\d+)\"\][^{]*\{[^}]+\}",
)


def left_for_day(day: int) -> int:
    return 20 + (day - 1) * 60


def left_res960(main_left: int) -> int:
    return max(0, main_left - 10)


def left_res320(main_left: int) -> int:
    return max(10, int(round((main_left - 20) * 0.764) + 10))


def patch_day_elem(template: str, rec: str, day: int, genitive: str, elem_id: str, left: int) -> str:
    label = f"{day} {genitive} 2026"
    s = template
    s = re.sub(r'data-elem-id="[^"]+"', f'data-elem-id="{elem_id}"', s, count=1)
    s = re.sub(
        r"tn-elem tn-elem__\d+",
        f"tn-elem tn-elem__{rec}{elem_id}",
        s,
        count=1,
    )
    s = re.sub(r'id="sbs-\d+-[^"]+"', f'id="sbs-{rec}-{elem_id}"', s, count=1)
    s = re.sub(r'aria-label="[^"]*"', f'aria-label="{label}"', s, count=1)
    s = re.sub(r'data-field-left-value="\d+"', f'data-field-left-value="{left}"', s, count=1)
    s = re.sub(
        r'data-field-left-res-960-value="\d+"',
        f'data-field-left-res-960-value="{left_res960(left)}"',
        s,
        count=1,
    )
    s = re.sub(
        r'data-field-left-res-320-value="\d+"',
        f'data-field-left-res-320-value="{left_res320(left)}"',
        s,
        count=1,
    )
    # Позиция — только из CSS Tilda (calc); inline left на мобилке ломает подложку SVG.
    s = re.sub(r";\s*left:\s*[\d.]+px", "", s, count=1)
    return s


def replace_month_days(
    block: str, rec: str, genitive: str, days: int, id_base: int
) -> tuple[str, str, set[str]]:
    matches = list(DAY_ELEM_RE.finditer(block))
    if not matches:
        raise ValueError(f"no day elems in rec{rec}")
    template = matches[0].group(0)
    template_eid = ELEM_ID_RE.search(template)
    if not template_eid:
        raise ValueError(f"no template elem id in rec{rec}")
    template_eid = template_eid.group(1)

    old_ids: set[str] = set()
    for m in matches:
        eid = ELEM_ID_RE.search(m.group(0))
        if eid:
            old_ids.add(eid.group(1))

    built: list[str] = []
    for day in range(1, days + 1):
        elem_id = str(id_base + day)
        built.append(
            patch_day_elem(template, rec, day, genitive, elem_id, left_for_day(day))
        )
    replacement = "".join(built)
    new_block = block[: matches[0].start()] + replacement + block[matches[-1].end() :]
    return new_block, template_eid, old_ids


def extract_css_rules(html: str, rec: str, elem_id: str) -> list[str]:
    pat = re.compile(
        rf"#rec{rec} [^{{]*\[data-elem-id=\"{re.escape(elem_id)}\"\][^{{]*\{{[^}}]+\}}"
    )
    return pat.findall(html)


def remove_rec_elem_css(html: str, rec: str, elem_ids: set[str]) -> str:
    for eid in elem_ids:
        pat = re.compile(
            rf"#rec{rec} [^{{]*\[data-elem-id=\"{re.escape(eid)}\"\][^{{]*\{{[^}}]+\}}"
        )
        html = pat.sub("", html)
        pat2 = re.compile(
            rf"#rec{rec} \[data-elem-id=\"{re.escape(eid)}\"\][^{{]*\{{[^}}]+\}}"
        )
        html = pat2.sub("", html)
    return html


def patch_rule_lefts(rule: str, main_left: int) -> str:
    l480 = left_res960(main_left)
    l320 = left_res320(main_left)

    def repl(match: re.Match[str]) -> str:
        calc = match.group(0)
        if "- 600px" in calc:
            return f"left:calc(50% - 600px + {main_left}px)"
        if "- 480px" in calc:
            return f"left:calc(50% - 480px + {l480}px)"
        if "- 160px" in calc:
            return f"left:calc(50% - 160px + {l320}px)"
        return calc

    return re.sub(r"left:calc\([^)]+\)", repl, rule)


def build_css_for_days(
    template_rules: list[str], rec: str, template_eid: str, days: int, id_base: int
) -> str:
    chunks: list[str] = []
    for day in range(1, days + 1):
        new_eid = str(id_base + day)
        main_left = left_for_day(day)
        for rule in template_rules:
            nr = rule.replace(template_eid, new_eid)
            chunks.append(patch_rule_lefts(nr, main_left))
    return "".join(chunks)


def append_css_near_rec(html: str, rec: str, css_chunk: str) -> str:
    anchor = f"#rec{rec} .t396__artboard"
    idx = html.find(anchor)
    if idx < 0:
        raise ValueError(f"no stylesheet anchor for rec{rec}")
    style_end = html.find("</style>", idx)
    if style_end < 0:
        raise ValueError(f"no </style> after rec{rec}")
    return html[:style_end] + css_chunk + html[style_end:]


def patch_scroll_to_first_month(html: str) -> str:
    html = html.replace(
        "/** Прокрутка марта к самому раннему числу в ряду (слева), чтобы ряд «начинался» с 1-го доступного марта */",
        "/** Прокрутка июня к первому числу в ряду (слева) */",
    )
    html = html.replace(
        "function deiCalScrollMarchToFirstDay()",
        "function deiCalScrollJuneToFirstDay()",
    )
    html = html.replace(
        r'var m = lab.match(/^(\d{1,2})\s+марта\s+(\d{4})\s*$/i);',
        r'var m = lab.match(/^(\d{1,2})\s+июня\s+(\d{4})\s*$/i);',
    )
    html = html.replace("deiCalScrollMarchToFirstDay", "deiCalScrollJuneToFirstDay")
    return html


def patch_meta(html: str) -> str:
    html = html.replace(
        "Купить билет на выставку Небо.Река с 18 марта по 23 августа 2026",
        "Купить билет на выставку Небо.Река — июнь, июль, август 2026",
    )
    return html


def transform(html: str) -> str:
    for old, new in TITLE_MAP:
        html = html.replace(f">{old}<", f">{new}<")

    for spec in MONTHS:
        rec = spec["scroll_rec"]
        start = html.find(f'id="rec{rec}"')
        if start < 0:
            raise ValueError(f"missing rec{rec}")
        end = html.find('id="rec', start + 20)
        if end < 0:
            raise ValueError(f"unclosed rec{rec}")
        block = html[start:end]
        new_block, template_eid, old_ids = replace_month_days(
            block, rec, spec["genitive"], spec["days"], spec["id_base"]
        )
        template_rules = extract_css_rules(html, rec, template_eid)
        if not template_rules:
            raise ValueError(f"no CSS template rules for rec{rec} elem {template_eid}")

        html = html[:start] + new_block + html[end:]
        html = remove_rec_elem_css(html, rec, old_ids)
        html = append_css_near_rec(
            html,
            rec,
            build_css_for_days(
                template_rules, rec, template_eid, spec["days"], spec["id_base"]
            ),
        )

    html = patch_scroll_to_first_month(html)
    html = patch_meta(html)
    return html


def main() -> None:
    if not SRC_DIR.is_dir():
        print(f"Missing {SRC_DIR}", file=sys.stderr)
        sys.exit(1)

    if DST_DIR.exists():
        shutil.rmtree(DST_DIR)
    shutil.copytree(SRC_DIR, DST_DIR)

    for name in ("calendar.html", "slot.html"):
        path = DST_DIR / name
        text = path.read_text(encoding="utf-8")
        path.write_text(transform(text), encoding="utf-8")
        print(f"Written {path}")

    print("Done:", DST_DIR)


if __name__ == "__main__":
    main()
