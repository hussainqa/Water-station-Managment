/** The slice of the session user the shell needs; safe to pass to client components. */
export type ShellUser = {
  name: string;
  email: string;
  jobTitle: string;
  theme: string;
};
