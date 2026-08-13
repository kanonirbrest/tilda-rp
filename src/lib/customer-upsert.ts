import type { Prisma, PrismaClient } from "@prisma/client";

type CustomerDb = Pick<PrismaClient | Prisma.TransactionClient, "customer">;

export type CustomerContactInput = {
  name: string;
  email: string;
  phone: string;
  birthDate?: Date | null;
};

/**
 * Один человек = один email: находим существующего Customer или создаём.
 * При совпадении обновляем имя/телефон (и birthDate, если передана).
 */
export async function findOrCreateCustomerByEmail(
  tx: CustomerDb,
  input: CustomerContactInput,
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.replace(/\s+/g, " ").trim();
  const phone = input.phone.replace(/\s+/g, " ").trim();

  const existing = await tx.customer.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, birthDate: true },
  });

  if (existing) {
    return tx.customer.update({
      where: { id: existing.id },
      data: {
        name,
        phone,
        email,
        ...(input.birthDate != null ? { birthDate: input.birthDate } : {}),
      },
      select: { id: true },
    });
  }

  return tx.customer.create({
    data: {
      name,
      email,
      phone,
      ...(input.birthDate != null ? { birthDate: input.birthDate } : {}),
    },
    select: { id: true },
  });
}
