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
  /** Один или несколько PDF — по одному файлу на билет. */
  pdfAttachments: { filename: string; content: Buffer }[];
  downloadUrls: string[];
}): Promise<void> {
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
    const linksBlock =
      opts.downloadUrls.length > 1
        ? opts.downloadUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")
        : opts.downloadUrls[0] ?? "";
    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.pdfAttachments.length > 1 ? "Ваши билеты" : "Ваш билет",
      text: `Здравствуйте, ${opts.customerName}.\n\n${
        opts.pdfAttachments.length > 1
          ? `Билеты во вложении (${opts.pdfAttachments.length} файла). Также можно скачать по ссылкам:\n${linksBlock}\n`
          : `Билет во вложении. Также можно скачать по ссылке: ${linksBlock}\n`
      }`,
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
