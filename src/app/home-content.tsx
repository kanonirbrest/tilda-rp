import Link from "next/link";
import "./home.css";

type NavItem = {
  href: string;
  label: string;
  hint?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Контакты",
    items: [
      { href: "/anketa", label: "Анкета", hint: "Сбор имени, даты рождения, телефона и email" },
      { href: "/users", label: "Пользователи", hint: "Список из базы, поиск и пагинация" },
    ],
  },
  {
    title: "Выставка",
    items: [
      { href: "/buy-tickets", label: "Купить билет", hint: "Основная витрина" },
      { href: "/buy-tickets-summer", label: "Лето", hint: "Летняя витрина" },
      { href: "/buy-tickets-smr", label: "Лето v2", hint: "Актуальная летняя витрина" },
    ],
  },
  {
    title: "События",
    items: [
      { href: "/nightofmuseums", label: "Ночь музеев" },
      { href: "/belye-nochi-18", label: "Белые ночи 18+" },
    ],
  },
  {
    title: "Сады сновидений",
    items: [
      { href: "/sady-snovideniy", label: "6 июля", hint: "Вход 18:30 · шоу 20:00" },
      { href: "/sady-snovideniy-19-07", label: "19 июля, 17:00", hint: "Вход 15:30 · шоу 17:00" },
      { href: "/sady-snovideniy-19-07-2030", label: "19 июля, 20:30", hint: "Вход 19:00 · шоу 20:30" },
      { href: "/sady-snovideniy-20-07", label: "20 июля", hint: "Вход 18:30 · шоу 20:00" },
      { href: "/sady-snovideniy-17-08", label: "17 августа", hint: "Вход 18:30 · шоу 20:00" },
      { href: "/sady-snovideniy-18-08", label: "18 августа", hint: "Вход 18:30 · шоу 20:00" },
      { href: "/sady-snovideniy-07-09", label: "7 сентября", hint: "Вход 18:30 · шоу 20:00" },
      { href: "/sady-snovideniy-08-09", label: "8 сентября", hint: "Вход 18:30 · шоу 20:00" },
    ],
  },
  {
    title: "Служебное",
    items: [
      { href: "/staff/login", label: "Персонал", hint: "Сканер QR и быстрый вход" },
      { href: "/admin", label: "Админка", hint: "Заявки, сеансы, статистика" },
    ],
  },
];

export function HomeContent() {
  return (
    <div className="home-hub">
      <div className="home-hub__bg" aria-hidden>
        <span className="home-hub__orb home-hub__orb--a" />
        <span className="home-hub__orb home-hub__orb--b" />
      </div>

      <div className="home-hub__inner">
        <header className="home-hub__header">
          <p className="home-hub__brand">DEI</p>
          <h1 className="home-hub__title">Tickets</h1>
          <p className="home-hub__lead">Витрины, контакты и служебный доступ</p>
        </header>

        <div className="home-hub__groups">
          {NAV_GROUPS.map((group) => {
            const headingId = `nav-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <section key={group.title} className="home-hub__group" aria-labelledby={headingId}>
                <h2 id={headingId} className="home-hub__group-title">
                  {group.title}
                </h2>
                <ul className="home-hub__list">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="home-hub__link">
                        <span className="home-hub__link-main">
                          <span className="home-hub__link-label">{item.label}</span>
                          {item.hint ? <span className="home-hub__link-hint">{item.hint}</span> : null}
                        </span>
                        <span className="home-hub__link-chev" aria-hidden>
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
