import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
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
    attachmentBytes: opts.pdfBuffer.length,
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
    const info = await transporter.sendMail({
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
    throw err;
  }
}
