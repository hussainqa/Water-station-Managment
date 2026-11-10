import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware wrappers. Always import Link/redirect/useRouter from here, not from next/*.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
