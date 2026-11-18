import { redirect } from "next/navigation";

/** Legacy route – members moved to /app/band. */
export default function PeoplePage() {
  redirect("/app/band");
}
