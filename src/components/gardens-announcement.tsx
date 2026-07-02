import Image from "next/image";
import { GARDENS_DREAM5_PROMO_CODE } from "@/lib/gardens-of-dreams/ensure-promo";

export function GardensAnnouncement() {
  return (
    <section className="god-about" aria-labelledby="god-about-title">
      <div className="god-about__poster">
        <Image
          src="/sady-snovideniy/poster.png"
          alt="Афиша «Сады сновидений» — 6 июля, иммерсивная танцевальная мистерия"
          width={720}
          height={1018}
          priority
          className="god-about__poster-img"
        />
      </div>

      <div className="god-about__text">
        <h2 id="god-about-title" className="god-about__title">
          О спектакле
        </h2>

        <p className="god-about__lead">
          6&nbsp;июля на выставке «Небо.Река» пройдёт премьера иммерсивной танцевальной мистерии
          «Сады сновидений», где зрители станут частью происходящего. Как это будет?
        </p>

        <p>
          По задумке авторов, привычной сцены здесь не будет. Пространство объединит современный
          танец, живую музыку и визуальные эффекты в единое действие, внутри которого окажутся
          зрители. Артисты будут взаимодействовать с потоками воды и светом, а музыка будет
          рождаться прямо в моменте вместе с происходящим.
        </p>

        <p>
          Дождь, дым, лазерные эффекты и масштабные проекции на парящую планету станут частью
          единого действия.
        </p>

        <p className="god-about__meta">
          <strong>Стоимость билетов:</strong> от 90 до 150&nbsp;BYN. В программу входит посещение
          выставки «Небо.Река» с 18:30 до 20:00, после чего в 20:00 начнётся танцевальная
          мистерия «Сады сновидений». Длительность шоу — 60&nbsp;минут.
        </p>

        <p className="god-about__promo">
          Только для Клуба друзей Razman Production — скидка 5% по промокоду{" "}
          <span className="god-about__promo-code">{GARDENS_DREAM5_PROMO_CODE}</span>
        </p>
      </div>
    </section>
  );
}
