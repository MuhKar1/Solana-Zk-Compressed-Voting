"use client";

const STEPS = [
  {
    title: "1 · Create poll",
    body: "Set a title and choose between 2 and 10 options. The creator becomes the poll admin.",
    who: "Anyone",
  },
  {
    title: "2 · Mint tickets",
    body: "The admin issues one compressed voter ticket per eligible wallet, so each person can vote exactly once.",
    who: "Admin only",
  },
  {
    title: "3 · Cast vote",
    body: "A voter spends their ticket, records their choice, and increments the tally in a single transaction.",
    who: "Ticket holders",
  },
  {
    title: "4 · Close poll",
    body: "The admin closes the poll so no further votes can be accepted.",
    who: "Admin only",
  },
];

export function HowItWorks() {
  return (
    <section className="panel">
      <h2>How it works</h2>
      <div className="steps">
        {STEPS.map((step) => (
          <div className="step" key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <span className="badge">{step.who}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
