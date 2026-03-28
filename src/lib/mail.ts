import nodemailer from "nodemailer";

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

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

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
