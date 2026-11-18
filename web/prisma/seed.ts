import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "owner@example.com";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
  const weak = password === "ChangeMe123!" || password.length < 10;
  if (process.env.NODE_ENV === "production" && weak) {
    throw new Error("SUPER_ADMIN_PASSWORD must be set to a strong value (10+ characters, not the default) in production");
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (existing) {
    console.log(`Super admin already exists: ${existing.username}`);
    return;
  }
  await prisma.user.create({
    data: { role: "SUPER_ADMIN", name: "Platform Owner", username: email, email, passwordHash },
  });
  console.log(`Created super admin ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
