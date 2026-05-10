import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const DEFAULT_RESEND_API_URL = "https://api.resend.com/emails";

type TicketEmailInput = {
  to: string;
  customerName: string;
  /** Один или несколько PDF — по одному файлу на билет. */
  pdfAttachments: { filename: string; content: Buffer }[];
  downloadUrls: string[];
};

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

function resolveResendApiUrl(): string {
  const raw = process.env.RESEND_API_URL?.trim();
  if (!raw) return DEFAULT_RESEND_API_URL;
  return raw.replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Постоянные ссылки в теле письма (как в текстовой версии). */
const LINK_MAP_DEI = "https://yandex.ru/maps/-/CPbP4Qi2";
const LINK_MAP_PARKING =
  "https://yandex.ru/maps?whatshere%5Bzoom%5D=19&whatshere%5Bpoint%5D=27.567001,53.914411&si=ba5qnxud4b19pa7k85ky7a09a4";
const LINK_DEI_WAYS = "https://dei.by/contacts#ways";
const LINK_TELEGRAM_CLUB = "https://t.me/RazmanProductionBot?start=qr";
const LINK_INSTAGRAM = "https://www.instagram.com/deii.rp";

function buildTicketEmail(opts: TicketEmailInput): { subject: string; text: string; html: string } {
  const multiple = opts.pdfAttachments.length > 1;
  const urls = opts.downloadUrls.filter(Boolean);
  const linksBlock =
    urls.length > 1 ? urls.map((u, i) => `${i + 1}. ${u}`).join("\n") : (urls[0] ?? "");

  const ticketLead = multiple ? "Ваши билеты уже ждут вас:" : "Ваш билет уже ждёт вас:";
  const downloadBlock =
    multiple ?
      `Скачать билеты можно здесь:\n${linksBlock}\n`
    : `Скачать билет можно здесь:\n${linksBlock}\n`;
  const attachmentLine = multiple ?
    "Билеты также прикреплены к этому письму во вложении."
  : "Билет также прикреплён к этому письму во вложении.";

  const text = `Добрый день, на связи Razman Production!

Благодарим, что выбрали иммерсивную медиа-выставку «Небо.Река – Планета после шума»! Вы вот-вот погрузитесь в масштабный мир, где природа вдохновляет, технологии удивляют, живая музыка трогает!

${ticketLead}

${downloadBlock}
${attachmentLine}

Готовы к встрече?

• Наш адрес: DEI - Дом Экспериментального искусства (${LINK_MAP_DEI}) — Минск, Машерова 15/1 (вход со двора).
Возле пространства работает платная парковка (${LINK_MAP_PARKING}) — 3 р/час (заезд под шлагбаум возле бара Louis Prima)

Узнайте, как до нас добраться (${LINK_DEI_WAYS}) — мы выбрали удобные маршруты для вас.

• Присоединяйтесь к Клубу друзей Razman Production в Telegram (${LINK_TELEGRAM_CLUB}): здесь эксклюзивная информация о текущих проектах, анонсы событий, спецпредложения и сюрпризы для друзей!

Ждем вас на «Небо.Река» — пусть это путешествие станет незабываемым!

————————
С теплом,
Команда Razman Production и служба заботы о клиентах

Колл центр +375 (44) 738-33-33 | info@dei.by
Instagram: @deii.rp (${LINK_INSTAGRAM})
`;

  const downloadLinksHtml =
    urls.length === 0 ?
      ""
    : urls.length === 1 ?
      `<p><a href="${escapeHtml(urls[0]!)}">Скачать билет (PDF)</a></p>`
    : `<p>Скачать билеты:</p><ul>${urls
        .map(
          (u, i) =>
            `<li><a href="${escapeHtml(u)}">Билет ${i + 1} (PDF)</a></li>`,
        )
        .join("")}</ul>`;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222;">
<p>Добрый день, на связи Razman Production!</p>
<p>Благодарим, что выбрали иммерсивную медиа-выставку «Небо.Река – Планета после шума»! Вы вот-вот погрузитесь в масштабный мир, где природа вдохновляет, технологии удивляют, живая музыка трогает!</p>
<p><strong>${escapeHtml(ticketLead)}</strong></p>
${downloadLinksHtml}
<p>${escapeHtml(attachmentLine)}</p>
<p>Готовы к встрече?</p>
<p>• Наш адрес: <a href="${LINK_MAP_DEI}">DEI — Дом Экспериментального искусства</a> — Минск, Машерова 15/1 (вход со двора).<br />
Возле пространства работает <a href="${LINK_MAP_PARKING}">платная парковка</a> — 3 р/час (заезд под шлагбаум возле бара Louis Prima)</p>
<p><a href="${LINK_DEI_WAYS}">Узнайте, как до нас добраться</a> — мы выбрали удобные маршруты для вас.</p>
<p>• Присоединяйтесь к <a href="${LINK_TELEGRAM_CLUB}">Клубу друзей Razman Production в Telegram</a>: здесь эксклюзивная информация о текущих проектах, анонсы событий, спецпредложения и сюрпризы для друзей!</p>
<p>Ждем вас на «Небо.Река» — пусть это путешествие станет незабываемым!</p>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />
<p>С теплом,<br />
Команда Razman Production и служба заботы о клиентах</p>
<p>Колл-центр <a href="tel:+375447383333">+375 (44) 738-33-33</a> | <a href="mailto:info@dei.by">info@dei.by</a><br />
Instagram: <a href="${LINK_INSTAGRAM}">@deii.rp</a></p>
</body>
</html>`;

  return {
    subject: multiple ? "Ваши билеты — «Небо.Река»" : "Ваш билет — «Небо.Река»",
    text,
    html,
  };
}

async function sendViaResendApi(
  opts: TicketEmailInput & { apiKey: string; from: string },
): Promise<void> {
  const { subject, text, html } = buildTicketEmail(opts);
  const apiUrl = resolveResendApiUrl();
  const attachmentBytes = opts.pdfAttachments.reduce((n, a) => n + a.content.length, 0);
  console.info("[mail][resend] отправка", {
    apiUrl,
    from: opts.from,
    to: maskEmail(opts.to),
    attachments: opts.pdfAttachments.length,
    attachmentBytes,
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject,
      text,
      html,
      attachments: opts.pdfAttachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });

  const raw = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (parsed && typeof parsed.message === "string" ? parsed.message : "") ||
      (parsed ? JSON.stringify(parsed) : raw.slice(0, 800)) ||
      `HTTP ${response.status}`;
    console.error("[mail][resend] API ошибка", {
      status: response.status,
      message,
    });
    throw new Error(`RESEND_HTTP_${response.status}: ${message}`);
  }

  console.info("[mail][resend] отправлено", {
    id: parsed && typeof parsed.id === "string" ? parsed.id : null,
    to: maskEmail(opts.to),
  });
}

/** На Render исходящий IPv6 часто недоступен; Gmail отдаёт AAAA → nodemailer ходит в ENETUNREACH. */
async function smtpConnectTarget(hostname: string): Promise<{
  host: string;
  servername?: string;
}> {
  const h = hostname.trim();
  if (!h || net.isIP(h)) return { host: h };
  if (process.env.SMTP_IPV4_ONLY === "false") return { host: h };

  try {
    const { address } = await dns.lookup(h, { family: 4 });
    return { host: address, servername: h };
  } catch (err) {
    console.warn("[mail] IPv4 lookup не удался, подключаемся к исходному хосту", {
      host: h,
      err: String(err),
    });
    return { host: h };
  }
}

export async function sendTicketEmail(opts: TicketEmailInput): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = (process.env.RESEND_FROM || process.env.SMTP_FROM || "").trim();
  if (resendApiKey) {
    if (!resendFrom) {
      throw new Error("RESEND_FROM_REQUIRED");
    }
    await sendViaResendApi({
      ...opts,
      apiKey: resendApiKey,
      from: resendFrom,
    });
    return;
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(
      `[mail] SMTP не настроен. Письмо для ${opts.to} не отправлено. Ссылки: ${opts.downloadUrls.join(" ")}`,
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;

  const { host: connectHost, servername } = await smtpConnectTarget(host);
  const connectionTimeout = Number(
    process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "120000",
  );
  const greetingTimeout = Number(
    process.env.SMTP_GREETING_TIMEOUT_MS ?? "30000",
  );
  const smtpDebug = process.env.SMTP_DEBUG === "true";
  const tcpFamily = net.isIP(connectHost);
  console.info("[mail] отправка", {
    port,
    secure: port === 465,
    requireTls: port === 587,
    smtpConfiguredHost: host.trim(),
    tcpHost: connectHost,
    tcpIsIp: tcpFamily !== 0,
    tcpIpFamily: tcpFamily === 0 ? null : tcpFamily,
    tlsServername: servername ?? null,
    viaIpv4: connectHost !== host.trim(),
    connectionTimeoutMs: connectionTimeout,
    greetingTimeoutMs: greetingTimeout,
    attachmentBytes: opts.pdfAttachments.reduce((n, a) => n + a.content.length, 0),
    smtpDebug,
  });
  /** Явный тип — иначе TS выбирает перегрузку `TransportOptions` без поля `host` (падает `next build`). */
  const transporter = nodemailer.createTransport({
    host: connectHost,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout,
    greetingTimeout,
    auth: user ? { user, pass } : undefined,
    ...(servername ? { servername } : {}),
    ...(smtpDebug ? { debug: true, logger: true } : {}),
  } as SMTPTransport.Options);

  try {
    const { subject, text, html } = buildTicketEmail(opts);
    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject,
      text,
      html,
      attachments: opts.pdfAttachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: "application/pdf" as const,
      })),
    });
    console.info("[mail] отправлено", {
      messageId: info.messageId,
      to: maskEmail(opts.to),
    });
  } catch (err) {
    const e = err as Error & { code?: string; command?: string };
    console.error("[mail] sendMail ошибка", {
      message: e.message,
      code: e.code,
      command: e.command,
      tcpHost: connectHost,
      port,
      tlsServername: servername ?? null,
    });
    if (e.code === "ETIMEDOUT" && e.command === "CONN") {
      console.warn(
        "[mail] ETIMEDOUT CONN: TCP до SMTP не доходит (часто блокировка/фильтр с облака вроде Render до почты в BY). Попробуйте: SMTP_PORT другой (465↔587), SMTP_IPV4_ONLY=false, другой SMTP_HOST по доке хостера; иначе внешний SMTP (Resend и т.д.) или приложение на VPS у того же провайдера, что почта. Уточните у поддержки хостинга доступ к SMTP с внешних IP.",
      );
    }
    throw err;
  }
}
