import type { Role } from "@prisma/client";
import type { NavItem } from "./sidebar-nav";

/** Main navigation per role. Shared by every layout plus the account and notification pages. */
export function navFor(role: Role): NavItem[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [
        { href: "/admin", label: "Schools", exact: true },
        { href: "/admin/audit", label: "Activity" },
      ];
    case "SCHOOL_ADMIN":
      return [
        { href: "/school", label: "Overview", exact: true },
        { href: "/school/classes", label: "Classes & syllabus" },
        { href: "/school/teachers", label: "Teachers" },
        { href: "/school/students", label: "Students" },
        { href: "/school/families", label: "Families" },
        { href: "/school/billing", label: "Plan & billing" },
        { href: "/school/audit", label: "Activity" },
      ];
    case "TEACHER":
      return [{ href: "/teacher", label: "My classes" }];
    case "STUDENT":
      return [{ href: "/student", label: "My lessons" }];
    case "PARENT":
      return [{ href: "/family", label: "My family" }];
  }
}
