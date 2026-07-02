import Image from "next/image";

export function BelyeNochiAnnouncement() {
  return (
    <section className="nom-about" aria-labelledby="bn-about-title">
      <div className="nom-about__poster">
        <Image
          src="/belye-nochi-18/poster.png"
          alt="Афиша «Белые ночи» — 11 июля, вечеринка R&B 2000-х на «Небо.Река»"
          width={720}
          height={1018}
          priority
          className="nom-about__poster-img"
        />
      </div>

      <div className="nom-about__text">
        <h2 id="bn-about-title" className="nom-about__title">
          О вечеринке
        </h2>

        <p className="nom-about__lead">
          «Небо.Река» приглашает на вечеринку «Белые ночи» в стиле R&amp;B 2000-х — ночь, где каждый
          трек будет попадать прямо в сердце
        </p>

        <p>
          <strong>🎧 DJ&apos;s Kira Miller &amp; Bazhen</strong>
          <br />
          За пультом — проводники в золотую эпоху MTV. Только хиты, которые знает каждый: Beyoncé,
          50&nbsp;Cent, Justin Timberlake, Sean Paul, Destiny&apos;s Child, Nelly, Timbaland, Black
          Eyed Peas и другие легенды нулевых.
        </p>

        <ul className="nom-about__highlights">
          <li>🍸 Авторские коктейли и любимая классика</li>
          <li>🪐 Огромная розовая планета над танцполом</li>
          <li>🤍 Dress code: WHITE ONLY</li>
        </ul>

        <p className="nom-about__meta">
          <strong>🎫 Стоимость:</strong> 60&nbsp;BYN онлайн (в кассе перед мероприятием —
          70&nbsp;BYN)
          <br />
          <strong>🗓️ Дата:</strong> 11&nbsp;июля
        </p>

        <p className="nom-about__tagline">
          Если ты давно ждал вечеринку, ради которой стоит выйти из дома — это она!
        </p>
      </div>
    </section>
  );
}
