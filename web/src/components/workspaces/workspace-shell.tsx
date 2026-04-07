import { ReactNode } from "react";

type WorkspaceShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function WorkspaceShell({ title, description, children }: WorkspaceShellProps) {
  return (
    <section className="workspace-route">
      <header className="workspace-route-hero">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
