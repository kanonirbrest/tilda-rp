#!/usr/bin/env python3
"""Патч экспорта Тильды: убрать дубликаты под uc-new, починить обёртку wrapAll."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "public/buy-tickets/calendar.html",
    ROOT / "public/buy-tickets/slot.html",
]

OLD_WRAP = "$('#rec1960210321,#rec1960844041,#rec1960995161,#rec1960994081,#rec1960923641,#rec1961209071,#rec1965636591,#rec1961209921,#rec1961440851').wrapAll('<div class=\".uc-new\"></div>');"

NEW_WRAP = "$('#rec1960210321,#rec1960844041,#rec1960995161,#rec1960994081,#rec1960923641,#rec1961209071,#rec1961209921,#rec1961440851').wrapAll('<div class=\"uc-new uc-new--wrap\"></div>');"

OLD_CSS = """.uc-new {
background-color: unset !important;
background-image: url('https://static.tildacdn.biz/tild3437-3561-4038-a638-663362666335/7777.jpg') !important;
background-position: top !important;
background-size: cover;
background-attachment: fixed !important;
}"""

NEW_CSS = """.uc-new.uc-new--wrap {
background-color: transparent !important;
background-image: none !important;
}
/* Фон не повторять на каждом внутреннем t-rec с классом uc-new */
.r.t-rec.uc-new {
  background-image: none !important;
  background-attachment: scroll !important;
}
/* Нижние дубликаты «Выберите дату» (T396); заголовок страницы — только rec1960210321 */
#rec1960529231,
#rec2107714401 {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
/* Попап t1093: «стекло» (фон страницы — на body::before, иначе backdrop часто пустой) */
#rec1961440851 .t1093 .t-popup__bg {
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  backdrop-filter: blur(18px) saturate(1.12);
  background-color: rgba(12, 6, 32, 0.45) !important;
  transform: translateZ(0);
}
#rec1961449631,
#rec1961449631 .tn-atom {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#rec1961449631 .dei-order-total-wrap {
  text-align: left;
  margin-bottom: 14px;
}
#rec1961449631 .dei-order-total {
  text-align: left;
  color: #ffffff;
  font-size: 18px;
  font-weight: 500;
  font-family: var(--t-headline-font, Arial), Arial, sans-serif;
  line-height: 1.35;
}
#rec1961449631 .tn-elem.count .tn-atom,
#rec1961449631 .tn-elem.count1 .tn-atom,
#rec1961449631 .tn-elem.count2 .tn-atom,
#rec1961449631 .tn-elem.plus,
#rec1961449631 .tn-elem.minus,
#rec1961449631 .tn-elem.plus1,
#rec1961449631 .tn-elem.minus1,
#rec1961449631 .tn-elem.plus2,
#rec1961449631 .tn-elem.minus2 {
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent;
}
"""


def strip_uc_new_from_rec_classes(html: str) -> str:
    """Убираем класс uc-new у блоков rec*, чтобы стиль фона не дублировался."""

    def fix_class(m: re.Match[str]) -> str:
        pre, cls, post = m.group(1), m.group(2), m.group(3)
        cls2 = re.sub(r"\s*uc-new\s*", " ", cls)
        cls2 = re.sub(r"\s+", " ", cls2).strip()
        return f"{pre}{cls2}{post}"

    return re.sub(
        r'(<div id="rec\d+"[^>]*\sclass=")([^"]*)(")',
        fix_class,
        html,
    )


def main() -> None:
    for path in FILES:
        if not path.is_file():
            print("skip missing", path)
            continue
        text = path.read_text(encoding="utf-8", errors="strict")
        # Сохранённый в HTML превью-обёртка с неверным классом «.uc-new»
        text = text.replace(
            '<div class=".uc-new">',
            '<div class="uc-new uc-new--wrap">',
        )
        if OLD_WRAP not in text:
            print("warn: wrap pattern not found", path.name)
        else:
            text = text.replace(OLD_WRAP, NEW_WRAP, 1)
        if OLD_CSS not in text:
            print("warn: css pattern not found", path.name)
        else:
            text = text.replace(OLD_CSS, NEW_CSS, 1)
        text = strip_uc_new_from_rec_classes(text)
        path.write_text(text, encoding="utf-8")
        print("patched", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
