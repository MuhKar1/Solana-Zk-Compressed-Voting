import Link from "next/link";
import { CreatePollForm } from "../../components/polls/CreatePollForm";

export default function NewPollPage() {
  return (
    <div className="page-narrow">
      <Link href="/" className="back-link">
        ← All polls
      </Link>
      <CreatePollForm />
    </div>
  );
}
