#!/usr/bin/env python3
"""
Добавляет в Zero-блок #rec1960995161 недостающие дни марта 2026 (1–17, 23–24, 30–31):
клон шаблона 18 марта + свои data-elem-id, позиции и SBS-анимации.
Идемпотентно: повторный запуск не дублирует (по маркеру id 1773500000000000001).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "public/buy-tickets/calendar.html",
    ROOT / "public/buy-tickets/slot.html",
]

REC = "1960995161"
BASE_ELEM_ID = "1772095018728"  # 18 марта
NEXT_ELEM_ID = "1772192783266000001"  # 19 марта

MARKER_CSS = f'#rec{REC} .tn-elem[data-elem-id="{NEXT_ELEM_ID}"]{{z-index'
MARKER_HTML = f'<div class="t396__elem tn-elem tn-elem__{REC}{BASE_ELEM_ID}"'

DEI_STYLE_START = '<style id="dei-cal-day-fill">'
DEI_STYLE_END = "</style>"

# Дни, которых нет в экспорте Тильды
EXTRA_DAYS = list(range(1, 18)) + [23, 24, 30, 31]


def main_left(day: int) -> int:
    return 20 + (day - 18) * 60


def res960_left(day: int) -> int:
    return main_left(day) - 9


def inline_left_px(day: int) -> float:
    return 145.5 + (main_left(day) - 20)


def new_elem_id(day: int) -> str:
    return str(1773500000000000000 + day)


def sbs_block(new_id: str) -> str:
    return f""".t-sbs-anim_started #sbs-{REC}-{new_id} {{
animation: sbs-{REC}-{new_id} 0.2s linear forwards;
backface-visibility: hidden;
}}

@keyframes sbs-{REC}-{new_id} {{
0% {{opacity:0;animation-timing-function:0;}}
1% {{opacity:0;animation-timing-function:0;}}
100% {{opacity:1;}}
}}

#rec{REC} [data-elem-id="{new_id}"].t-sbs-anim_started.t-sbs-anim_reversed .tn-atom__sbs-anim-wrapper {{-webkit-animation-direction: reverse;animation-direction: reverse;}}
"""


def build_css_for_day(template: str, day: int, new_id: str) -> str:
    ml = main_left(day)
    r9 = res960_left(day)
    s = template.replace(BASE_ELEM_ID, new_id)
    # Позиции в calc (основной и max-width 1199)
    s = s.replace("50% - 600px + 20px", f"50% - 600px + {ml}px" if ml >= 0 else f"50% - 600px - {-ml}px")
    s = s.replace("50% - 480px + 11px", f"50% - 480px + {r9}px" if r9 >= 0 else f"50% - 480px - {-r9}px")
    return s


def build_html_for_day(template: str, day: int, new_id: str) -> str:
    ml = main_left(day)
    r9 = res960_left(day)
    il = inline_left_px(day)
    lab = f"{day} марта 2026"
    s = template.replace(BASE_ELEM_ID, new_id)
    s = s.replace(f"tn-elem__{REC}{BASE_ELEM_ID}", f"tn-elem__{REC}{new_id}")
    s = s.replace(f"sbs-{REC}-{BASE_ELEM_ID}", f"sbs-{REC}-{new_id}")
    s = s.replace("aria-label=\"18 марта 2026\"", f'aria-label="{lab}"')
    s = re.sub(r'data-field-left-value="-?\d+"', f'data-field-left-value="{ml}"', s, count=1)
    if 'data-field-left-res-960-value="' in s:
        s = re.sub(
            r'data-field-left-res-960-value="-?\d+"',
            f'data-field-left-res-960-value="{r9}"',
            s,
            count=1,
        )
    s = re.sub(
        r'style="width: 60px; left: [^;]+; top: 10px;',
        f'style="width: 60px; left: {il}px; top: 10px;',
        s,
        count=1,
    )
    # Уникальные id path в SVG
    s = s.replace('id="tSvg75daeefd1f"', f'id="tSvg_dei_m{day}_a"')
    s = s.replace('id="tSvge9b821eb46"', f'id="tSvg_dei_m{day}_b"')
    return s


def inject(html: str) -> str:
    if "1773500000000000001" in html:
        return html

    i = html.find(f'id="rec{REC}"')
    j = html.find('id="rec1960994081"')
    if i < 0 or j < 0:
        raise SystemExit(f"markers not found: rec {REC} or april header")

    chunk = html[i:j]
    t396 = chunk.find('<div class="t396')
    if t396 < 0:
        raise SystemExit("t396 not found in march chunk")

    css = chunk[:t396]
    body = chunk[t396:]

    css_start = css.find(f'#rec{REC} .tn-elem[data-elem-id="{BASE_ELEM_ID}"]{{z-index')
    if css_start < 0:
        raise SystemExit("march day 18 CSS start not found")
    css_cut = css.find(MARKER_CSS)
    if css_cut < 0:
        raise SystemExit("march day 19 CSS marker not found")
    template_css = css[css_start:css_cut]

    m = re.search(
        rf'(<div class="t396__elem tn-elem tn-elem__{REC}{BASE_ELEM_ID}" data-elem-id="{BASE_ELEM_ID}"[\s\S]*?</a></div></div>\s*)',
        body,
    )
    if not m:
        raise SystemExit("march day 18 HTML template not found")
    template_html = m.group(1)

    css_inserts: list[str] = []
    html_inserts: list[str] = []
    sbs_inserts: list[str] = []

    for day in EXTRA_DAYS:
        nid = new_elem_id(day)
        css_inserts.append(build_css_for_day(template_css, day, nid))
        html_inserts.append(build_html_for_day(template_html, day, nid))
        sbs_inserts.append(sbs_block(nid))

    new_chunk = (
        css[:css_start]
        + "".join(css_inserts)
        + template_css
        + css[css_cut:]
        + body[: m.start()]
        + "".join(html_inserts)
        + body[m.start() :]
    )

    out = html[:i] + new_chunk + html[j:]

    ds = out.find(DEI_STYLE_START)
    if ds < 0:
        raise SystemExit("dei-cal-day-fill not found")
    de = out.find(DEI_STYLE_END, ds)
    if de < 0:
        raise SystemExit("dei-cal-day-fill close not found")
    sbs_css = "\n/* SBS: доп. дни марта */\n" + "".join(sbs_inserts)
    out = out[:de] + sbs_css + out[de:]
    return out


def main() -> None:
    for path in FILES:
        if not path.is_file():
            print("skip", path)
            continue
        text = path.read_text(encoding="utf-8", errors="strict")
        if "1773500000000000001" in text:
            print("already patched", path.name)
            continue
        new_text = inject(text)
        path.write_text(new_text, encoding="utf-8")
        print("patched", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
