import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

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

export async function sendTicketEmail(opts: {
  to: string;
  customerName: string;
  pdfBuffer: Buffer;
  downloadUrl: string;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.info(
      `[mail] SMTP не настроен. Письмо для ${opts.to} не отправлено. Ссылка на билет: ${opts.downloadUrl}`,
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT || "587");
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
  console.info("[mail] отправка", {
    port,
    viaIpv4: connectHost !== host,
    connectionTimeoutMs: connectionTimeout,
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
  } as SMTPTransport.Options);

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: "Ваш билет",
    text: `Здравствуйте, ${opts.customerName}.\n\nБилет во вложении. Также можно скачать по ссылке: ${opts.downloadUrl}\n`,
    attachments: [
      {
        filename: "ticket.pdf",
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
